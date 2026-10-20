import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  format, addMonths, subMonths,
  addWeeks, subWeeks, addDays, parseISO, isToday, getISOWeek,
} from "date-fns";
import {
  Plus, Calendar, Target, Search, Clock, ChevronLeft, ChevronRight,
  Settings, LogOut,
} from "lucide-react";
import MiniCalendar from "@/components/MiniCalendar";
import MonthView from "@/components/MonthView";
import DayView from "@/components/DayView";
import WeekView from "@/components/WeekView";
import AgendaView from "@/components/AgendaView";
import TodayPanel from "@/components/TodayPanel";
import GoalsPanel from "@/components/GoalsPanel";
import WidgetManager from "@/components/WidgetManager";
import CalendarSettings from "@/components/CalendarSettings";
import { usePrefs } from "@/hooks/usePrefs";
import SearchModal from "@/components/SearchModal";
import EventDialog from "@/components/EventDialog";
import { useEvents, CalendarEvent, COLOR_MAP } from "@/hooks/useEvents";
import { useGoals } from "@/hooks/useGoals";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { requestWidgetExport } from "@/lib/widgetExportBus";
import AuthScreen from "@/components/AuthScreen";
import SyncStatusBadge from "@/components/SyncStatusBadge";
import Logo from "@/components/Logo";
import ThemeDots from "@/components/ThemeDots";
import GoalDialog from "@/components/GoalDialog";
import { useCreateGoal } from "@/hooks/useCreateGoal";
import { useNow } from "@/hooks/useNow";
import { overdueGoals as findOverdueGoals } from "@/lib/goalDates";
import { Toaster } from "sonner";

type View = "today" | "month" | "week" | "day" | "agenda";
type Section = "calendar" | "goals" | "settings";

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [section, setSection] = useState<Section>("calendar");
  const [view, setView] = useState<View>("today");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitialDate, setDialogInitialDate] = useState<string | undefined>();
  const [dialogInitialTime, setDialogInitialTime] = useState<string | undefined>();
  const [dialogInitialEnd, setDialogInitialEnd] = useState<string | undefined>();
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const createGoal = useCreateGoal();
  const now = useNow();
  const { events, addEvent, updateEvent, deleteEvent } = useEvents();
  const { goals, markNotified, toggleComplete } = useGoals();
  const goalsRef = useRef<ReturnType<typeof useGoals>["goals"]>(goals);
  useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);

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
    if (view === "month") {
      const next = dir === 1 ? addMonths(currentMonth, 1) : subMonths(currentMonth, 1);
      setCurrentMonth(next);
    } else if (view === "week") {
      const next = dir === 1 ? addWeeks(selectedDate, 1) : subWeeks(selectedDate, 1);
      setSelectedDate(next);
    } else {
      const next = addDays(selectedDate, dir);
      setSelectedDate(next);
      setCurrentMonth(next);
    }
  }, [view, currentMonth, selectedDate]);

  const goToday = useCallback(() => {
    const now = new Date();
    setSelectedDate(now);
    setCurrentMonth(now);
  }, []);

  // Today, Month and Week show today's date in the header; Month and Week
  // have their own toolbar for the period they show.
  const headerLabel = useCallback(() => {
    if (view === "today" || view === "month" || view === "week") return format(now, "EEEE, d MMMM");
    if (view === "agenda") return "Upcoming";
    return format(selectedDate, "EEEE, MMMM d, yyyy");
  }, [view, selectedDate, now]);

  const weekLabel =
    view === "today" || view === "month" || view === "week" ? `WEEK ${getISOWeek(now)}`
    : view === "day" ? `WEEK ${getISOWeek(selectedDate)}`
    : null;

  const overdueGoals = useMemo(() => findOverdueGoals(goals, now), [goals, now]);

  const upcomingEvents = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return events
      .filter((e) => {
        if (e.date > today) return true;
        if (e.date === today && !e.allDay) {
          const [h, m] = e.startTime.split(":").map(Number);
          return (h * 60 + m) >= nowMin;
        }
        return false;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startTime.localeCompare(b.startTime);
      })
      .slice(0, 4);
  }, [events]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" && section === "calendar") {
        // The dialog focuses its title field before this keystroke finishes;
        // without preventDefault the "n" would be typed into it.
        e.preventDefault();
        // N matches the header's primary button: New goal on Today, New event elsewhere.
        if (view === "today") openNewGoal();
        else openNew(format(selectedDate, "yyyy-MM-dd"));
      }
      if (e.key === "t") {
        goToday();
        setView("today");
      }
      if (e.key === "1") setView("today");
      if (e.key === "2") setView("month");
      if (e.key === "3") setView("week");
      if (e.key === "4") setView("day");
      if (e.key === "5") setView("agenda");
      if (e.key === "/") { e.preventDefault(); setSearchOpen(true); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [section, view, selectedDate, openNew, goToday]);

  const navItems = useMemo(() => {
    const items: { id: Section; label: string; icon: React.ReactNode; badge?: number }[] = [
      { id: "calendar", label: "Calendar", icon: <Calendar aria-hidden="true" size={18} /> },
      { id: "goals",    label: "Goals",    icon: <Target aria-hidden="true" size={18} />, badge: overdueGoals.length || undefined },
      { id: "settings", label: "Settings", icon: <Settings aria-hidden="true" size={18} /> },
    ];
    return items;
  }, [overdueGoals.length]);

  const calendarViews = useMemo(() => [
    { id: "today" as View,  label: "Today",  shortcut: "1" },
    { id: "month" as View,  label: "Month",  shortcut: "2" },
    { id: "week" as View,   label: "Week",   shortcut: "3" },
    { id: "day" as View,    label: "Day",    shortcut: "4" },
    { id: "agenda" as View, label: "Agenda", shortcut: "5" },
  ], []);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-[248px] shrink-0 flex flex-col gap-6 px-4 pt-6 pb-5 bg-card border-r border-border overflow-y-auto">
        <div className="flex items-center gap-2.5 px-2">
          <Logo size={30} />
          <span className="text-[19px] font-bold tracking-[-0.03em]">Facta</span>
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="relative flex h-10 w-full items-center gap-2 rounded-[10px] border border-input bg-background pl-3 pr-2 text-left text-sm text-subtle hover:text-text-2"
        >
          <Search aria-hidden="true" size={16} />
          <span className="flex-1">Search</span>
          <kbd className="rounded-[5px] border border-b-2 border-border-strong bg-raised px-[5px] py-[3px] font-mono text-[11px] leading-none text-subtle">/</kbd>
          <kbd className="rounded-[5px] border border-b-2 border-border-strong bg-raised px-[5px] py-[3px] font-mono text-[11px] leading-none text-subtle">Ctrl K</kbd>
        </button>

        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {navItems.map(({ id, label, icon, badge }) => {
            const on = section === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => setSection(id)}
                className={`flex h-10 items-center gap-3 rounded-[9px] px-3 text-left text-sm transition-colors hover:bg-raised ${
                  on ? "bg-raised font-medium text-foreground" : "text-text-2"
                }`}
              >
                {icon}
                <span className="flex-1">{label}</span>
                {badge ? (
                  <span className="rounded-md bg-raised-2 px-1.5 py-0.5 font-mono text-[11px] text-text-2" title={`${badge} overdue`}>
                    {badge}
                  </span>
                ) : on ? (
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
                ) : null}
              </button>
            );
          })}
        </nav>

        {section === "calendar" && view !== "today" && (
          <div className="px-1">
            <MiniCalendar
              currentMonth={currentMonth}
              selectedDate={selectedDate}
              events={events}
              onSelectDate={(d) => {
                setSelectedDate(d);
                setCurrentMonth(d);
                setView("day");
              }}
              onMonthChange={setCurrentMonth}
            />
          </div>
        )}

        {/* Upcoming widget */}
        {section === "calendar" && view !== "today" && upcomingEvents.length > 0 && (
          <div className="px-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Upcoming</span>
              <button
                onClick={() => setView("agenda")}
                className="text-[10px] text-primary hover:underline font-medium flex items-center gap-0.5"
              >
                All <ChevronRight size={10} />
              </button>
            </div>
            <div className="space-y-1">
              {upcomingEvents.map((e) => {
                const colors = COLOR_MAP[e.color];
                const isEToday = isToday(parseISO(e.date));
                return (
                  <button
                    key={e.id}
                    onClick={() => { openEdit(e); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-raised transition-colors text-left"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
                    <span className="text-xs text-foreground truncate flex-1">{e.title}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                      <Clock size={9} />
                      {isEToday ? e.startTime : format(parseISO(e.date), "MMM d")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3.5">
          <ThemeDots />
          <div className="border-t border-border">
            <SyncStatusBadge />
          </div>
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {section === "calendar" && (
          <>
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border px-10 py-6">
              <div className="flex items-center gap-3">
                {view === "day" && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => navigate(-1)}
                      aria-label="Previous"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-text-2 hover:bg-raised-2 hover:text-foreground"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(1)}
                      aria-label="Next"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-text-2 hover:bg-raised-2 hover:text-foreground"
                    >
                      <ChevronRight size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={goToday}
                      className="ml-1 h-8 rounded-lg border border-input px-3 text-[13px] font-medium hover:bg-raised-2"
                    >
                      Today
                    </button>
                  </div>
                )}
                <div className="flex flex-col gap-0.5">
                  {weekLabel && (
                    <span className="font-mono text-xs tracking-[0.04em] text-subtle">{weekLabel}</span>
                  )}
                  <h1 className="m-0 text-[28px] font-semibold tracking-[-0.03em]">{headerLabel()}</h1>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div role="group" aria-label="View" className="flex gap-0.5 rounded-[11px] border border-border bg-card p-[3px]">
                  {calendarViews.map(({ id, label, shortcut }) => {
                    const on = view === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => { setView(id); if (id !== "today" && id !== "agenda") goToday(); }}
                        title={`${label} (${shortcut})`}
                        className={`flex h-[34px] items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                          on ? "bg-raised-2 text-foreground" : "text-text-2 hover:text-foreground"
                        }`}
                      >
                        <span>{label}</span>
                        <span className="font-mono text-[11px] text-subtle">{shortcut}</span>
                      </button>
                    );
                  })}
                </div>
                {view === "today" ? (
                  <button
                    type="button"
                    onClick={() => openNewGoal()}
                    className="flex h-[42px] items-center gap-2 rounded-[10px] bg-primary pl-3.5 pr-[18px] text-sm font-semibold text-primary-foreground hover:bg-accent-hover"
                  >
                    <Plus aria-hidden="true" size={18} strokeWidth={2.4} />
                    New goal
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openNew()}
                    className="flex h-[42px] items-center gap-2 rounded-[10px] bg-primary pl-3.5 pr-[18px] text-sm font-semibold text-primary-foreground hover:bg-accent-hover"
                  >
                    <Plus aria-hidden="true" size={18} strokeWidth={2.4} />
                    New event
                  </button>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-hidden bg-background">
              {view === "today" && (
                <TodayPanel
                  onNewEvent={(date, time) => openNew(date, time)}
                  onEditEvent={openEdit}
                />
              )}
              {view === "month" && (
                <MonthView
                  currentMonth={currentMonth}
                  selectedDate={selectedDate}
                  events={events}
                  onSelectDate={(d) => setSelectedDate(d)}
                  onNavigate={(d) => { setSelectedDate(d); setCurrentMonth(d); }}
                  onNewEvent={(date) => openNew(date)}
                  onNewGoal={openNewGoal}
                  onEditEvent={openEdit}
                />
              )}
              {view === "week" && (
                <WeekView
                  selectedDate={selectedDate}
                  events={events}
                  onSelectDate={(d) => { setSelectedDate(d); setView("day"); }}
                  onNavigate={(d) => { setSelectedDate(d); setCurrentMonth(d); }}
                  onNewEvent={(date, time, endTime) => openNew(date, time, endTime)}
                  onNewGoal={openNewGoal}
                  onEditEvent={openEdit}
                />
              )}
              {view === "day" && (
                <DayView
                  selectedDate={selectedDate}
                  events={events}
                  onNewEvent={(date, time) => openNew(date, time)}
                  onEditEvent={openEdit}
                />
              )}
              {view === "agenda" && (
                <AgendaView
                  events={events}
                  goals={goals}
                  onNewEvent={(date, time) => openNew(date, time)}
                  onEditEvent={openEdit}
                  onToggleGoal={toggleComplete}
                />
              )}
            </div>
          </>
        )}

        {section === "goals"    && <GoalsPanel />}
        {section === "settings" && (
          <div className="flex-1 overflow-auto p-8">
            <h2 className="text-xl font-semibold mb-6">Settings</h2>
            <div className="max-w-md space-y-4">
              <CalendarSettings />
              <WidgetManager onWidgetChange={triggerWidgetExport} />
              <div className="p-4 rounded-xl border border-border bg-card">
                <h3 className="text-sm font-medium mb-2">Account</h3>
                <p className="text-xs text-muted-foreground mb-3">{user.email}</p>
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <GoalDialog
        open={goalDialogOpen}
        onClose={() => setGoalDialogOpen(false)}
        onSave={createGoal}
        initialDate={goalDialogDate ?? format(now, "yyyy-MM-dd")}
      />

      <EventDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingEvent(null); }}
        onSave={handleSave}
        onDelete={deleteEvent}
        initialDate={dialogInitialDate}
        initialStartTime={dialogInitialTime}
        initialEndTime={dialogInitialEnd}
        editEvent={editingEvent}
      />

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        events={events}
        goals={goals}
        onSelectEvent={openEdit}
        onGoToDate={(date, v) => {
          setSelectedDate(date);
          setCurrentMonth(date);
          setView(v);
          setSection("calendar");
        }}
      />
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
