import { useState } from "react";
import { format } from "date-fns";
import type { Goal, GoalCategory } from "@/types/planner";
import type { NewGoal } from "@/hooks/useGoals";
import { goalForm, goalFormError, type GoalDraft } from "@/lib/dialogState";
import { IconCheck, IconClose } from "./shell/Icons";
import RepeatOptions from "./dialogs/RepeatOptions";
import DialogFrame from "./dialogs/DialogFrame";

interface GoalDialogProps {
  open: boolean; onClose: () => void; onSave: (goal: NewGoal, addToCalendar: boolean) => void;
  onDelete?: (id: string) => void; editGoal?: Goal | null; initialDate?: string; draft?: GoalDraft;
}

export default function GoalDialog(props: GoalDialogProps) {
  return props.open ? <GoalDialogForm key={props.editGoal?.id ?? "new"} {...props} /> : null;
}

function GoalDialogForm({ onClose, onSave, onDelete, editGoal, initialDate, draft }: GoalDialogProps) {
  const [form, setForm] = useState(() => goalForm(editGoal, initialDate ?? format(new Date(), "yyyy-MM-dd"), draft));
  const patch = (values: Partial<typeof form>) => setForm((old) => ({ ...old, ...values }));
  const priorities: [GoalCategory, string, number][] = [["must-do", "Must do", 3], ["should-do", "Should do", 2], ["nice-to-have", "Nice to have", 1]];
  return <DialogFrame labelledBy="gd-heading" className="goal-sheet" error={goalFormError(form)} onClose={onClose} noun="goal" editing={!!editGoal}
    onDelete={editGoal && onDelete ? () => { onDelete(editGoal.id); onClose(); } : undefined}
    onSave={() => {
      onSave({ title: form.title.trim(), category: form.category, date: form.date, time: form.time || undefined,
        repeat: form.repeat, repeatDays: form.repeat === "custom" ? form.repeatDays : undefined,
        notificationsEnabled: !!form.time && form.reminder, notificationMessage: form.message }, form.addToCalendar);
      onClose();
    }}>
    <div className="goal-dialog-head"><h2 id="gd-heading">{editGoal ? "Edit goal" : "New goal"}</h2>
      <button type="button" className="b b-icon" onClick={onClose} aria-label="Close (Escape)"><IconClose size={18} /></button>
    </div>
    <div className="dialog-body goal-dialog-body">
      <label htmlFor="gd-title" className="sr-only">Title</label>
      <input id="gd-title" className="inp title-inp" data-autofocus autoComplete="off" placeholder="Goal title" value={form.title} onChange={(e) => patch({ title: e.target.value })} />
      <div className="goal-fields">
        <span id="gd-prio-label" className="flab">Priority</span>
        <div role="radiogroup" aria-labelledby="gd-prio-label" className="option-row">
          {priorities.map(([value, label, bars]) => <button key={value} type="button" className="b opt" role="radio" aria-checked={form.category === value} onClick={() => patch({ category: value })}>
            <span><span className="priority-bars" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} style={{ height: 6 + i * 3, opacity: i < bars ? 1 : .28 }} />)}</span>{label}</span>
          </button>)}
        </div>
        <label htmlFor="gd-date" className="flab">Date</label><div className="option-row">
          <input id="gd-date" className="inp mono" type="date" value={form.date} onChange={(e) => patch({ date: e.target.value })} />
          {form.date === format(new Date(), "yyyy-MM-dd") && <span className="dialog-note">Today</span>}
        </div>
        <label htmlFor="gd-time" className="flab">Time <span className="dialog-note">· optional</span></label><div className="option-row">
          <input id="gd-time" className="inp mono" type="time" value={form.time} onChange={(e) => patch({ time: e.target.value, reminder: e.target.value ? form.reminder : false })} />
          {form.time && <button type="button" className="b b-quiet" onClick={() => patch({ time: "", reminder: false })}>Clear</button>}
        </div>
        <span id="gd-repeat" className="flab self-start pt-2">Repeat</span>
        <RepeatOptions id="gd-repeat" repeat={form.repeat} days={form.repeatDays} onRepeat={(repeat) => patch({ repeat })} onDays={(repeatDays) => patch({ repeatDays })} />
        <span id="gd-reminder" className="flab self-start pt-2">Reminder</span><div className="repeat-options">
          <div className="option-row"><button type="button" className="sw" role="switch" aria-checked={form.reminder} aria-disabled={!form.time} aria-labelledby="gd-reminder" aria-describedby="gd-reminder-note"
            onClick={() => { if (form.time) patch({ reminder: !form.reminder }); }}><span className="knob" /></button>
            <span id="gd-reminder-note" className="dialog-note">{!form.time ? "Set a time first" : form.reminder ? "On" : "Off"}</span></div>
          {form.reminder && <><label htmlFor="gd-message" className="sr-only">Reminder message</label><input id="gd-message" className="inp" placeholder="Custom message (optional)" value={form.message} onChange={(e) => patch({ message: e.target.value })} /></>}
        </div>
        <span /><label className="cal-row option-row"><input type="checkbox" className="sr-only" checked={form.addToCalendar} onChange={(e) => patch({ addToCalendar: e.target.checked })} />
          <span className={`cbx${form.addToCalendar ? " on" : ""}`} aria-hidden="true">{form.addToCalendar && <IconCheck size={13} />}</span>Also add to calendar</label>
      </div>
    </div>
  </DialogFrame>;
}