import { useState, useEffect } from "react";
import { X, RefreshCw } from "lucide-react";
import { Goal, GoalCategory, GoalRepeat, CATEGORY_META, REPEAT_META, DAY_LABELS } from "@/hooks/useGoals";
import { format } from "date-fns";

interface GoalDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (goal: Omit<Goal, "id" | "completed" | "completedDates" | "lastNotifiedDate">, addToCalendar: boolean) => void;
  onDelete?: (id: string) => void;
  editGoal?: Goal | null;
  initialDate?: string;
}

const CATEGORIES: GoalCategory[] = ["must-do", "should-do", "nice-to-have"];
const REPEATS: GoalRepeat[] = ["none", "daily", "weekdays", "weekly", "custom"];

const DEFAULT_MESSAGES: Record<GoalCategory, string> = {
  "must-do":      "This was a must-do goal and it's not done yet. Time to focus!",
  "should-do":    "You planned to do this today — don't let it slip!",
  "nice-to-have": "You wanted to do this. There's still time!",
};

export default function GoalDialog({ open, onClose, onSave, onDelete, editGoal, initialDate }: GoalDialogProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<GoalCategory>("must-do");
  const [date, setDate] = useState(initialDate ?? format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState("");
  const [repeat, setRepeat] = useState<GoalRepeat>("none");
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationMessage, setNotificationMessage] = useState(DEFAULT_MESSAGES["must-do"]);
  const [messageEdited, setMessageEdited] = useState(false);
  const [addToCalendar, setAddToCalendar] = useState(false);

  useEffect(() => {
    if (editGoal) {
      setTitle(editGoal.title);
      setCategory(editGoal.category);
      setDate(editGoal.date);
      setTime(editGoal.time ?? "");
      setRepeat(editGoal.repeat ?? "none");
      setRepeatDays(editGoal.repeatDays ?? []);
      setNotificationsEnabled(editGoal.notificationsEnabled);
      setNotificationMessage(editGoal.notificationMessage);
      setMessageEdited(true);
    } else {
      setTitle("");
      setCategory("must-do");
      setDate(initialDate ?? format(new Date(), "yyyy-MM-dd"));
      setTime("");
      setRepeat("none");
      setRepeatDays([]);
      setNotificationsEnabled(true);
      setNotificationMessage(DEFAULT_MESSAGES["must-do"]);
      setMessageEdited(false);
      setAddToCalendar(false);
    }
  }, [editGoal, initialDate, open]);

  function handleCategoryChange(c: GoalCategory) {
    setCategory(c);
    if (!messageEdited) setNotificationMessage(DEFAULT_MESSAGES[c]);
  }

  function toggleRepeatDay(dow: number) {
    setRepeatDays((prev) =>
      prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow].sort()
    );
  }

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (repeat === "custom" && repeatDays.length === 0) return;
    onSave({
      title: title.trim(),
      category,
      date,
      time: time || undefined,
      repeat,
      repeatDays: repeat === "custom" ? repeatDays : undefined,
      notificationsEnabled,
      notificationMessage,
    }, addToCalendar);
    onClose();
  }

  const isRepeating = repeat !== "none";

  const repeatDescription = () => {
    if (repeat === "daily") return "every day";
    if (repeat === "weekdays") return "Mon–Fri";
    if (repeat === "weekly") return `every ${format(new Date(date + "T00:00:00"), "EEEE")}`;
    if (repeat === "custom" && repeatDays.length > 0) return repeatDays.map((d) => DAY_LABELS[d]).join(", ");
    return "";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-card rounded-xl shadow-2xl w-full max-w-md mx-4 border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {editGoal ? "Edit Goal" : "New Goal"}
          </h2>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          <input
            autoFocus
            type="text"
            placeholder="Goal title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
            required
          />

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Category</label>
            <div className="flex gap-2">
              {CATEGORIES.map((c) => {
                const meta = CATEGORY_META[c];
                return (
                  <button key={c} type="button" onClick={() => handleCategoryChange(c)}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all
                      ${category === c ? `${meta.bg} ${meta.text} ${meta.border} border` : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">
              <span className="flex items-center gap-1.5"><RefreshCw size={11} /> Repeat</span>
            </label>
            <div className="grid grid-cols-5 gap-1">
              {REPEATS.map((r) => (
                <button key={r} type="button" onClick={() => setRepeat(r)}
                  className={`py-1.5 px-1 rounded-lg text-[11px] font-medium border transition-all leading-tight
                    ${repeat === r
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "border-border text-muted-foreground hover:bg-muted"}`}
                >
                  {REPEAT_META[r].label}
                </button>
              ))}
            </div>

            {repeat === "custom" && (
              <div className="mt-2.5">
                <label className="block text-xs text-muted-foreground mb-1.5">Pick which days</label>
                <div className="flex gap-1">
                  {DAY_LABELS.map((label, dow) => (
                    <button
                      key={dow}
                      type="button"
                      onClick={() => toggleRepeatDay(dow)}
                      className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold border transition-all
                        ${repeatDays.includes(dow)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:bg-muted"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {repeatDays.length === 0 && (
                  <p className="text-[11px] text-destructive mt-1">Select at least one day</p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {isRepeating ? "Start Date" : "Target Date"}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {isRepeating ? "Daily due time" : "Due Time (optional)"}
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
              />
            </div>
          </div>

          {isRepeating && repeatDescription() && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary/80">
              Repeats <strong>{repeatDescription()}</strong> starting {format(new Date(date + "T00:00:00"), "MMM d")}. Progress resets each day.
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">Notifications</div>
                <div className="text-xs text-muted-foreground">Alert me if this goal isn't done</div>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsEnabled((v) => !v)}
                className={`relative w-10 h-5.5 rounded-full transition-colors ${notificationsEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform ${notificationsEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
            {notificationsEnabled && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Custom notification message</label>
                <textarea
                  value={notificationMessage}
                  onChange={(e) => { setNotificationMessage(e.target.value); setMessageEdited(true); }}
                  placeholder="Message to show when this goal is missed..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition resize-none"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            {editGoal && onDelete && (
              <button type="button" onClick={() => { onDelete(editGoal.id); onClose(); }}
                className="px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                Delete
              </button>
            )}
            <div className="flex-1" />
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-secondary-foreground bg-secondary hover:bg-secondary/80 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || (repeat === "custom" && repeatDays.length === 0)}
              className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {editGoal ? "Save" : "Add Goal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
