import type { KeyboardEvent, ReactNode } from "react";

export function radioKeys(e: KeyboardEvent<HTMLElement>) {
  const delta =
    e.key === "ArrowRight" || e.key === "ArrowDown"
      ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? -1
        : 0;
  if (!delta && e.key !== "Home" && e.key !== "End") return;
  const buttons = Array.from(
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  );
  const index = buttons.indexOf(e.target as HTMLButtonElement);
  if (index < 0 || !buttons.length) return;
  e.preventDefault();
  const next =
    buttons[
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? buttons.length - 1
          : (index + delta + buttons.length) % buttons.length
    ];
  next.focus();
  next.click();
}

export default function ChoiceGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-field">
      <span className="sec-h">{label}</span>
      <div
        className="option-row"
        role="radiogroup"
        aria-label={label}
        onKeyDown={radioKeys}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="b opt"
            role="radio"
            aria-checked={value === option.value}
            tabIndex={value === option.value ? 0 : -1}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
