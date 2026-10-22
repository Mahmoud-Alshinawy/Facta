import { THEMES, type ThemeId } from "@/lib/theme";
import { radioKeys } from "./ChoiceGroup";

export default function ThemeCards({
  value,
  onChange,
  compact = false,
  label = "Theme",
}: {
  value: ThemeId;
  onChange: (theme: ThemeId) => void;
  compact?: boolean;
  label?: string;
}) {
  return (
    <div
      className={`theme-cards${compact ? " compact" : ""}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={radioKeys}
    >
      {THEMES.map((theme) => (
        <button
          key={theme.id}
          type="button"
          className="tcard"
          role="radio"
          aria-checked={value === theme.id}
          tabIndex={value === theme.id ? 0 : -1}
          onClick={() => onChange(theme.id)}
        >
          <span
            className="theme-sample"
            data-theme={theme.id}
            aria-hidden="true"
          >
            <span className="theme-sample-side">
              <i />
              <b />
              <b />
              <b />
            </span>
            <span className="theme-sample-main">
              <b />
              <span className="theme-sample-progress">
                <i />
                <i />
                <i />
              </span>
              <em />
              <em />
            </span>
          </span>
          <span className="theme-card-label">
            <span>{theme.name}</span>
            {value === theme.id && !compact && (
              <span className="mono">IN USE</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
