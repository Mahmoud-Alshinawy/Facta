import type { ReactNode } from "react";
import { Check } from "lucide-react";

/**
 * One goal row on Today: the checkbox, the title and what goes beside it.
 * Personal and shared goals both use it, so they look and behave the same.
 */
export default function GoalRowView({
  title,
  done,
  toggleLabel,
  onToggle,
  disabled = false,
  isNext = false,
  popping = false,
  subline,
  describedBy,
  onOpen,
  openLabel,
  lead,
  trailing,
}: {
  title: string;
  done: boolean;
  toggleLabel: string;
  onToggle: () => void;
  disabled?: boolean;
  isNext?: boolean;
  popping?: boolean;
  /** A second, quieter line under the title. */
  subline?: ReactNode;
  /** Id of visible text that explains the checkbox's state. */
  describedBy?: string;
  /** Makes the title a button, e.g. to open a shared group. */
  onOpen?: () => void;
  openLabel?: string;
  /** Before the title, e.g. the NEXT marker. */
  lead?: ReactNode;
  /** At the end of the row, e.g. the repeat tag, time and bell. */
  trailing?: ReactNode;
}) {
  const titleText = (
    <span
      className={`truncate text-[15px] font-medium ${done ? "text-subtle line-through decoration-subtle" : "text-foreground"}`}
    >
      {title}
    </span>
  );
  return (
    <li
      className={`flex min-h-[50px] items-center gap-3.5 rounded-[10px] py-1.5 pl-3 pr-2 transition-colors hover:bg-raised ${
        isNext ? "bg-raised shadow-[inset_0_0_0_1px_var(--border-strong)]" : ""
      } ${popping ? "goal-pop" : ""}`}
    >
      <span className="relative flex shrink-0">
        <span
          aria-hidden="true"
          className="goal-ring pointer-events-none absolute inset-0 rounded-lg border-2 border-primary opacity-0"
        />
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={toggleLabel}
          aria-describedby={describedBy}
          disabled={disabled}
          onClick={onToggle}
          className={`goal-cb flex h-6 w-6 items-center justify-center rounded-lg border-[1.5px] p-0 transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-60 ${
            done ? "border-primary bg-primary" : "border-input bg-transparent"
          }`}
        >
          {done && (
            <Check
              aria-hidden="true"
              size={15}
              strokeWidth={3.2}
              className="text-primary-foreground"
            />
          )}
        </button>
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          {lead}
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              aria-label={openLabel}
              className="min-w-0 truncate rounded p-0 text-left hover:underline"
            >
              {titleText}
            </button>
          ) : (
            titleText
          )}
        </span>
        {subline && (
          <span className="truncate text-xs text-subtle">{subline}</span>
        )}
      </span>

      {trailing && (
        <span className="flex shrink-0 items-center gap-2 text-subtle">
          {trailing}
        </span>
      )}
    </li>
  );
}
