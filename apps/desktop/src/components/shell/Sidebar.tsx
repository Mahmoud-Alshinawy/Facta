import type { ReactNode } from "react";
import Logo from "@/components/Logo";
import SyncStatusBadge from "@/components/SyncStatusBadge";
import { THEMES, chooseTheme } from "@/lib/theme";
import { useTheme } from "@/hooks/useTheme";
import {
  IconCalendar, IconDiary, IconGoals, IconLeft, IconNotes, IconRight, IconSearch, IconSettings, IconToday,
} from "./Icons";

import { HIDDEN_SECTIONS, type Section } from "./navigation";
export { HIDDEN_SECTIONS, RAIL_BREAKPOINT, nextSidebarMode, sidebarRootClass, type Section, type SidebarMode } from "./navigation";

const ITEMS: { id: Section; label: string; icon: ReactNode }[] = [
  { id: "today", label: "Today", icon: <IconToday size={18} /> },
  { id: "calendar", label: "Calendar", icon: <IconCalendar size={18} /> },
  { id: "goals", label: "Goals", icon: <IconGoals size={18} /> },
  { id: "notes", label: "Notes", icon: <IconNotes size={18} /> },
  { id: "diary", label: "Diary", icon: <IconDiary size={18} /> },
  { id: "settings", label: "Settings", icon: <IconSettings size={18} /> },
];

interface Props {
  section: Section;
  onSection: (s: Section) => void;
  onSearch: () => void;
  onToggle: () => void;
}

export default function Sidebar({ section, onSection, onSearch, onToggle }: Props) {
  const theme = useTheme();
  return (
    <aside className="sb" aria-label="Sidebar">
      <div className="sbtop" style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px" }}>
        <Logo size={30} />
        <span className="wordmark" style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.03em" }}>Facta</span>
        <button type="button" className="b b-icon sbtog" aria-label="Collapse or expand sidebar" title="Collapse or expand sidebar" onClick={onToggle}>
          <span className="i-l"><IconLeft /></span>
          <span className="i-r"><IconRight /></span>
        </button>
      </div>

      {/* Opens the search palette; drawn as the board's search field. */}
      <button type="button" className="sbsearch sbsearch-btn" onClick={onSearch} aria-label="Search (Ctrl K)">
        <span className="sbsearch-i"><IconSearch /></span>
        <span className="sbsearch-t">Search</span>
        <span className="kbd">Ctrl K</span>
      </button>

      <nav aria-label="Main" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {ITEMS.filter((i) => !HIDDEN_SECTIONS.has(i.id)).map((i) => {
          const on = section === i.id;
          return (
            <button key={i.id} type="button" className="nv" title={i.label} aria-current={on ? "page" : undefined} onClick={() => onSection(i.id)}>
              {i.icon}
              <span className="lbl">{i.label}</span>
              {on && <span className="mk" aria-hidden="true" />}
            </button>
          );
        })}
      </nav>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <div role="group" aria-label="Theme" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 2px 0 8px" }}>
          <span className="theme-l" style={{ fontSize: 12, fontWeight: 500, color: "var(--subtle)" }}>Theme</span>
          <div className="themes" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {THEMES.map((t) => {
              const pressed = theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="tdot"
                  title={t.name}
                  aria-label={`${t.name} theme`}
                  aria-pressed={pressed}
                  onClick={() => chooseTheme(t.id)}
                  style={{ borderColor: pressed ? "var(--text)" : "transparent" }}
                >
                  <span data-theme={t.id} aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border-strong)", background: "var(--bg)" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 4, background: "var(--accent)" }} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="sb-sync">
          <SyncStatusBadge />
        </div>
      </div>
    </aside>
  );
}
