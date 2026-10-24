import { useCallback, useEffect, useRef, useState } from "react";
import {
  Calendar,
  Clock,
  LayoutGrid,
  Monitor,
  StickyNote,
  BookOpen,
  Plus,
  RotateCcw,
  Sun,
  Target,
  Trash2,
} from "lucide-react";
import { exportWidgetsNow } from "@/lib/widgetExportBus";
import { THEMES } from "@/lib/theme";
import { useTheme } from "@/hooks/useTheme";
import {
  readWidgetConfig,
  widgetConfigJson,
  WIDGET_CONFIG_KEY,
  WIDGET_LABELS,
  WIDGET_TYPES,
  type WidgetConfig,
  type WidgetType,
} from "@/lib/widgetConfig";
import ChoiceGroup from "./settings/ChoiceGroup";
import ThemeCards from "./settings/ThemeCards";
import WidgetPreview from "./settings/WidgetPreview";
import InlineConfirm from "./settings/InlineConfirm";
export type { WidgetType, WidgetTheme } from "@/lib/widgetConfig";

const TYPE_ICONS = {
  tasks: LayoutGrid,
  progress: Target,
  events: Clock,
  calendar: Calendar,
  dayview: Sun,
  notes: StickyNote,
  diary: BookOpen,
};
const isDesktop = () =>
  typeof window !== "undefined" &&
  !!((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
type Status = "checking" | "running" | "stopped" | "error" | "browser";

export default function WidgetManager({
  onWidgetChange,
}: {
  onWidgetChange?: () => void;
}) {
  const theme = useTheme();
  const [widgets, setWidgets] = useState(() => readWidgetConfig(localStorage));
  const [status, setStatus] = useState<Status>(
    isDesktop() ? "checking" : "browser",
  );
  const [launching, setLaunching] = useState(false),
    [error, setError] = useState("");
  const [adding, setAdding] = useState(false),
    [confirmReset, setConfirmReset] = useState(false);
  const [draft, setDraft] = useState<
    Pick<WidgetConfig, "type" | "theme" | "translucent" | "noteStyle">
  >({ type: "tasks", theme, translucent: true, noteStyle: "sticky" });
  const autoLaunched = useRef(false),
    mounted = useRef(true);
  const addButton = useRef<HTMLButtonElement>(null),
    resetButton = useRef<HTMLButtonElement>(null),
    typeField = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => {
    if (!isDesktop()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const running = await invoke<boolean>("widget_app_running");
      if (mounted.current) setStatus(running ? "running" : "stopped");
    } catch (reason) {
      if (mounted.current) {
        setStatus("error");
        setError(String(reason));
      }
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    if (!isDesktop())
      return () => {
        mounted.current = false;
      };
    const timer = window.setInterval(() => void refresh(), 10000);
    window.addEventListener("focus", refresh);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  async function launch() {
    setLaunching(true);
    setError("");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("launch_widget_app");
      await refresh();
    } catch (reason) {
      if (mounted.current) setError(String(reason));
    } finally {
      if (mounted.current) setLaunching(false);
    }
  }
  useEffect(() => {
    if (
      status === "stopped" &&
      widgets.some((widget) => widget.enabled) &&
      !autoLaunched.current
    ) {
      autoLaunched.current = true;
      void launch();
    }
  }, [status, widgets]);
  useEffect(() => {
    if (adding)
      typeField.current
        ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
        ?.focus();
  }, [adding]);
  function persist(next: WidgetConfig[]) {
    try {
      localStorage.setItem(WIDGET_CONFIG_KEY, widgetConfigJson(next));
      setWidgets(next);
      setError("");
      onWidgetChange?.();
      if (isDesktop()) void exportWidgetsNow();
      return true;
    } catch {
      setError(
        "Could not save your widgets. Free up local storage and try again.",
      );
      return false;
    }
  }
  function closeAdd() {
    setAdding(false);
    requestAnimationFrame(() => addButton.current?.focus());
  }
  function cancelReset() {
    setConfirmReset(false);
    requestAnimationFrame(() => resetButton.current?.focus());
  }
  const label = {
    checking: "Checking…",
    running: "Running",
    stopped: "Not running",
    error: "Status unavailable",
    browser: "Desktop app required",
  }[status];
  return (
    <>
      <section className="settings-card companion-card" aria-label="Widget app">
        <span className="settings-symbol" aria-hidden="true">
          <Monitor size={20} />
        </span>
        <div className="settings-grow">
          <h2>Facta Widgets</h2>
          <p>Floating widgets need the companion app running.</p>
        </div>
        <span className={`companion-status ${status}`} role="status">
          <i />
          {label}
        </span>
        <button
          type="button"
          className="b b-sec"
          disabled={
            launching ||
            status === "running" ||
            status === "checking" ||
            status === "browser"
          }
          onClick={() => void launch()}
        >
          {launching ? "Launching…" : "Launch widget app"}
        </button>
      </section>
      <section
        className="settings-card widget-card"
        aria-labelledby="your-widgets"
      >
        <div className="widget-card-heading">
          <h2 id="your-widgets">Your widgets</h2>
          <span className="mono">
            {widgets.filter((widget) => widget.enabled).length} of{" "}
            {widgets.length} active
          </span>
          <span className="flex-1" />
          {!adding && (
            <button
              ref={addButton}
              type="button"
              className="b b-sec"
              onClick={() => {
                setDraft({ type: "tasks", theme, translucent: true, noteStyle: "sticky" });
                setAdding(true);
              }}
            >
              <Plus size={16} aria-hidden="true" />
              Add widget
            </button>
          )}
        </div>
        <ul className="widget-list">
          {widgets.map((widget) => {
            const Icon = TYPE_ICONS[widget.type];
            return (
              <li
                key={widget.id}
                className={`wrow${widget.enabled ? "" : " disabled"}`}
              >
                <span
                  className="widget-type-icon"
                  data-theme={widget.theme}
                  aria-hidden="true"
                >
                  <Icon size={18} />
                </span>
                <div className="settings-grow">
                  <h3>{WIDGET_LABELS[widget.type]}</h3>
                  <p>
                    {widget.type === "notes" && `${widget.noteStyle === "stack" ? "Stack" : "Sticky"} · `}
                    {THEMES.find((item) => item.id === widget.theme)?.name} ·{" "}
                    {widget.translucent ? "Transparent" : "Solid"}
                  </p>
                </div>
                <span className="widget-state">
                  {widget.enabled ? "Visible" : "Hidden"}
                </span>
                <button
                  type="button"
                  className="sw"
                  role="switch"
                  aria-checked={widget.enabled}
                  aria-label={`${widget.enabled ? "Hide" : "Show"} ${WIDGET_LABELS[widget.type]} widget`}
                  onClick={() =>
                    persist(
                      widgets.map((item) =>
                        item.id === widget.id
                          ? { ...item, enabled: !item.enabled }
                          : item,
                      ),
                    )
                  }
                >
                  <span className="knob" />
                </button>
                <button
                  type="button"
                  className="b b-icon danger"
                  aria-label={`Remove ${WIDGET_LABELS[widget.type]} widget`}
                  onClick={(e) => {
                    const next =
                      e.currentTarget
                        .closest("li")
                        ?.nextElementSibling?.querySelector<HTMLButtonElement>(
                          "button",
                        ) ??
                      e.currentTarget
                        .closest("li")
                        ?.previousElementSibling?.querySelector<HTMLButtonElement>(
                          "button",
                        );
                    if (
                      persist(widgets.filter((item) => item.id !== widget.id))
                    )
                      requestAnimationFrame(() =>
                        (
                          next ??
                          addButton.current ??
                          resetButton.current
                        )?.focus(),
                      );
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
        {!widgets.length && (
          <p className="widget-empty">
            No widgets yet. Add one to keep your day on the desktop.
          </p>
        )}
        {adding && (
          <form
            className="new-widget"
            aria-labelledby="new-widget-title"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeAdd();
              }
            }}
            onSubmit={(e) => {
              e.preventDefault();
              if (
                persist([
                  ...widgets,
                  { id: `w-${crypto.randomUUID()}`, ...draft, enabled: true },
                ])
              )
                closeAdd();
            }}
          >
            <div className="new-widget-fields">
              <h3 id="new-widget-title">New widget</h3>
              <div ref={typeField}>
                <ChoiceGroup<WidgetType>
                  label="Type"
                  value={draft.type}
                  options={WIDGET_TYPES.map((type) => {
                    const Icon = TYPE_ICONS[type];
                    return {
                      value: type,
                      label: (
                        <>
                          <Icon size={15} aria-hidden="true" />
                          {WIDGET_LABELS[type]}
                        </>
                      ),
                    };
                  })}
                  onChange={(type) => setDraft({ ...draft, type })}
                />
              </div>
              {draft.type === "notes" && <ChoiceGroup<"sticky" | "stack">
                label="Notes style" value={draft.noteStyle ?? "sticky"}
                options={[{value:"sticky",label:"Sticky"},{value:"stack",label:"Stack"}]}
                onChange={noteStyle=>setDraft({...draft,noteStyle})} />}
              <div className="settings-field">
                <span className="sec-h">Theme</span>
                <ThemeCards
                  value={draft.theme}
                  compact
                  onChange={(theme) => setDraft({ ...draft, theme })}
                  label="Widget theme"
                />
              </div>
              <div className="transparent-option">
                <div className="settings-grow">
                  <h3 id="widget-transparent">Transparent background</h3>
                  <p>
                    See-through plate, no blur. Your wallpaper shows behind it.
                  </p>
                </div>
                <button
                  type="button"
                  className="sw"
                  role="switch"
                  aria-checked={draft.translucent}
                  aria-labelledby="widget-transparent"
                  onClick={() =>
                    setDraft({ ...draft, translucent: !draft.translucent })
                  }
                >
                  <span className="knob" />
                </button>
              </div>
              <div className="option-row">
                <button type="submit" className="b b-commit b-primary">
                  <span>
                    <Plus size={16} aria-hidden="true" />
                    Add widget
                  </span>
                </button>
                <button type="button" className="b b-quiet" onClick={closeAdd}>
                  Cancel
                </button>
              </div>
            </div>
            <div className="new-widget-preview">
              <span className="sec-h">Preview</span>
              <WidgetPreview widget={draft} />
            </div>
          </form>
        )}
        <div className="widget-reset">
          {confirmReset ? (
            <InlineConfirm
              question="Remove every widget?"
              keep="Keep them"
              commit="Reset all"
              onCancel={cancelReset}
              onConfirm={() => {
                if (persist([])) cancelReset();
              }}
            />
          ) : (
            <button
              ref={resetButton}
              type="button"
              disabled={!widgets.length}
              className="b b-del"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Reset all
            </button>
          )}
        </div>
      </section>
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
