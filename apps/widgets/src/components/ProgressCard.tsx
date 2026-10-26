import { Target } from "lucide-react";
import {
  currentSharedProgress,
  type SharedWidgetExport,
} from "@facta/calendar";
import { goalsToday, isDoneToday, type WidgetGoal } from "../lib/today";
import { useProgressSelection } from "../lib/progressSelection";
import {
  ProgressGroupPicker,
  ProgressScores,
  ProgressState,
} from "./ProgressShared";
export default function ProgressCard({
  data,
  goals,
  now,
  widgetId,
  theme,
  translucent,
  configuredId = null,
  onOpen,
  preview = false,
  error = "",
}: {
  data: SharedWidgetExport;
  goals: WidgetGoal[];
  now: number;
  widgetId: string;
  theme: string;
  translucent: boolean;
  configuredId?: string | null;
  onOpen?: (id: string) => Promise<void> | void;
  preview?: boolean;
  error?: string;
}) {
  const selection = useProgressSelection(
    data,
    `facta.progress.${widgetId}`,
    configuredId,
  );
  const raw = data.groups.find((g) => g.groupId === selection.id),
    group = raw ? currentSharedProgress(raw, now) : null;
  const due = goalsToday(goals, new Date(now)),
    done = due.filter((g) => isDoneToday(g, new Date(now))).length;
  return (
    <section
      data-theme={theme}
      className={`progress-card${translucent ? " is-trans" : ""}`}
      aria-label="Progress widget"
      data-progress-surface="widget"
    >
      <header className="progress-head" data-tauri-drag-region>
        <Target size={14} />
        <span>PROGRESS</span>
      </header>
      <div className="progress-personal">
        <div className="progress-ring-box">
          <svg
            viewBox="0 0 76 76"
            width="76"
            height="76"
            style={{ transform: "rotate(-90deg)" }}
            aria-hidden="true"
          >
            <circle
              cx="38"
              cy="38"
              r="32"
              fill="none"
              stroke="var(--raised-2)"
              strokeWidth="8"
            />
            <circle
              cx="38"
              cy="38"
              r="32"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="8"
              strokeLinecap={done ? "round" : "butt"}
              strokeDasharray={`${due.length ? (201.062 * done) / due.length : 0} 201.062`}
            />
          </svg>
          <span className="mono">
            {done}/{due.length}
          </span>
        </div>
        <div>
          <strong>
            {done} of {due.length} done today
          </strong>
          <small>Personal goals</small>
        </div>
      </div>
      <div className="progress-divider" />
      {!data.userId ? (
        <p className="progress-status">Sign in to Facta to see shared goals.</p>
      ) : (
        <>
          {!preview && (
            <ProgressGroupPicker
              data={data}
              id={selection.id}
              onChange={selection.select}
              label="Progress shared group"
            />
          )}
          {group ? (
            <>
              <span className="progress-status">
                {group.name} · weekly round
              </span>
              <ProgressScores group={group} />
              <ProgressState group={group} />
              {onOpen && (
                <button
                  className="progress-open"
                  onClick={() => void onOpen(group.groupId)}
                >
                  Open group
                </button>
              )}
            </>
          ) : (
            <p className="progress-status">
              {selection.id
                ? "Group unavailable. Choose another group in Facta or here."
                : data.unavailable
                  ? "Shared goals unavailable. Open Facta to refresh."
                  : "No shared goals yet. Start one in Facta."}
            </p>
          )}
          {data.truncated && (
            <p className="progress-status">
              Showing a limited selection. Open Facta for all groups.
            </p>
          )}
        </>
      )}
      {(selection.error || error) && (
        <p className="progress-status" role="status">
          {selection.error || error}
        </p>
      )}
    </section>
  );
}
