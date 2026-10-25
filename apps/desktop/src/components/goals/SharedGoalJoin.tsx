import { useEffect, useRef, useState } from "react";
import type { SharedInvitePreview, SharedOutcome } from "@/types/sharedGoals";
import type { SharedSync } from "@/lib/sync/shared/engine";
import { sharedRequests } from "@/lib/sharedGoals/requests";
import {
  dateLabel,
  scheduleText,
  WEEKDAYS,
  outcomeText,
} from "@/lib/sharedGoals/creation";
import { Commit } from "../calendar/common";
import { Callout, SharedHeader, SharedFoot, Stepper } from "./SharedParts";
export type JoinSource =
  { token: string } | { invitation: SharedInvitePreview };
export default function SharedGoalJoin({
  engine,
  source,
  locked,
  onClose,
  onDone,
}: {
  engine: SharedSync;
  source: JoinSource;
  locked: boolean;
  onClose: () => void;
  onDone: (id: string, eligible?: string | null) => void;
}) {
  const [preview, setPreview] = useState<SharedInvitePreview | null>(
      "invitation" in source ? source.invitation : null,
    ),
    [message, setMessage] = useState("");
  const [target, setTarget] = useState(3),
    [attempt, setAttempt] = useState(0),
    [loading, setLoading] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  const busy = useRef(false),
    requests = sharedRequests(engine);
  useEffect(() => {
    if (!("token" in source)) return;
    let active = true;
    setLoading(true);
    setUnavailable(false);
    void engine
      .previewInvite(source.token)
      .then(
        (value) => {
          if (!active) return;
          if (value.ok && "acceptedCount" in value) {
            setPreview(value);
            setMessage("");
          } else {
            setPreview(null);
            setUnavailable(true);
            setMessage(outcomeText(value.code));
          }
        },
        (e) => {
          if (active) {
            setUnavailable(true);
            setMessage(e.message);
          }
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [engine, source, attempt]);
  const action = async (decline = false) => {
    if (!preview || busy.current || locked || loading) return;
    if (!decline && preview.template === "gym" && (target < 2 || target > 7)) {
      setMessage("Choose 2–7 days per week.");
      return;
    }
    busy.current = true;
    setLoading(true);
    setMessage("");
    try {
      const out: SharedOutcome = decline
        ? await requests.perform(
            `decline:${preview.inviteId}`,
            "decline_invite",
            { invite_id: preview.inviteId },
          )
        : await requests.perform(`join:${preview.inviteId}`, "join", {
            ...("token" in source
              ? { token: source.token }
              : { invite_id: preview.inviteId }),
            ...(preview.template === "gym" ? { target } : {}),
          });
      if (out.ok) {
        await engine.syncNow();
        if (decline) {
          setUnavailable(true);
          setPreview(null);
          setMessage("Invitation declined.");
        } else onDone(out.groupId ?? preview.groupId, out.eligibleRound);
      } else {
        setMessage(outcomeText(out.code));
        if (
          [
            "full",
            "invalid_invite",
            "expired",
            "revoked",
            "archived",
            "not_published",
          ].includes(out.code)
        )
          setUnavailable(true);
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };
  const full = preview && preview.acceptedCount >= 8;
  return (
    <div
      className="gmain shared-page"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy.current) {
          e.preventDefault();
          onClose();
        }
        if (
          e.key === "Enter" &&
          !(e.target as HTMLElement).closest("button") &&
          !full &&
          preview?.published &&
          !unavailable
        ) {
          e.preventDefault();
          void action();
        }
      }}
    >
      <SharedHeader
        title="Join shared goal"
        kicker="INVITE"
        busy={loading}
        onClose={() => {
          if (!busy.current) onClose();
        }}
      />
      <div className="gscroll">
        <div className="shared-wizard">
          <section className="shared-card" aria-busy={loading}>
            {loading && !preview && <p role="status">Checking invitation…</p>}
            {preview && (
              <>
                <h2>
                  {preview.inviter} invited you to {preview.name}
                </h2>
                <p className="shared-note">
                  {scheduleText({
                    template: preview.template as "gym" | "custom",
                    schedule_kind: preview.scheduleKind as
                      "every" | "days" | "n",
                    weekdays: preview.weekdays,
                    times_per_week: preview.timesPerWeek,
                  })}
                </p>
                <div className="shared-facts">
                  <div>
                    <span className="mono sec">FIRST ROUND</span>
                    <strong>
                      {preview.firstRoundDate
                        ? dateLabel(preview.firstRoundDate)
                        : "Provisional · awaiting publication"}
                    </strong>
                  </div>
                  <div>
                    <span className="mono sec">ROUNDS START</span>
                    <strong>Every {WEEKDAYS[preview.roundWeekday]}</strong>
                  </div>
                  <div>
                    <span className="mono sec">PEOPLE</span>
                    <strong>
                      {preview.acceptedCount} accepted · maximum 8
                    </strong>
                  </div>
                  <div>
                    <span className="mono sec">TIME ZONE</span>
                    <strong>{preview.timeZone}</strong>
                  </div>
                </div>
                {preview.template === "gym" && (
                  <fieldset
                    disabled={locked || loading}
                    className="shared-fields"
                  >
                    <Stepper min={2} value={target} onChange={setTarget} />
                    <span className="shared-note">
                      Pick what you can keep up. Your target is visible to
                      everyone after joining.
                    </span>
                  </fieldset>
                )}
                <Callout>
                  {preview.published
                    ? "Joining is explicit. Your eligibility starts at the server-confirmed round boundary. You will see the roster and everyone's targets after joining."
                    : "This draft has not been published. The owner must publish it before you can join."}
                </Callout>
                {full && <p role="status">This goal is full (8 people).</p>}
                <div className="shared-actions">
                  <button
                    type="button"
                    className="ctl"
                    disabled={locked || loading}
                    onClick={() =>
                      "invitation" in source ? void action(true) : onClose()
                    }
                  >
                    {"invitation" in source ? "Decline" : "Not now"}
                  </button>
                  <span className="flex-1" />
                  <Commit
                    disabled={
                      locked ||
                      loading ||
                      !!full ||
                      unavailable ||
                      !preview.published
                    }
                    onClick={() => {
                      if (!unavailable && !full && preview.published)
                        void action();
                    }}
                  >
                    Join {preview.name}
                  </Commit>
                </div>
              </>
            )}
            {message && (
              <p role="status" className="shared-message">
                {message}
              </p>
            )}
            {unavailable && (
              <div className="shared-actions">
                <button type="button" className="ctl" onClick={onClose}>
                  Back to Shared
                </button>
                {"token" in source && (
                  <button
                    type="button"
                    className="ctl"
                    disabled={locked || loading}
                    onClick={() => setAttempt((n) => n + 1)}
                  >
                    Check invitation again
                  </button>
                )}
              </div>
            )}
            {!preview && !loading && !message && <p>No invitation selected.</p>}
          </section>
        </div>
      </div>
      <SharedFoot />
    </div>
  );
}
