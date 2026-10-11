import { useState, useEffect } from "react";
import { X, Trash2, RefreshCw } from "lucide-react";
import { CalendarEvent, EventColor, EventRepeat, EVENT_REPEAT_META, EVENT_DAY_LABELS } from "@/hooks/useEvents";
import { format, parseISO } from "date-fns";

interface EventDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (event: Omit<CalendarEvent, "id">) => void;
  onDelete?: (id: string) => void;
  initialDate?: string;
  initialStartTime?: string;
  editEvent?: CalendarEvent | null;
}

const COLORS: { id: EventColor; dot: string; label: string }[] = [
  { id: "blue",   dot: "bg-blue-500",   label: "Blue"   },
  { id: "red",    dot: "bg-red-500",    label: "Red"    },
  { id: "green",  dot: "bg-green-500",  label: "Green"  },
  { id: "orange", dot: "bg-orange-500", label: "Orange" },
  { id: "purple", dot: "bg-purple-500", label: "Purple" },
  { id: "pink",   dot: "bg-pink-500",   label: "Pink"   },
];

function addOneHour(time: string): string {
  try {
    const [h, m] = time.split(":").map(Number);
    const next = (h + 1) % 24;
    return `${String(next).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  } catch {
    return "10:00";
  }
}

export default function EventDialog({
  open,
  onClose,
  onSave,
  onDelete,
  initialDate,
  initialStartTime,
  editEvent,
}: EventDialogProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate ?? format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState(initialStartTime ?? "09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [color, setColor] = useState<EventColor>("blue");
  const [description, setDescription] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [repeat, setRepeat] = useState<EventRepeat>("none");
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const REPEATS: EventRepeat[] = ["none", "daily", "weekdays", "weekly", "custom"];

  useEffect(() => {
    if (!open) { setConfirmDelete(false); return; }
    if (editEvent) {
      setTitle(editEvent.title);
      setDate(editEvent.date);
      setStartTime(editEvent.startTime);
      setEndTime(editEvent.endTime);
      setColor(editEvent.color);
      setDescription(editEvent.description ?? "");
      setAllDay(editEvent.allDay ?? false);
      setRepeat(editEvent.repeat ?? "none");
      setRepeatDays(editEvent.repeatDays ?? []);
    } else {
      const st = initialStartTime ?? "09:00";
      setTitle("");
      setDate(initialDate ?? format(new Date(), "yyyy-MM-dd"));
      setStartTime(st);
      setEndTime(addOneHour(st));
      setColor("blue");
      setDescription("");
      setAllDay(false);
      setRepeat("none");
      setRepeatDays([]);
    }
    setConfirmDelete(false);
  }, [editEvent, initialDate, initialStartTime, open]);

  function handleStartChange(val: string) {
    setStartTime(val);
    setEndTime(addOneHour(val));
  }

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), date, startTime, endTime, color, description, allDay, repeat: repeat === "none" ? undefined : repeat, repeatDays: repeat === "custom" ? repeatDays : undefined });
    onClose();
  }

  function handleDelete() {
    if (!editEvent || !onDelete) return;
    onDelete(editEvent.id);
    onClose();
  }

  const isEditing = !!editEvent;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">
            {isEditing ? "Edit Event" : "New Event"}
          </h2>
          <div className="flex items-center gap-1">
            {isEditing && onDelete && !confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                title="Delete event"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="px-5 py-4 bg-destructive/8 border-b border-destructive/20 shrink-0">
            <p className="text-sm font-medium text-destructive mb-3">Delete this event?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors"
              >
                Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
              >
                Keep it
              </button>
            </div>
          </div>
        )}

        {/* Scrollable form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Title */}
            <input
              autoFocus
              type="text"
              placeholder="Event title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
              required
            />

            {/* All day toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div
                onClick={() => setAllDay((v) => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${allDay ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${allDay ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <span className="text-sm text-foreground font-medium">All day</span>
            </label>

            {/* Date */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
              />
            </div>

            {/* Time */}
            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Start time</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => handleStartChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">End time</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
                  />
                </div>
              </div>
            )}

            {/* Color */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Color</label>
              <div className="flex gap-2.5">
                {COLORS.map(({ id, dot, label }) => (
                  <button
                    key={id}
                    type="button"
                    title={label}
                    onClick={() => setColor(id)}
                    className={`w-7 h-7 rounded-full ${dot} transition-all ${
                      color === id
                        ? "scale-125 ring-2 ring-offset-2 ring-primary/50"
                        : "opacity-60 hover:opacity-100 hover:scale-110"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Repeat */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <RefreshCw size={11} /> Repeat
              </label>
              <div className="flex gap-1">
                {REPEATS.map((r) => (
                  <button key={r} type="button" onClick={() => setRepeat(r)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition-all
                      ${repeat === r ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    {EVENT_REPEAT_META[r].label}
                  </button>
                ))}
              </div>
              {repeat === "custom" && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {EVENT_DAY_LABELS.map((label, dow) => (
                      <button key={dow} type="button"
                        onClick={() => setRepeatDays((prev) => prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow].sort())}
                        className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold border transition-all
                          ${repeatDays.includes(dow) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {repeatDays.length === 0 && <p className="text-[11px] text-destructive mt-1">Select at least one day</p>}
                </div>
              )}
              {repeat !== "none" && (
                <p className="text-[11px] text-primary/70 mt-1.5">
                  Starts {format(parseISO(date + "T00:00:00"), "MMM d")}
                  {repeat === "weekly" && ` · every ${format(parseISO(date + "T00:00:00"), "EEEE")}`}
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add notes, location, links…"
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-5 py-4 border-t border-border shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {isEditing ? "Save changes" : "Create event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
