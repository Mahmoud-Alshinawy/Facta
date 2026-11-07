import { useEffect, useRef, type ReactNode } from "react";
import {
  BookOpen,
  Dumbbell,
  PersonStanding,
  Lightbulb,
  Droplet,
  Moon,
  Target,
  Flame,
  Minus,
  Plus,
} from "lucide-react";
import { Commit, Kbd } from "../calendar/common";
import { radioKeys } from "../settings/ChoiceGroup";
import { ICONS, WEEKDAYS } from "@/lib/sharedGoals/creation";
export function SharedIcon({ icon }: { icon: string }) {
  const Icon =
    (
      {
        dumbbell: Dumbbell,
        book: BookOpen,
        run: PersonStanding,
        bulb: Lightbulb,
        drop: Droplet,
        moon: Moon,
        goals: Target,
        flame: Flame,
      } as Record<string, typeof Target>
    )[icon] ?? Target;
  return <Icon size={20} aria-hidden="true" />;
}
export function SharedHeader({
  title,
  kicker,
  step,
  onClose,
  busy = false,
}: {
  title: string;
  kicker: string;
  step?: number;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const r = requestAnimationFrame(() =>
      ref.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(r);
  }, [title]);
  return (
    <header className="hd shared-header">
      <div>
        <span className="mono sec">{kicker}</span>
        <h1 ref={ref} tabIndex={-1}>
          {title}
        </h1>
      </div>
      {step !== undefined && (
        <ol className="shared-steps" aria-label="Creation steps">
          {["Template", "Details", "People", "Review"].map((label, i) => (
            <li
              key={label}
              className={i === step ? "on" : i < step ? "done" : ""}
              aria-current={i === step ? "step" : undefined}
            >
              <b>{i < step ? "✓" : i + 1}</b>
              <span>{label}</span>
            </li>
          ))}
        </ol>
      )}
      <button className="ctl" type="button" disabled={busy} onClick={onClose}>
        Cancel <Kbd>Esc</Kbd>
      </button>
    </header>
  );
}
export function SharedFoot() {
  return (
    <footer className="foot">
      <span className="k">
        <Kbd>Tab</Kbd>move
      </span>
      <span className="k">
        <Kbd>←</Kbd>
        <Kbd>→</Kbd>choose option
      </span>
      <span className="flex-1" />
      <span className="k">
        <Kbd>Esc</Kbd>cancel
      </span>
      <span className="k">
        <Kbd>Enter</Kbd>next step
      </span>
    </footer>
  );
}
export function Callout({ children }: { children: ReactNode }) {
  return <p className="shared-callout">{children}</p>;
}
export function Stepper({
  value,
  min,
  max = 7,
  onChange,
  label = "Your days per week",
}: {
  value: number;
  min: number;
  max?: number;
  onChange: (n: number) => void;
  label?: string;
}) {
  return (
    <div className="field">
      <span className="flab">{label}</span>
      <div className="shared-stepper">
        <button
          type="button"
          disabled={value <= min}
          aria-label={`One fewer day: ${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Minus size={14} />
        </button>
        <output aria-live="polite">
          {value} {value === 1 ? "day" : "days"}
        </output>
        <button
          type="button"
          disabled={value >= max}
          aria-label={`One more day: ${label}`}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <span className="flab">Icon</span>
      <div
        className="shared-icons"
        role="radiogroup"
        aria-label="Goal icon"
        onKeyDown={radioKeys}
      >
        {ICONS.map((icon) => (
          <button
            type="button"
            role="radio"
            aria-label={icon}
            aria-checked={value === icon}
            tabIndex={value === icon ? 0 : -1}
            key={icon}
            onClick={() => onChange(icon)}
          >
            <SharedIcon icon={icon} />
          </button>
        ))}
      </div>
    </div>
  );
}
export function DayPicker({
  label,
  days,
  radio = false,
  onChange,
}: {
  label: string;
  days: number[];
  radio?: boolean;
  onChange: (day: number) => void;
}) {
  return (
    <div className="field">
      <span className="flab">{label}</span>
      <div
        className="shared-days"
        role={radio ? "radiogroup" : "group"}
        aria-label={label}
        onKeyDown={
          radio
            ? radioKeys
            : (e) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                  return;
                const buttons = [
                    ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                      "button",
                    ),
                  ],
                  index = buttons.indexOf(e.target as HTMLButtonElement);
                if (index < 0) return;
                e.preventDefault();
                buttons[
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? 6
                      : (index + (e.key === "ArrowRight" ? 1 : 6)) % 7
                ].focus();
              }
        }
      >
        {WEEKDAYS.map((day, i) => (
          <button
            key={day}
            type="button"
            role={radio ? "radio" : "checkbox"}
            aria-label={day}
            aria-checked={days.includes(i)}
            tabIndex={!radio || days.includes(i) ? 0 : -1}
            onClick={() => onChange(i)}
          >
            {day.slice(0, 3)}
          </button>
        ))}
      </div>
    </div>
  );
}
export function ResultCard({
  title,
  children,
  onBack,
}: {
  title: string;
  children: ReactNode;
  onBack: () => void;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <section className="shared-card">
      <h2 tabIndex={-1} ref={ref}>
        {title}
      </h2>
      {children}
      <Commit onClick={onBack}>Back to Shared</Commit>
    </section>
  );
}
