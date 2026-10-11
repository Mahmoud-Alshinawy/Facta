import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  format, addMonths, subMonths, startOfWeek, endOfWeek,
  addWeeks, subWeeks, addDays, parseISO, isToday,
} from "date-fns";
import {
  Plus, Calendar, LayoutGrid, CalendarDays, Sun, Flame, Moon,
  Target, List, Search, Clock, ChevronRight,
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
import SearchModal from "@/components/SearchModal";
import EventDialog from "@/components/EventDialog";
import { useEvents, CalendarEvent, COLOR_MAP } from "@/hooks/useEvents";
import { useGoals } from "@/hooks/useGoals";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { requestWidgetExport } from "@/lib/widgetExportBus";
import AuthScreen from "@/components/AuthScreen";
import { Toaster } from "sonner";

type View = "today" | "month" | "week" | "day" | "agenda";
type Section = "calendar" | "goals" | "settings";

type ThemeMode = "light" | "midnight" | "ember";

function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem("facta_theme");
      if (stored === "midnight" || stored === "ember") return stored;
      return "light";
    } catch { return "light"; }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "ember");
    if (mode === "midnight") {
      root.classList.add("dark");
    } else if (mode === "ember") {
      root.classList.add("ember");
    }
    try { localStorage.setItem("facta_theme", mode); } catch {}
  }, [mode]);

  const themeIcon = mode === "ember" ? <Flame size={15} /> : mode === "midnight" ? <Moon size={15} /> : <Sun size={15} />;
  const themeLabel = mode === "ember" ? "Ember" : mode === "midnight" ? "Midnight" : "Light";

  return { mode, setMode, themeIcon, themeLabel };
}

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [section, setSection] = useState<Section>("calendar");
  const [view, setView] = useState<View>("today");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitialDate, setDialogInitialDate] = useState<string | undefined>();
  const [dialogInitialTime, setDialogInitialTime] = useState<string | undefined>();
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const { events, addEvent, updateEvent, deleteEvent } = useEvents();
  const { goals, markNotified, toggleComplete } = useGoals();
  const goalsRef = useRef<ReturnType<typeof useGoals>["goals"]>(goals);
  useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);
  const { mode, setMode, themeIcon, themeLabel } = useTheme();

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

  // Close theme dropdown on click outside
  useEffect(() => {
    if (!themeOpen) return;
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".relative")) setThemeOpen(false);
    }
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [themeOpen]);

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

  const openNew = useCallback((date?: string, time?: string) => {
    setEditingEvent(null);
    setDialogInitialDate(date ?? format(selectedDate, "yyyy-MM-dd"));
    setDialogInitialTime(time);
    setDialogOpen(true);
  }, [selectedDate]);

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

  const headerLabel = useCallback(() => {
    if (view === "today") return "Today";
    if (view === "month") return format(currentMonth, "MMMM yyyy");
    if (view === "agenda") return "Upcoming";
    if (view === "week") {
      const ws = startOfWeek(selectedDate, { weekStartsOn: 0 });
      const we = endOfWeek(selectedDate, { weekStartsOn: 0 });
      return `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`;
    }
    return format(selectedDate, "EEEE, MMMM d, yyyy");
  }, [view, currentMonth, selectedDate]);

  const overdueGoals = useMemo(() => goals.filter(
    (g) => !g.completed && (g.repeat ?? "none") === "none" &&
      new Date(g.date) < new Date(new Date().toDateString())
  ), [goals]);

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
        openNew(format(selectedDate, "yyyy-MM-dd"));
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
  }, [section, selectedDate, openNew, goToday]);

  const navItems = useMemo(() => {
    const items: { id: Section; label: string; icon: React.ReactNode; badge?: number }[] = [
      { id: "calendar", label: "Calendar", icon: <Calendar size={15} /> },
      { id: "goals",    label: "Goals",    icon: <Target size={15} />, badge: overdueGoals.length || undefined },
      { id: "settings", label: "Settings", icon: <Settings size={15} /> },
    ];
    return items;
  }, [overdueGoals.length]);

  const calendarViews = useMemo(() => [
    { id: "today" as View,  icon: <Sun size={13} />,         label: "Today",  shortcut: "1" },
    { id: "month" as View,  icon: <LayoutGrid size={13} />,  label: "Month",  shortcut: "2" },
    { id: "week" as View,   icon: <Calendar size={13} />,    label: "Week",   shortcut: "3" },
    { id: "day" as View,    icon: <CalendarDays size={13} />, label: "Day",   shortcut: "4" },
    { id: "agenda" as View, icon: <List size={13} />,         label: "Agenda", shortcut: "5" },
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
      <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-[hsl(var(--sidebar))]">
        <div className="px-4 pt-5 pb-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <img src="/icon.png" alt="Facta" className="w-5 h-5 rounded" />
              <span className="text-base font-semibold text-foreground">Facta</span>
            </div>
            <button
              onClick={() => setSearchOpen(true)}
              title="Search (/ or Ctrl+K)"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--sidebar-accent))] transition-colors"
            >
              <Search size={14} />
            </button>
          </div>

          <div className="flex flex-col gap-0.5 mb-3">
            {navItems.map(({ id, label, icon, badge }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${section === id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--sidebar-accent))]"
                  }`}
              >
                {icon}
                {label}
                {badge ? (
                  <span className="ml-auto bg-muted text-muted-foreground text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {section === "calendar" && (
            <button
              onClick={() => openNew()}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus size={15} />
              New Event
              <kbd className="ml-auto text-[9px] font-mono opacity-60 border border-primary-foreground/30 rounded px-1">N</kbd>
            </button>
          )}
        </div>

        {section === "calendar" && (
          <div className="px-3 pb-2">
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
        {section === "calendar" && upcomingEvents.length > 0 && (
          <div className="px-4 pt-1 pb-2">
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
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-left"
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

        <div className="mt-auto px-3 pb-4 space-y-1">
          <div className="relative">
            <button
              onClick={() => setThemeOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--sidebar-accent))] transition-colors"
            >
              {themeIcon}
              {themeLabel}
            </button>
            {themeOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg p-1 z-50">
                {(["light", "midnight", "ember"] as ThemeMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setThemeOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                      mode === m ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {m === "ember" ? <Flame size={13} /> : m === "midnight" ? <Moon size={13} /> : <Sun size={13} />}
                    {m === "ember" ? "Ember" : m === "midnight" ? "Midnight" : "Light"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {section === "calendar" && (
          <>
            <header className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card shrink-0">
              {view !== "today" && view !== "agenda" && (
                <button
                  onClick={goToday}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                >
                  Today
                </button>
              )}

              {(view === "month" || view === "week" || view === "day") && (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => navigate(-1)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => navigate(1)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              )}

              <h1 className="text-base font-semibold text-foreground">
                {headerLabel()}
              </h1>

              <button
                onClick={() => setSearchOpen(true)}
                className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted text-sm transition-colors"
              >
                <Search size={13} />
                <span className="text-xs">Search</span>
                <kbd className="text-[9px] font-mono border border-border rounded px-1 py-0.5">⌘K</kbd>
              </button>

              <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
                {calendarViews.map(({ id, icon, label, shortcut }) => (
                  <button
                    key={id}
                    onClick={() => { setView(id); if (id !== "today" && id !== "agenda") goToday(); }}
                    title={`${label} (${shortcut})`}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors
                      ${view === id
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            </header>

            <div className="flex-1 overflow-hidden bg-background">
              {view === "today" && (
                <TodayPanel
                  events={events}
                  goals={goals}
                  onNewEvent={(date, time) => openNew(date, time)}
                  onEditEvent={openEdit}
                  onToggleGoal={toggleComplete}
                  onGoToDay={() => { setView("day"); goToday(); }}
                />
              )}
              {view === "month" && (
                <MonthView
                  currentMonth={currentMonth}
                  selectedDate={selectedDate}
                  events={events}
                  onSelectDate={(d) => { setSelectedDate(d); setView("day"); }}
                  onNewEvent={(date) => openNew(date)}
                  onEditEvent={openEdit}
                />
              )}
              {view === "week" && (
                <WeekView
                  selectedDate={selectedDate}
                  events={events}
                  onSelectDate={(d) => { setSelectedDate(d); setView("day"); }}
                  onNewEvent={(date, time) => openNew(date, time)}
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
              <WidgetManager onWidgetChange={triggerWidgetExport} />
              <div className="p-4 rounded-xl border border-border bg-card">
                <h3 className="text-sm font-medium mb-2">Account</h3>
                <p className="text-xs text-muted-foreground mb-3">{user.email}</p>
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <EventDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingEvent(null); }}
        onSave={handleSave}
        onDelete={deleteEvent}
        initialDate={dialogInitialDate}
        initialStartTime={dialogInitialTime}
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
