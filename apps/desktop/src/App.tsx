import { useState, useCallback, useEffect, useRef } from "react";
import { format, addMonths, addDays, getISOWeek } from "date-fns";
import { Plus, ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import MonthView from "@/components/MonthView";
import DayView from "@/components/DayView";
import WeekView from "@/components/WeekView";
import AgendaView from "@/components/AgendaView";
import TodayPanel from "@/components/TodayPanel";
import GoalsPanel from "@/components/GoalsPanel";
import WidgetManager from "@/components/WidgetManager";
import CalendarSettings from "@/components/CalendarSettings";
import SearchModal from "@/components/SearchModal";
import EventDialog from "@/components/EventDialog";
import GoalDialog from "@/components/GoalDialog";
import Sidebar, { nextSidebarMode, sidebarRootClass, type SidebarMode, type Section } from "@/components/shell/Sidebar";
import { CheatSheet } from "@/components/shell/Shortcuts";
import type { CalendarView } from "@/components/calendar/types";
import { useEvents, type CalendarEvent } from "@/hooks/useEvents";
import { useGoals } from "@/hooks/useGoals";
import { useAuth } from "@/hooks/useAuth";
import { useCreateGoal } from "@/hooks/useCreateGoal";
import { useNow } from "@/hooks/useNow";
import { supabase } from "@/lib/supabase";
import { requestWidgetExport } from "@/lib/widgetExportBus";
import AuthScreen from "@/components/AuthScreen";
import { Toaster } from "sonner";
export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [section, setSection] = useState<Section>("today");
  const [view, setView] = useState<CalendarView>("week");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitialDate, setDialogInitialDate] = useState<string | undefined>();
  const [dialogInitialTime, setDialogInitialTime] = useState<string | undefined>();
  const [dialogInitialEnd, setDialogInitialEnd] = useState<string | undefined>();
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("");
  const [cheatOpen, setCheatOpen] = useState(false);
  const createGoal = useCreateGoal();
  const now = useNow();
  const { events, addEvent, updateEvent, deleteEvent } = useEvents();
  const { goals, toggleComplete } = useGoals();
  // Handle OAuth callback from URL hash (e.g. email confirmation)
  useEffect(() => {
    async function processHash() {
      const hash = window.location.hash;
      if (hash && hash.includes("access_token=")) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken ?? "",
          });
          if (!error) {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          }
        }
      }
    }
    processHash();
  }, []);

  // Handle deep-link auth callbacks on Tauri
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).__TAURI_INTERNALS__) return;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
        unsub = await onOpenUrl((urls: string[]) => {
          for (const urlStr of urls) {
            if (urlStr.includes("access_token=")) {
              const url = new URL(urlStr);
              const params = new URLSearchParams(url.hash.substring(1));
              const accessToken = params.get("access_token");
              const refreshToken = params.get("refresh_token");
              if (accessToken) {
                supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken ?? "",
                });
              }
            } else if (urlStr.includes("facta://focus")) {
              // Show and focus main window
              import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
                const win = getCurrentWindow();
                win.show();
                win.setFocus();
              }).catch(() => {});
            }
          }
        });
      } catch {
        // ignore if deep-link plugin not available
      }
    })();
    return () => { unsub?.(); };
  }, []);


  // Widget export: every data mutation triggers an export via the shared bus
  // (debounced/coalesced); WidgetManager config changes call it directly.
  const triggerWidgetExport = requestWidgetExport;

  // Export once on mount so the shared file is fresh right after app start
  useEffect(() => {
    if (typeof window === "undefined" || !((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)) return;
    requestWidgetExport();
  }, []);

  // Process widget toggle actions from floating widgets
  const appliedActionIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (typeof window === "undefined" || !((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)) return;
    type WidgetAction = { type: string; goal_id: string; id?: string };
    function apply(actions: WidgetAction[]) {
      for (const action of actions) {
        if (action.type !== "toggle_goal" || !action.goal_id) continue;
        // Guard against rare double-delivery of the same queued action.
        const actionId = action.id ?? `${action.type}_${action.goal_id}`;
        if (appliedActionIds.current.has(actionId)) continue;
        appliedActionIds.current.add(actionId);
        toggleComplete(action.goal_id);
      }
    }
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const { listen } = await import("@tauri-apps/api/event");
        const un = await listen<WidgetAction[]>("widget-actions", (e) => apply(e.payload));
        if (cancelled) { un(); return; }
        unlisten = un;
        // Pick up anything queued before this window started listening.
        apply((await invoke("read_pending_actions")) as WidgetAction[]);
      } catch (e) {
        console.error("[ActionApply] failed:", e);
      }
    })();
    return () => { cancelled = true; unlisten?.(); };
  }, [toggleComplete]);

  const openNew = useCallback((date?: string, time?: string, endTime?: string) => {
    setEditingEvent(null);
    setDialogInitialDate(date ?? format(selectedDate, "yyyy-MM-dd"));
    setDialogInitialTime(time);
    setDialogInitialEnd(endTime);
    setDialogOpen(true);
  }, [selectedDate]);

  // New goal from Today's header, or for a specific day from Month/Week.
  const [goalDialogDate, setGoalDialogDate] = useState<string | null>(null);
  const openNewGoal = useCallback((date?: string) => {
    setGoalDialogDate(date ?? null);
    setGoalDialogOpen(true);
  }, []);

  const openEdit = useCallback((event: CalendarEvent) => {
    setEditingEvent(event);
    setDialogInitialDate(undefined);
    setDialogInitialTime(undefined);
    setDialogInitialEnd(undefined);
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback((data: Omit<CalendarEvent, "id">) => {
    if (editingEvent) {
      updateEvent(editingEvent.id, data);
    } else {
      addEvent(data);
    }
  }, [editingEvent, addEvent, updateEvent]);

  const navigate = useCallback((dir: -1 | 1) => {
    const next = view === "month" ? addMonths(selectedDate, dir)
      : addDays(selectedDate, dir * (view === "week" ? 7 : view === "agenda" ? 14 : 1));
    setSelectedDate(next);
    setCurrentMonth(next);
  }, [view, selectedDate]);

  const goToday = useCallback(() => {
    const today = new Date();
    setSelectedDate(today);
    setCurrentMonth(today);
  }, []);

  // Page shortcuts never act underneath a modal or while entering text.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (e.defaultPrevented || dialogOpen || goalDialogOpen || searchOpen || cheatOpen
        || target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setSearchOpen(true); return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "?") { e.preventDefault(); setCheatOpen(true); }
      else if (key === "/") { e.preventDefault(); setSearchOpen(true); }
      else if (section === "today" && key === "n") { e.preventDefault(); openNewGoal(); }
      else if (section === "calendar") {
        const views: Record<string, CalendarView> = { "1": "day", "2": "week", "3": "month", "4": "agenda" };
        if (views[key]) { e.preventDefault(); setView(views[key]); }
        else if (key === "n") { e.preventDefault(); openNew(); }
        else if (key === "g") { e.preventDefault(); openNewGoal(format(selectedDate, "yyyy-MM-dd")); }
        else if (key === "t") { e.preventDefault(); goToday(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [section, dialogOpen, goalDialogOpen, searchOpen, cheatOpen, openNew, openNewGoal, selectedDate, goToday]);

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-background text-foreground"><span className="text-sm text-muted-foreground">Loading…</span></div>;
  if (!user) return <AuthScreen />;

  const changeSection = (next: Section) => { setCheatOpen(false); setSection(next); };
  const openDay = (date: Date) => { setSelectedDate(date); setCurrentMonth(date); setView("day"); };

  return (
    <div className={`fx ${sidebarRootClass(sidebarMode)}`}>
      <Sidebar section={section} onSection={changeSection} onSearch={() => setSearchOpen(true)}
        onToggle={() => setSidebarMode((mode) => nextSidebarMode(mode, window.innerWidth))} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {section === "today" && <>
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border px-10 py-6">
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-xs tracking-[0.04em] text-subtle">WEEK {getISOWeek(now)}</span>
              <h1 className="m-0 text-[28px] font-semibold tracking-[-0.03em]">{format(now, "EEEE, d MMMM")}</h1>
            </div>
            <button type="button" onClick={() => openNewGoal()}
              className="flex h-[42px] items-center gap-2 rounded-[10px] bg-primary pl-3.5 pr-[18px] text-sm font-semibold text-primary-foreground hover:bg-accent-hover">
              <Plus aria-hidden="true" size={18} strokeWidth={2.4} />New goal
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden bg-background">
            <TodayPanel onNewEvent={openNew} onEditEvent={openEdit} />
          </div>
        </>}

        {/* Legacy views stay mounted until CalendarPage lands in step 2b. */}
        {section === "calendar" && <>
          <header className="hd">
            <h1>{view === "month" ? format(currentMonth, "MMMM yyyy") : view === "agenda" ? "Upcoming" : format(selectedDate, "EEEE, d MMMM")}</h1>
            <div className="flex items-center gap-1.5" role="group" aria-label="Navigate">
              <button type="button" className="ctl ctl-icon" aria-label="Previous period" onClick={() => navigate(-1)}><ChevronLeft size={16} /></button>
              <button type="button" className="ctl" onClick={goToday}>Today</button>
              <button type="button" className="ctl ctl-icon" aria-label="Next period" onClick={() => navigate(1)}><ChevronRight size={16} /></button>
            </div>
            <div className="flex-1" />
            <div className="seg" role="radiogroup" aria-label="Calendar view">
              {(["day", "week", "month", "agenda"] as const).map((id, i) => <button key={id} type="button" role="radio" aria-checked={view === id}
                title={`${id[0].toUpperCase() + id.slice(1)} (${i + 1})`} onClick={() => setView(id)}>
                {id[0].toUpperCase() + id.slice(1)}<span className="mono">{i + 1}</span>
              </button>)}
            </div>
            <button type="button" className="ctl" onClick={() => openNew()}><Plus size={16} />New event</button>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden bg-background">
            {view === "month" && <MonthView currentMonth={currentMonth} selectedDate={selectedDate} events={events}
              onSelectDate={setSelectedDate} onNavigate={(d) => { setSelectedDate(d); setCurrentMonth(d); }}
              onNewEvent={openNew} onNewGoal={openNewGoal} onEditEvent={openEdit} />}
            {view === "week" && <WeekView selectedDate={selectedDate} events={events} onSelectDate={openDay}
              onNavigate={(d) => { setSelectedDate(d); setCurrentMonth(d); }} onNewEvent={openNew} onNewGoal={openNewGoal} onEditEvent={openEdit} />}
            {view === "day" && <DayView selectedDate={selectedDate} events={events} onNewEvent={openNew} onEditEvent={openEdit} />}
            {view === "agenda" && <AgendaView events={events} goals={goals} onNewEvent={openNew} onEditEvent={openEdit} onToggleGoal={toggleComplete} />}
          </div>
        </>}
        {section === "goals" && <GoalsPanel />}
        {section === "settings" && <div className="flex-1 overflow-auto p-8">
          <h2 className="mb-6 text-xl font-semibold">Settings</h2>
          <div className="max-w-md space-y-4">
            <CalendarSettings /><WidgetManager onWidgetChange={triggerWidgetExport} />
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-2 text-sm font-medium">Account</h3>
              <p className="mb-3 text-xs text-muted-foreground">{user.email}</p>
              <button type="button" onClick={() => void signOut()} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10">
                <LogOut size={14} />Sign Out
              </button>
            </div>
          </div>
        </div>}
      </main>
      <GoalDialog open={goalDialogOpen} onClose={() => setGoalDialogOpen(false)} onSave={createGoal}
        initialDate={goalDialogDate ?? format(now, "yyyy-MM-dd")} />
      <EventDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditingEvent(null); }}
        onSave={handleSave} onDelete={deleteEvent} initialDate={dialogInitialDate} initialStartTime={dialogInitialTime}
        initialEndTime={dialogInitialEnd} editEvent={editingEvent} />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} events={events} goals={goals} onSelectEvent={openEdit}
        onGoToDate={(date, nextView) => { setSelectedDate(date); setCurrentMonth(date); setView(nextView); setSection("calendar"); }} />
      {cheatOpen && <CheatSheet context={section === "goals" ? "goals" : section === "today" ? "today" : "calendar"} onClose={() => setCheatOpen(false)} />}
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
