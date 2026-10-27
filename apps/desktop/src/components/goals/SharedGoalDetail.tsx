import { useEffect, useRef, useState } from "react";
import type { SharedSync, SharedStatus } from "@/lib/sync/shared/engine";
import type { SharedState } from "@/lib/sync/shared/state";
import {
  sharedCell,
  sharedGroupView,
  percent,
  olderHistoryRange,
} from "@/lib/sharedGoals/view";
import { addDays } from "@/lib/sharedGoals/dates";
import { dateLabel, WEEKDAYS } from "@/lib/sharedGoals/creation";
import {
  SharedRanking,
  CheckinAction,
  RoundStatus,
  PendingReview,
} from "./SharedProgress";
import SharedManage from "./SharedManage";
export default function SharedGoalDetail({
  engine,
  data,
  status,
  id,
  focusId,
  locked,
  now,
  keyboardBlocked,
  onBack,
  onInvite,
}: {
  engine: SharedSync;
  data: SharedState;
  status: SharedStatus;
  id: string;
  focusId?: string;
  locked: boolean;
  now: () => number;
  keyboardBlocked: boolean;
  onBack: () => void;
  onInvite: () => void;
}) {
  const [selected, setSelected] = useState<string>(),
    [dialog, setDialog] = useState<"target" | "manage" | null>(null);
  const [message, setMessage] = useState(""),
    [loadingHistory, setLoadingHistory] = useState(false);
  const title = useRef<HTMLHeadingElement>(null),
    root = useRef<HTMLDivElement>(null);
  const view = sharedGroupView(data, engine.userId, id, now(), selected);
  useEffect(() => {
    const raf = requestAnimationFrame(() =>
      ((focusId && document.getElementById(focusId)) || title.current)?.focus(),
    );
    return () => cancelAnimationFrame(raf);
  }, [id, !!view, focusId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.isComposing ||
        e.repeat ||
        keyboardBlocked ||
        dialog ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.shiftKey ||
        (e.target as HTMLElement)?.closest(
          'input,textarea,select,[contenteditable="true"],[role="dialog"]',
        )
      )
        return;
      if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      }
      if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        root.current
          ?.querySelector<HTMLButtonElement>(
            '[data-checkin="detail"]:not(:disabled)',
          )
          ?.click();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [keyboardBlocked, dialog, onBack]);
  if (!view)
    return (
      <div className="gmain shared-page">
        <header className="hd">
          <button type="button" className="ctl" onClick={onBack}>
            Shared
          </button>
          <h1 ref={title} tabIndex={-1}>
            Group unavailable
          </h1>
        </header>
        <p className="shared-wizard" role="status">
          Your account no longer has access to this group. Cached scores and
          controls are unavailable.
        </p>
        <PendingReview
          engine={engine}
          intentions={data.outbox.filter((i) => i.groupId === id)}
          unavailable
        />
      </div>
    );
  const snapshot = data.cache!.snapshot;
  const name = (uid: string) =>
    uid === engine.userId
      ? "You"
      : (snapshot.profiles.find((p) => p.userId === uid)?.displayName ??
        "Member");
  const cutoff = (at: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: view.group.timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(at));
  const older = async () => {
    const range = olderHistoryRange(data, view.group, view.today);
    if (loadingHistory || !range) return;
    setLoadingHistory(true);
    setMessage("");
    try {
      await engine.syncNow(range);
      if (engine.getStatus().lastError)
        setMessage(engine.getStatus().lastError!);
    } finally {
      setLoadingHistory(false);
    }
  };
  const historical = view.rounds.filter(
    (r) => r.roundStart !== view.current?.roundStart,
  );
  const canOlder = !!olderHistoryRange(data, view.group, view.today);
  return (
    <div ref={root} className="gmain shared-page shared-detail">
      <header className="hd shared-detail-header">
        <button type="button" className="ctl" onClick={onBack}>
          ← Shared
        </button>
        <div className="shared-detail-title">
          <span className="mono sec">
            {view.group.template.toUpperCase()} · ROUNDS START{" "}
            {WEEKDAYS[view.group.roundWeekday].toUpperCase()}
          </span>
          <h1 ref={title} tabIndex={-1}>
            {view.group.name}
          </h1>
        </div>
        <span className="flex-1" />
        {view.group.ownerId === engine.userId && !view.group.archivedAt && (
          <button
            id={`shared-invite-${id}`}
            type="button"
            className="ctl"
            onClick={onInvite}
          >
            Invite people
          </button>
        )}
        {view.group.template === "gym" && !view.group.archivedAt && (
          <button
            type="button"
            className="ctl"
            disabled={locked}
            onClick={() => setDialog("target")}
          >
            Edit split
          </button>
        )}
        <CheckinAction
          engine={engine}
          view={view}
          locked={locked}
          now={now}
          detail
        />
        <button
          type="button"
          className="ctl"
          disabled={locked}
          onClick={() => setDialog("manage")}
        >
          Manage
        </button>
      </header>
      <div className="gscroll">
        <div className="gwrap">
          <div className="shared-status-strip" role="status">
            <RoundStatus view={view} />
            <span>
              {view.group.timeZone} · Today {dateLabel(view.today)}
            </span>
            <span>
              {view.confirmedAt
                ? `${view.stale || !navigator.onLine ? "Last confirmed" : "Confirmed"} ${new Date(view.confirmedAt).toLocaleString()}`
                : "No matching round coverage"}
            </span>
          </div>
          {view.reason && (
            <p className="shared-callout">
              {view.reason}
              {view.member.eligibleRound &&
              view.member.eligibleRound > (view.slot ?? "")
                ? ". Your eligibility starts at that boundary; earlier days are not missed."
                : ""}
            </p>
          )}
          {view.round && view.round.endReason !== "scheduled" && (
            <p className="shared-callout">
              {view.round.endReason === "archived"
                ? "Archived early"
                : "Paused early"}{" "}
              · cutoff {cutoff(view.round.activityEnd)}. The original roster and
              targets are retained.
            </p>
          )}
          {status.lastError && (
            <p role="status" className="shared-message">
              {status.lastError}
            </p>
          )}
          {view.pendingTarget && (
            <p className="shared-callout">
              Your split changes {dateLabel(view.pendingTarget.effectiveRound)}:{" "}
              {view.effectiveTarget} → {view.pendingTarget.target} days. Current
              and historical targets stay unchanged.
            </p>
          )}
          <PendingReview engine={engine} intentions={view.intentions} />
          {message && (
            <p role="status" className="shared-message">
              {message}
            </p>
          )}
          <div className="shared-round-picker">
            <label htmlFor="shared-round">Displayed round</label>
            <select
              id="shared-round"
              className="inp"
              value={view.round?.roundStart ?? ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {!view.round && (
                <option value="">No confirmed scored rounds</option>
              )}
              {view.rounds.map((r) => (
                <option key={r.roundStart} value={r.roundStart}>
                  {r.roundStart} – {addDays(r.roundEnd, -1)}
                  {r.endReason !== "scheduled" ? ` · ${r.endReason} early` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ctl"
              onClick={() => {
                setSelected(undefined);
                void engine.syncNow();
              }}
            >
              Current / refresh
            </button>
          </div>
          <div className="shared-detail-grid">
            <div className="shared-panel-column">
              <section
                className="shared-panel"
                aria-label="Leaderboard"
                tabIndex={0}
              >
                <div className="shared-section-title">
                  <h2>Leaderboard</h2>
                  <span className="shared-note">
                    Days done / personal target, capped at 100%
                  </span>
                </div>
                <div className="shared-note">
                  Green: 70% or more · Grey: under 70% · All ranks from server
                </div>
                <SharedRanking view={view} userId={engine.userId} />
                {view.members
                  .filter(
                    (m) => !view.scores.some((s) => s.membershipId === m.id),
                  )
                  .map((m) => (
                    <div className="shared-person" key={m.id}>
                      <span className="shared-avatar pending">
                        {name(m.userId).slice(0, 1)}
                      </span>
                      <span className="flex-1">{name(m.userId)}</span>
                      <span className="shared-note">
                        {m.leftAt
                          ? "Left"
                          : m.eligibleRound
                            ? `Starts ${dateLabel(m.eligibleRound)}`
                            : "Awaiting publication"}{" "}
                        · No rank
                      </span>
                    </div>
                  ))}
                {view.invited.map((i) => (
                  <div className="shared-person" key={i.id}>
                    <span className="shared-avatar pending">
                      {name(i.recipientId!).slice(0, 1)}
                    </span>
                    <span className="flex-1">{name(i.recipientId!)}</span>
                    <span className="shared-note">
                      Invited · Not joined · No rank
                    </span>
                  </div>
                ))}
              </section>
              <section
                className="shared-panel"
                aria-label="Weekly check-ins"
                tabIndex={0}
              >
                <h2>Check-ins</h2>
                {view.round ? (
                  <div className="shared-table-scroll">
                    <table className="shared-check-table">
                      <caption className="sr-only">
                        Check-ins for {view.round.roundStart}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Member</th>
                          {view.days.map((d) => (
                            <th key={d.date} scope="col">
                              {dateLabel(d.date)
                                .split(" ")
                                .slice(0, 2)
                                .join(" ")}
                            </th>
                          ))}
                          <th scope="col">Done</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.members.map((m) => (
                          <tr key={m.id}>
                            <th scope="row">
                              {name(m.userId)}
                              {m.leftAt ? " · Left" : ""}
                            </th>
                            {view.days.map((d) => {
                              const state = sharedCell(data, view, m, d.date),
                                ownToday =
                                  m.id === view.member.id &&
                                  d.date === view.today;
                              const end = Math.min(
                                Date.parse(view.round!.activityEnd),
                                m.leftAt ? Date.parse(m.leftAt) : Infinity,
                              );
                              const label = `${name(m.userId)} ${d.date}: ${state}${end > d.start && end < d.end ? ` · cutoff ${cutoff(new Date(end).toISOString())}` : ""}`;
                              return (
                                <td key={d.date}>
                                  {ownToday && view.canCheck ? (
                                    <button
                                      type="button"
                                      className={`shared-day ${state.replaceAll(" ", "-")}`}
                                      aria-label={label}
                                      aria-pressed={view.checked}
                                      onClick={() =>
                                        root.current
                                          ?.querySelector<HTMLButtonElement>(
                                            '[data-checkin="detail"]:not(:disabled)',
                                          )
                                          ?.click()
                                      }
                                    >
                                      {view.checked ? "✓" : "○"}
                                    </button>
                                  ) : (
                                    <span
                                      className={`shared-day ${state.replaceAll(" ", "-")}`}
                                      aria-label={label}
                                      title={label}
                                    >
                                      {state === "done"
                                        ? "✓"
                                        : state === "pending"
                                          ? "…"
                                          : state === "not done"
                                            ? "−"
                                            : state === "today"
                                              ? "○"
                                              : "·"}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="mono">
                              {view.scores.find((s) => s.membershipId === m.id)
                                ? `${view.scores.find((s) => s.membershipId === m.id)!.completedDays}/${view.scores.find((s) => s.membershipId === m.id)!.target}`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="shared-note">
                    No scored round yet. No missed days are assigned.
                  </p>
                )}
                <p className="shared-note">
                  ✓ Done · − Not done · ○ Today · … Pending · Dots: future,
                  rest, inactive or not eligible (each labelled).
                </p>
              </section>
            </div>
            <div className="shared-panel-column">
              <section
                className="shared-panel"
                aria-label="Targets and split"
                tabIndex={0}
              >
                <h2>
                  {view.group.template === "gym"
                    ? "Targets and split"
                    : "Shared schedule"}
                </h2>
                {view.members.map((m) => {
                  const historicalScore = view.scores.find(
                    (s) => s.membershipId === m.id,
                  );
                  const versions = snapshot.targets
                    .filter((t) => t.membershipId === m.id && !t.deletedAt)
                    .sort((a, b) =>
                      b.effectiveRound.localeCompare(a.effectiveRound),
                    );
                  const effective =
                    view.group.template === "gym"
                      ? (historicalScore?.target ??
                        versions.find(
                          (t) =>
                            t.effectiveRound <=
                            (view.slot ?? view.group.firstRoundDate ?? ""),
                        )?.target ??
                        m.initialGymTarget)
                      : view.effectiveTarget;
                  const next = versions.find(
                    (t) =>
                      t.effectiveRound >
                        (view.slot ?? view.group.firstRoundDate ?? "") &&
                      t.target !== effective,
                  );
                  return (
                    <div className="shared-person shared-target-row" key={m.id}>
                      <span className="flex-1">
                        {name(m.userId)}
                        {m.leftAt && " · Left"}
                      </span>
                      <span className="mono">
                        {effective} {effective === 1 ? "day" : "days"}
                      </span>
                      {next && !m.leftAt && (
                        <small>
                          Next: {next.target} from{" "}
                          {dateLabel(next.effectiveRound)}
                        </small>
                      )}
                    </div>
                  );
                })}
                <p className="shared-note">
                  {view.group.template === "gym"
                    ? "Everyone chooses 2–7 days. Changes start next round, never mid-round."
                    : view.group.scheduleKind === "every"
                      ? "Every day · same rule for everyone"
                      : view.group.scheduleKind === "days"
                        ? view.group.weekdays.map((d) => WEEKDAYS[d]).join(", ")
                        : `${view.group.timesPerWeek} ${view.group.timesPerWeek === 1 ? "time" : "times"} per week · same rule for everyone`}
                </p>
                <p className="shared-note">
                  Rounds start {WEEKDAYS[view.group.roundWeekday]} ·{" "}
                  {view.group.timeZone}
                </p>
              </section>
              <section
                className="shared-panel"
                aria-label="Week by week"
                tabIndex={0}
              >
                <h2>Week by week</h2>
                <span className="mono sec">SERVER GROUP AVERAGE</span>
                {historical.map((r) => {
                  const scores = snapshot.scores.filter(
                      (s) => s.groupId === id && s.roundStart === r.roundStart,
                    ),
                    winners = scores.filter((s) => s.rank === 1);
                  return (
                    <div className="shared-history-row" key={r.roundStart}>
                      <button
                        type="button"
                        className="ctl"
                        onClick={() => setSelected(r.roundStart)}
                      >
                        {r.roundStart}
                      </button>
                      <div className="shared-score-bar">
                        <i
                          className={
                            (scores[0]?.groupAveragePct ?? 0) >= 70 ? "" : "low"
                          }
                          style={{
                            width: `${scores[0]?.groupAveragePct ?? 0}%`,
                          }}
                        />
                      </div>
                      <span className="mono">
                        {scores.length
                          ? percent(scores[0].groupAveragePct)
                          : "Not loaded"}
                      </span>
                      <small>
                        Led by{" "}
                        {winners.map((s) => s.displayName).join(", ") ||
                          "No confirmed ranks"}
                        {winners.length > 1 ? " · tie" : ""}
                        {r.endReason !== "scheduled"
                          ? ` · ${r.endReason} early at ${cutoff(r.activityEnd)}`
                          : ""}{" "}
                        ·{" "}
                        {view.group.archivedAt
                          ? "Archived · frozen"
                          : r.roundEnd > addDays(view.today, -7)
                            ? "Awaiting late sync"
                            : "Confirmed history"}
                      </small>
                    </div>
                  );
                })}
                {!historical.length && (
                  <p className="shared-note">
                    No earlier confirmed scored rounds. Inactive gaps are not
                    zero-score weeks.
                  </p>
                )}
                <button
                  type="button"
                  className="ctl"
                  disabled={!canOlder || loadingHistory}
                  onClick={() => void older()}
                >
                  {loadingHistory ? "Loading…" : "Load older rounds"}
                </button>
              </section>
            </div>
          </div>
        </div>
      </div>
      <footer className="foot">
        <span>C · check in / undo today</span>
        <span>Esc · back to Shared</span>
        <span className="flex-1" />
        <span>Tab · move between panels</span>
      </footer>
      {dialog && (
        <SharedManage
          key={dialog}
          engine={engine}
          view={view}
          targetOnly={dialog === "target"}
          locked={locked}
          onClose={() => setDialog(null)}
          onLeft={onBack}
        />
      )}
    </div>
  );
}
