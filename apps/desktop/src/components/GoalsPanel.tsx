import { useState, useMemo } from "react";
import { format, isToday, isPast, parseISO, startOfDay } from "date-fns";
import {
  Plus, Bell, BellOff, CheckCircle2, Circle, Target,
  ChevronDown, ChevronRight, RefreshCw,
} from "lucide-react";
import {
  Goal, GoalCategory, CATEGORY_META, REPEAT_META,
  isCompletedToday, isActiveToday, useGoals,
} from "@/hooks/useGoals";
import { useNotifications } from "@/hooks/useNotifications";
import { useEvents } from "@/hooks/useEvents";
import GoalDialog from "@/components/GoalDialog";

const ORDER: GoalCategory[] = ["must-do", "should-do", "nice-to-have"];
const sortByCategory = (a: Goal, b: Goal) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category);

function groupGoals(goals: Goal[]) {
  const recurring: Goal[] = [];
  const today: Goal[] = [];
  const upcoming: Goal[] = [];
  const overdue: Goal[] = [];
  const done: Goal[] = [];

  for (const g of goals) {
    const repeat = g.repeat ?? "none";

    if (repeat !== "none") {
      if (isActiveToday(g)) recurring.push(g);
      continue;
    }

    if (g.completed) { done.push(g); continue; }

    const d = parseISO(g.date);
    if (isToday(d)) today.push(g);
    else if (isPast(startOfDay(d))) overdue.push(g);
    else upcoming.push(g);
  }

  return {
    recurring: recurring.sort(sortByCategory),
    overdue: overdue.sort(sortByCategory),
    today: today.sort(sortByCategory),
    upcoming: upcoming.sort(sortByCategory),
    done: done.slice(-15).reverse(),
  };
}

interface GoalItemProps {
  goal: Goal;
  onToggle: () => void;
  onEdit: () => void;
  onTestNotification: () => void;
}

function GoalItem({ goal, onToggle, onEdit, onTestNotification }: GoalItemProps) {
  const meta = CATEGORY_META[goal.category];
  const repeat = goal.repeat ?? "none";
  const completedToday = isCompletedToday(goal);
  const isRecurring = repeat !== "none";

  return (
    <div
      className={`group flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer
        ${completedToday
          ? "opacity-50 bg-muted/20 border-border/50"
          : "bg-card border-border hover:border-primary/30 hover:shadow-sm"
        }`}
      onClick={onEdit}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`mt-0.5 shrink-0 transition-colors ${completedToday ? "text-green-500" : "text-muted-foreground hover:text-primary"}`}
      >
        {completedToday ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${completedToday ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {goal.title}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>
            {meta.label}
          </span>
          {isRecurring && (
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-primary/70 bg-primary/8 px-1.5 py-0.5 rounded-full border border-primary/15">
              <RefreshCw size={9} />
              {REPEAT_META[repeat].short}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {isRecurring ? (
            <span className="text-xs text-muted-foreground">Repeats {REPEAT_META[repeat].label.toLowerCase()}</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {format(parseISO(goal.date), "MMM d")}
              {goal.time ? ` at ${goal.time}` : ""}
            </span>
          )}
          {goal.notificationsEnabled
            ? <Bell size={11} className="text-muted-foreground" />
            : <BellOff size={11} className="text-muted-foreground/40" />
          }
        </div>
      </div>

      {goal.notificationsEnabled && !completedToday && (
        <button
          onClick={(e) => { e.stopPropagation(); onTestNotification(); }}
          title="Send test notification"
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all text-[10px] font-medium"
        >
          Test
        </button>
      )}
    </div>
  );
}

interface SectionProps {
  title: string;
  subtitle?: string;
  goals: Goal[];
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  onToggle: (id: string) => void;
  onEdit: (goal: Goal) => void;
  onTestNotification: (goal: Goal) => void;
}

function Section({ title, subtitle, goals, icon, defaultOpen = true, onToggle, onEdit, onTestNotification }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (goals.length === 0) return null;

  const doneCount = goals.filter((g) => isCompletedToday(g)).length;
  const hasProgress = goals.some((g) => (g.repeat ?? "none") !== "none");

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 w-full text-xs font-semibold uppercase tracking-wide mb-2 text-muted-foreground"
      >
        {icon}
        {title}
        <span className="font-normal">
          {hasProgress ? ` (${doneCount}/${goals.length})` : ` (${goals.length})`}
        </span>
        {subtitle && <span className="font-normal normal-case ml-1 text-muted-foreground/60">{subtitle}</span>}
        <span className="ml-auto">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
      </button>
      {open && (
        <div className="space-y-2 mb-4">
          {goals.map((g) => (
            <GoalItem
              key={g.id}
              goal={g}
              onToggle={() => onToggle(g.id)}
              onEdit={() => onEdit(g)}
              onTestNotification={() => onTestNotification(g)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const CATEGORY_EVENT_COLOR: Record<GoalCategory, import("@/hooks/useEvents").EventColor> = {
  "must-do": "red",
  "should-do": "orange",
  "nice-to-have": "blue",
};

function addHour(time: string) {
  const [h, m] = time.split(":").map(Number);
  const nh = (h + 1) % 24;
  return `${String(nh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function GoalsPanel() {
  const { goals, addGoal, updateGoal, deleteGoal, toggleComplete, markNotified } = useGoals();
  const { addEvent } = useEvents();
  const { permission, requestPermission, sendNotification } = useNotifications(goals, markNotified);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const grouped = useMemo(() => groupGoals(goals), [goals]);
  const todayStr = format(new Date(), "MMM d");

  function openNew() { setEditingGoal(null); setDialogOpen(true); }
  function openEdit(goal: Goal) { setEditingGoal(goal); setDialogOpen(true); }

  function handleSave(
    data: Omit<Goal, "id" | "completed" | "completedDates" | "lastNotifiedDate">,
    addToCalendar = false,
  ) {
    if (editingGoal) {
      updateGoal(editingGoal.id, data);
    } else {
      const newGoal = addGoal(data);
      if (addToCalendar) {
        const start = data.time ?? "09:00";
        addEvent({
          title: data.title,
          date: data.date,
          startTime: start,
          endTime: addHour(start),
          color: CATEGORY_EVENT_COLOR[data.category],
          description: `Goal: ${data.title}`,
          allDay: false,
          repeat: "none",
        });
      }
    }
  }

  const totalGoals = goals.length;
  const isEmpty = totalGoals === 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-primary" />
          <h2 className="text-base font-semibold text-foreground">Goals</h2>
        </div>
        <div className="flex items-center gap-2">
          {permission !== "granted" && (
            <button onClick={requestPermission}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 transition-colors border border-amber-300/50">
              <Bell size={12} /> Enable notifications
            </button>
          )}
          {permission === "granted" && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <Bell size={12} /> Notifications on
            </span>
          )}
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
            <Plus size={14} /> New Goal
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-2">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Target size={40} className="text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No goals yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Add goals and get notified when you miss them</p>
            <button onClick={openNew}
              className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              Add your first goal
            </button>
          </div>
        )}

        <Section
          title="Daily Recurring"
          subtitle={todayStr}
          goals={grouped.recurring}
          icon={<RefreshCw size={11} />}
          onToggle={toggleComplete}
          onEdit={openEdit}
          onTestNotification={sendNotification}
        />
        <Section
          title="Overdue"
          goals={grouped.overdue}
          defaultOpen={false}
          onToggle={toggleComplete}
          onEdit={openEdit}
          onTestNotification={sendNotification}
        />
        <Section
          title="Today"
          goals={grouped.today}
          onToggle={toggleComplete}
          onEdit={openEdit}
          onTestNotification={sendNotification}
        />
        <Section
          title="Upcoming"
          goals={grouped.upcoming}
          defaultOpen={false}
          onToggle={toggleComplete}
          onEdit={openEdit}
          onTestNotification={sendNotification}
        />
        <Section
          title="Completed"
          goals={grouped.done}
          defaultOpen={false}
          onToggle={toggleComplete}
          onEdit={openEdit}
          onTestNotification={sendNotification}
        />
      </div>

      <GoalDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingGoal(null); }}
        onSave={handleSave}
        onDelete={deleteGoal}
        editGoal={editingGoal}
      />
    </div>
  );
}
