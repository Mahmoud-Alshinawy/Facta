import { useState } from "react";
import { format } from "date-fns";
import { dayIndex, parseClock } from "@facta/calendar";
import type { CalendarEvent } from "@/types/planner";
import { eventForm, eventFormError, nextHour } from "@/lib/dialogState";
import { durationText, noonOf } from "@/lib/calendarData";
import {
  EVENT_COLORS,
  EVENT_COLOR_NAMES,
  eventColorVar,
} from "@/lib/eventColors";
import { IconCheck, IconClose } from "./shell/Icons";
import type { EventDraft } from "./calendar/types";
import { deleteEventWithUndo } from "./calendar/common";
import RepeatOptions from "./dialogs/RepeatOptions";
import DialogFrame from "./dialogs/DialogFrame";
import DatePickerGrid from "./dialogs/DatePickerGrid";

interface EventDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (event: Omit<CalendarEvent, "id">) => void;
  onDelete?: (id: string) => void;
  initialDate?: string;
  initialStartTime?: string;
  initialEndTime?: string;
  editEvent?: CalendarEvent | null;
  draft?: EventDraft;
}

export default function EventDialog(props: EventDialogProps) {
  return props.open ? (
    <EventDialogForm key={props.editEvent?.id ?? "new"} {...props} />
  ) : null;
}

function EventDialogForm({
  onClose,
  onSave,
  onDelete,
  editEvent,
  initialDate,
  initialStartTime,
  initialEndTime,
  draft,
}: EventDialogProps) {
  const [form, setForm] = useState(() =>
    eventForm(editEvent, initialDate ?? format(new Date(), "yyyy-MM-dd"), {
      ...draft,
      date: draft?.date ?? initialDate,
      startTime: draft?.startTime ?? initialStartTime,
      endTime: draft?.endTime ?? initialEndTime,
    }),
  );
  const [month, setMonth] = useState(() => noonOf(form.date));
  const [dateTarget, setDateTarget] = useState<"date" | "endDate">("date");
  const patch = (values: Partial<typeof form>) =>
    setForm((old) => ({ ...old, ...values }));
  const duration =
    (dayIndex(form.endDate) - dayIndex(form.date)) * 1440 +
    (parseClock(form.endTime) ?? 0) -
    (parseClock(form.startTime) ?? 0);
  const selectDate = (value: string) =>
    setForm((old) => ({
      ...old,
      [dateTarget]: value,
      ...(dateTarget === "date" && old.endDate === old.date
        ? { endDate: value }
        : {}),
    }));
  const changeDate = (field: "date" | "endDate", value: string) => {
    if (Number.isFinite(dayIndex(value))) setMonth(noonOf(value));
    setForm((old) => ({
      ...old,
      [field]: value,
      ...(field === "date" && old.endDate === old.date
        ? { endDate: value }
        : {}),
    }));
  };
  return (
    <DialogFrame
      labelledBy="ev-heading"
      className="event-sheet"
      error={eventFormError(form)}
      noun="event"
      editing={!!editEvent}
      onClose={onClose}
      summary={`${form.date}${form.endDate !== form.date ? ` – ${form.endDate}` : ""} · ${form.allDay ? "All day" : `${form.startTime}–${form.endTime}`}`}
      onDelete={
        editEvent && onDelete
          ? () => {
              deleteEventWithUndo(editEvent, onDelete);
              onClose();
            }
          : undefined
      }
      onSave={() => {
        onSave({
          title: form.title.trim(),
          date: form.date,
          endDate: form.endDate === form.date ? undefined : form.endDate,
          startTime: form.allDay ? "00:00" : form.startTime,
          endTime: form.allDay ? "23:59" : form.endTime,
          color: form.color,
          description: form.description,
          allDay: form.allDay,
          repeat: form.repeat,
          repeatDays: form.repeat === "custom" ? form.repeatDays : undefined,
        });
        onClose();
      }}
    >
      <div className="dialog-body event-dialog-body">
        <div className="event-what">
          <h2 id="ev-heading">
            <span
              className="event-heading-mark"
              style={{ background: eventColorVar(form.color) }}
            />
            {editEvent ? "Edit event" : "New event"}
          </h2>
          <label htmlFor="ev-title" className="sr-only">
            Title
          </label>
          <input
            id="ev-title"
            className="inp title-inp"
            data-autofocus
            autoComplete="off"
            placeholder="Event title"
            value={form.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
          <div className="repeat-options">
            <span id="ev-colour" className="lbl">
              Colour
            </span>
            <div
              role="radiogroup"
              aria-labelledby="ev-colour"
              className="option-row"
            >
              {EVENT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="b swatch"
                  role="radio"
                  aria-checked={form.color === color}
                  aria-label={EVENT_COLOR_NAMES[color]}
                  onClick={() => patch({ color })}
                >
                  <span
                    className="event-swatch"
                    style={{ background: eventColorVar(color) }}
                  >
                    {form.color === color && <IconCheck size={14} />}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="event-description">
            <label htmlFor="ev-description" className="lbl">
              Description <span className="dialog-note">· optional</span>
            </label>
            <textarea
              id="ev-description"
              className="inp"
              rows={6}
              placeholder="Notes, links, room…"
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </div>
        </div>
        <div className="event-when">
          <div className="event-close">
            <button
              type="button"
              className="b b-icon"
              onClick={onClose}
              aria-label="Close (Escape)"
            >
              <IconClose size={18} />
            </button>
          </div>
          <div className="event-date-fields">
            {(["date", "endDate"] as const).map((field) => (
              <div key={field}>
                <label htmlFor={`ev-${field}`} className="lbl">
                  {field === "date" ? "Start date" : "End date"}
                </label>
                <input
                  id={`ev-${field}`}
                  className="inp mono"
                  type="date"
                  value={form[field]}
                  min={field === "endDate" ? form.date : undefined}
                  aria-invalid={
                    field === "endDate" &&
                    (!Number.isFinite(dayIndex(form.endDate)) ||
                      form.endDate < form.date)
                  }
                  onFocus={() => {
                    setDateTarget(field);
                    if (Number.isFinite(dayIndex(form[field])))
                      setMonth(noonOf(form[field]));
                  }}
                  onInput={(e) => changeDate(field, e.currentTarget.value)}
                  onChange={(e) => changeDate(field, e.currentTarget.value)}
                />
              </div>
            ))}
          </div>
          <span className="dialog-note" aria-live="polite">
            Calendar selects {dateTarget === "date" ? "start" : "end"} date. End
            date is inclusive.
          </span>
          {form.repeat !== "none" && form.endDate !== form.date && (
            <span className="dialog-note">
              For repeats, these dates set each occurrence's length.
            </span>
          )}
          <DatePickerGrid
            selected={noonOf(
              Number.isFinite(dayIndex(form[dateTarget]))
                ? form[dateTarget]
                : Number.isFinite(dayIndex(form.date))
                  ? form.date
                  : format(new Date(), "yyyy-MM-dd"),
            )}
            month={month}
            onMonth={setMonth}
            onSelect={(day) => selectDate(format(day, "yyyy-MM-dd"))}
          />
          <div className="repeat-options">
            <div className="flex items-center justify-between">
              <span className="lbl">Time</span>
              <span className="option-row">
                <span id="ev-all-day" className="flab">
                  All day
                </span>
                <button
                  type="button"
                  className="sw"
                  role="switch"
                  aria-labelledby="ev-all-day"
                  aria-checked={form.allDay}
                  onClick={() => patch({ allDay: !form.allDay })}
                >
                  <span className="knob" />
                </button>
              </span>
            </div>
            {!form.allDay && (
              <div className="option-row">
                <label htmlFor="ev-start" className="sr-only">
                  Start time
                </label>
                <input
                  id="ev-start"
                  className="inp mono"
                  type="time"
                  value={form.startTime}
                  onInput={(e) =>
                    patch({
                      startTime: e.currentTarget.value,
                      endTime: nextHour(e.currentTarget.value),
                    })
                  }
                  onChange={(e) =>
                    patch({
                      startTime: e.target.value,
                      endTime: nextHour(e.target.value),
                    })
                  }
                />
                <span className="dialog-note">–</span>
                <label htmlFor="ev-end" className="sr-only">
                  End time
                </label>
                <input
                  id="ev-end"
                  className="inp mono"
                  type="time"
                  value={form.endTime}
                  aria-invalid={duration <= 0}
                  aria-describedby="ev-duration"
                  onInput={(e) => patch({ endTime: e.currentTarget.value })}
                  onChange={(e) => patch({ endTime: e.target.value })}
                />
                <span
                  id="ev-duration"
                  className={`dialog-note${duration <= 0 ? " is-error" : ""}`}
                >
                  {duration > 0 ? durationText(duration) : "End after start"}
                </span>
              </div>
            )}
          </div>
          <div className="repeat-options">
            <span id="ev-repeat" className="lbl">
              Repeat
            </span>
            <RepeatOptions
              id="ev-repeat"
              repeat={form.repeat}
              days={form.repeatDays}
              onRepeat={(repeat) => patch({ repeat })}
              onDays={(repeatDays) => patch({ repeatDays })}
            />
          </div>
        </div>
      </div>
    </DialogFrame>
  );
}
