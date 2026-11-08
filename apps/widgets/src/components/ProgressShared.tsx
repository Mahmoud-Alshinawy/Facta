import {
  progressStatusLines,
  type SharedProgress,
  type SharedWidgetExport,
  type TimeFormat,
} from "@facta/calendar";
import "./progress-card.css";
export function ProgressGroupPicker({
  data,
  id,
  onChange,
  label = "Shared group",
}: {
  data: SharedWidgetExport;
  id: string | null;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <label className="progress-picker">
      <span>{label}</span>
      <select
        aria-label={label}
        value={id ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {!id && <option value="">No shared group</option>}
        {id && !data.groups.some((g) => g.groupId === id) && (
          <option value={id}>Group unavailable</option>
        )}
        {data.groups.map((g) => (
          <option key={g.groupId} value={g.groupId}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function ProgressScores({
  group,
  counts = false,
}: {
  group: SharedProgress;
  counts?: boolean;
}) {
  return (
    <ol
      className={`progress-scores${counts ? " with-counts" : ""}`}
      aria-label="Leaderboard"
    >
      {group.rows.map((r) => (
        <li
          key={r.userId}
          className={r.self ? "self" : ""}
          data-score={r.userId}
          data-percent={r.adherencePct}
          data-rank={r.rank}
          data-round={group.round?.start}
        >
          <span className="mono rank">{r.rank}</span>
          <span className="name">
            {counts && (
              <span className="progress-avatar" aria-hidden="true">
                {r.self ? "Y" : r.name.slice(0, 1)}
              </span>
            )}
            <span>
              {r.self ? "You" : r.name}
              {r.left ? " · Left" : ""}
            </span>
          </span>
          {counts && (
            <span className="mono counts">
              {r.completedDays} of {r.target}
            </span>
          )}
          <span className="mono percent">
            {new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(
              r.adherencePct,
            )}
            %
          </span>
          <span
            className="progress-bar"
            role="img"
            aria-label={`${r.name}, ${r.completedDays} of ${r.target}, ${r.adherencePct}%, rank ${r.rank}`}
          >
            <i
              className={r.isAtLeast70 ? "" : "low"}
              style={{ width: `${r.adherencePct}%` }}
            />
          </span>
        </li>
      ))}
    </ol>
  );
}
export function ProgressState({
  group,
  timeFormat,
  now = Date.now(),
}: {
  group: SharedProgress;
  timeFormat: TimeFormat;
  now?: number;
}) {
  return (
    <div className="progress-status" role="status">
      {progressStatusLines(group, { now, timeFormat }).map((line) => (
        <span key={line.text} data-deadline={line.deadline || undefined}>
          {line.text}
        </span>
      ))}
    </div>
  );
}
