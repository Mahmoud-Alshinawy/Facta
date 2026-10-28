import { useRef, useState } from "react";
import type { SharedSync } from "@/lib/sync/shared/engine";
import type { SharedState } from "@/lib/sync/shared/state";
import {
  sharedGroupView,
  percent,
  type SharedGroupView,
} from "@/lib/sharedGoals/view";
import { dateLabel, scheduleText } from "@/lib/sharedGoals/creation";
import { SharedIcon } from "./SharedParts";
import { addDays } from "@/lib/sharedGoals/dates";
import { groupDeadlineText } from "@facta/calendar";
import { usePrefs } from "@/hooks/usePrefs";
import type { CheckinIntent } from "@/lib/sync/shared/outbox";

export function PendingReview({
  engine,
  intentions,
  unavailable = false,
}: {
  engine: SharedSync;
  intentions: CheckinIntent[];
  unavailable?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!intentions.length) return null;
  return (
    <section className="shared-pending-panel" aria-label="Check-in sync review">
      <h2>Pending changes</h2>
      <p className="shared-note">
        Checkmarks can be pending. Scores and ranks remain server-confirmed
        until sync.
      </p>
      {unavailable && (
        <p className="shared-note">
          These are your own saved changes for an unavailable group. Group
          details have been removed.
        </p>
      )}
      {intentions.map((i) => (
        <div className="shared-person" key={i.id}>
          <span className="flex-1">
            {i.date} · {i.completed ? "Check in" : "Undo"} ·{" "}
            {i.phase === "failed"
              ? i.failure === "conflict"
                ? "Conflict · another device changed this day. Review the confirmed state before retrying."
                : `Rejected: ${(i.failure ?? "unavailable").replaceAll("_", " ")}`
              : "Pending"}
          </span>
          {i.phase === "failed" ? (
            <>
              {!unavailable && (
                <button
                  type="button"
                  className="ctl"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await engine.retryFailed(i.id);
                      if (navigator.onLine) await engine.syncNow();
                    })
                  }
                >
                  Review and retry
                </button>
              )}
              <button
                type="button"
                className="ctl"
                disabled={busy}
                onClick={() => void run(() => engine.discardFailed(i.id))}
              >
                Discard rejected change
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ctl"
              disabled={busy}
              onClick={() => void run(() => engine.syncNow())}
            >
              Sync now
            </button>
          )}
        </div>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

export function CheckinAction({
  engine,
  view,
  locked,
  now,
  detail = false,
}: {
  engine: SharedSync;
  view: SharedGroupView;
  locked: boolean;
  now: () => number;
  detail?: boolean;
}) {
  const busy = useRef(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const toggle = async () => {
    if (busy.current || locked || !view.canCheck) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      // The display can be a minute old. Capture once, then derive both the
      // action's local day and checked state at that instant. The durable
      // outbox retains this capture unchanged through receipt retries.
      const captured = now();
      const action = sharedGroupView(
        engine.getSnapshot(),
        engine.userId,
        view.group.id,
        captured,
      );
      if (!action?.canCheck)
        throw new Error(action?.reason ?? "Reconnect to confirm this group.");
      await engine.enqueueCheckin({
        groupId: action.group.id,
        date: action.today,
        completed: !action.checked,
        capturedAt: new Date(captured).toISOString(),
      });
      if (navigator.onLine) void engine.syncNow();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return (
    <div className="shared-check-action">
      <button
        type="button"
        data-checkin={detail ? "detail" : undefined}
        className={view.checked ? "ctl" : "b b-commit b-primary"}
        disabled={!view.canCheck || locked || saving}
        aria-label={`${view.checked ? "Undo check-in" : "Check in"}: ${view.group.name}`}
        aria-pressed={view.checked}
        onClick={() => void toggle()}
      >
        <span className="lab">
          {view.pending
            ? view.checked
              ? "Pending check-in"
              : "Pending undo"
            : view.checked
              ? detail
                ? "Checked in today"
                : "Checked in"
              : detail
                ? "Check in today"
                : "Check in"}
        </span>
        {detail && !view.checked && (
          <span className="key" aria-hidden="true">
            C
          </span>
        )}
      </button>
      {error && <p role="status">{error}</p>}
    </div>
  );
}
export function SharedRanking({
  view,
  userId,
  compact = false,
}: {
  view: SharedGroupView;
  userId: string;
  compact?: boolean;
}) {
  const rows = compact ? view.scores.slice(0, 4) : view.scores;
  return (
    <div
      role="list"
      aria-label="Server-confirmed leaderboard"
      className={compact ? "shared-ranking compact" : "shared-ranking"}
    >
      {rows.map((r) => (
        <div
          key={r.membershipId}
          role="listitem"
          className={`shared-rank ${r.userId === userId ? "is-you" : ""}`}
          data-score={r.userId}
          data-round={r.roundStart}
          data-rank={r.rank}
          data-percent={r.adherencePct}
        >
          <span className="mono rank">{r.rank}</span>
          <span className="shared-avatar">{r.displayName.slice(0, 1)}</span>
          <span className="name">
            {r.userId === userId ? "You" : r.displayName}
            {r.leftAt && <small> · Left</small>}
          </span>
          <div
            className="shared-score-bar"
            role="img"
            aria-label={`${r.displayName}, ${r.completedDays} of ${r.target} days, ${percent(r.adherencePct)}, rank ${r.rank}`}
          >
            <i
              className={r.isAtLeast70 ? "" : "low"}
              style={{ width: `${r.adherencePct}%` }}
            />
          </div>
          {!compact && (
            <span className="counts">
              {r.completedDays} of {r.target} {r.target === 1 ? "day" : "days"}
            </span>
          )}
          <span className="mono pc">{percent(r.adherencePct)}</span>
        </div>
      ))}
      {!rows.length && (
        <p className="shared-note">
          No confirmed scored round. No ranks or zero scores are assigned.
        </p>
      )}
      {compact && view.scores.length > 4 && (
        <span className="shared-note">
          +{view.scores.length - 4} more in detail
        </span>
      )}
    </div>
  );
}
export function RoundStatus({
  view,
  now = Date.now(),
}: {
  view: SharedGroupView;
  now?: number;
}) {
  const { timeFormat } = usePrefs();
  const deadlines =
    view.phase === "active" && view.current
      ? groupDeadlineText({
          today: view.today,
          timeZone: view.group.timeZone,
          roundEnd: view.current.roundEnd,
          now,
          timeFormat,
        })
      : [];
  return (
    <>
      <RoundPhase view={view} />
      {deadlines.map((line) => (
        <span key={line} className="shared-note" data-deadline>
          {line}
        </span>
      ))}
    </>
  );
}
function RoundPhase({ view }: { view: SharedGroupView }) {
  return (
    <span className="shared-note">
      {view.phase === "active"
        ? "Active round"
        : view.phase === "waiting"
          ? "Waiting"
          : view.phase === "paused"
            ? "Paused"
            : view.phase === "archived"
              ? "Archived"
              : view.phase === "draft"
                ? "Private draft"
                : "Current lifecycle unconfirmed"}
      {view.round && (
        <>
          {" "}
          · {dateLabel(view.round.roundStart)} –{" "}
          {dateLabel(addDays(view.round.roundEnd, -1))}
          {!view.current || view.round.roundStart !== view.current.roundStart
            ? " · historical"
            : ""}
        </>
      )}
    </span>
  );
}
export function SharedOverview({
  engine,
  data,
  locked,
  now,
  onOpen,
  onInvite,
}: {
  engine: SharedSync;
  data: SharedState;
  locked: boolean;
  now: () => number;
  onOpen: (id: string) => void;
  onInvite: (id: string) => void;
}) {
  const views = (data.cache?.snapshot.groups ?? [])
    .filter((g) => g.publishedAt && !g.deletedAt)
    .map((g) => sharedGroupView(data, engine.userId, g.id, now()))
    .filter((v): v is SharedGroupView => !!v);
  const active = views.filter((v) => v.phase === "active"),
    due = active.filter((v) => v.eligible && !v.rest);
  const left = due.filter((v) => !v.checked);
  return (
    <>
      <section className="shared-overview" aria-label="Shared goals summary">
        <div>
          <span className="mono sec">ACTIVE ROUNDS</span>
          <strong>{active.length}</strong>
          <small>
            {active.map((v) => v.group.name).join(", ") || "No active rounds"}
          </small>
        </div>
        <div>
          <span className="mono sec">YOUR RANK</span>
          {active
            .filter((v) => v.ownScore)
            .map((v) => (
              <div className="shared-overview-rank" key={v.group.id}>
                <span>{v.group.name}</span>
                <span className="mono">
                  {v.ownScore!.rank} of {v.scores.length}
                </span>
              </div>
            ))}
          {!active.some((v) => v.ownScore) && (
            <small>No current eligible rank</small>
          )}
        </div>
        <div>
          <span className="mono sec">CHECK-INS LEFT TODAY</span>
          <strong>
            {left.length}
            <small> of {due.length}</small>
          </strong>
          <small>
            {left.map((v) => v.group.name).join(", ") ||
              (due.length
                ? "All checked in (pending changes labelled below)"
                : "Nothing due today")}
          </small>
        </div>
      </section>
      {!!views.length && (
        <div className="shared-section-title shared-goals-heading">
          <h2>Shared goals</h2>
          <span className="shared-note">Each goal has its own round start</span>
        </div>
      )}
      <div className="shared-cards">
        {views.map((v) => {
          const previous = v.rounds.find(
            (r) =>
              r.roundStart <
              (v.current?.roundStart ?? v.round?.roundStart ?? ""),
          );
          const prior = data.cache!.snapshot.scores.filter(
            (s) =>
              s.groupId === v.group.id && s.roundStart === previous?.roundStart,
          );
          return (
            <article
              key={v.group.id}
              className="shared-sc shared-person"
              aria-label={v.group.name}
            >
              <div className="shared-card-head">
                <span className="tile">
                  <SharedIcon icon={v.group.icon} />
                </span>
                <div>
                  <h3>{v.group.name}</h3>
                  <span className="shared-note">
                    {scheduleText({
                      template: v.group.template as "gym" | "custom",
                      schedule_kind: v.group.scheduleKind as
                        "every" | "days" | "n",
                      weekdays: v.group.weekdays,
                      times_per_week: v.group.timesPerWeek,
                    })}{" "}
                    · {v.group.timeZone}
                  </span>
                </div>
                <span className="mono sec">
                  {v.members.filter((m) => !m.leftAt).length} people
                </span>
              </div>
              <RoundStatus view={v} now={now()} />
              <SharedRanking view={v} userId={engine.userId} compact />
              {v.pendingTarget && (
                <p className="shared-note">
                  Your split changes {dateLabel(v.pendingTarget.effectiveRound)}
                  : {v.effectiveTarget} → {v.pendingTarget.target} days
                </p>
              )}
              <div className="shared-ci">
                <div>
                  <span className="mono sec">YOUR CHECK-IN</span>
                  <p>{v.reason ?? dateLabel(v.today)}</p>
                </div>
                <CheckinAction
                  engine={engine}
                  view={v}
                  locked={locked}
                  now={now}
                />
              </div>
              <div className="shared-note">
                {v.stale || v.phase !== "active"
                  ? "Last confirmed"
                  : "Confirmed"}
                :{" "}
                {v.confirmedAt
                  ? new Date(v.confirmedAt).toLocaleString()
                  : "No round coverage"}
                {v.intentions.length
                  ? " · Pending changes; ranks remain server-confirmed"
                  : ""}
              </div>
              <div className="shared-actions">
                <small className="flex-1 shared-note">
                  {prior.length
                    ? `Previous round average ${percent(prior[0].groupAveragePct)}`
                    : "No previous confirmed round"}
                </small>
                {v.group.ownerId === engine.userId && !v.group.archivedAt && (
                  <button
                    type="button"
                    className="ctl"
                    onClick={() => onInvite(v.group.id)}
                  >
                    Invite people
                  </button>
                )}
                <button
                  id={`shared-open-${v.group.id}`}
                  type="button"
                  className="ctl"
                  aria-label={`Open ${v.group.name}`}
                  onClick={() => onOpen(v.group.id)}
                >
                  Open →
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
