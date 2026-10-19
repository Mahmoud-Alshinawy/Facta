import { useState } from "react";
import { THEMES, chooseTheme, currentTheme, type ThemeId } from "@/lib/theme";

/** The four theme swatches in the sidebar. */
export default function ThemeDots() {
  const [theme, setTheme] = useState<ThemeId>(() => currentTheme());

  return (
    <div role="group" aria-label="Theme" className="flex items-center justify-between gap-2 pl-2 pr-1">
      <span className="text-xs font-medium text-subtle">Theme</span>
      <div className="flex items-center gap-1">
        {THEMES.map((t) => {
          const on = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-tip={t.name}
              aria-label={`${t.name} theme`}
              aria-pressed={on}
              onClick={() => { chooseTheme(t.id); setTheme(t.id); }}
              className={`tip flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] p-0 transition-colors ${
                on ? "border-foreground" : "border-transparent hover:border-text-2"
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border-strong"
                style={{ background: t.swatchBg }}
              >
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: t.swatchAccent }} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
