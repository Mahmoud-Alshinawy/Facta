import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import type { SharedSync } from "@/lib/sync/shared/engine";
import type { SharedGroupView } from "@/lib/sharedGoals/view";
import { sharedRequests } from "@/lib/sharedGoals/requests";
import { dateLabel, outcomeText } from "@/lib/sharedGoals/creation";
import { Stepper } from "./SharedParts";
export default function SharedManage({
  engine,
  view,
  targetOnly,
  locked,
  onClose,
  onLeft,
}: {
  engine: SharedSync;
  view: SharedGroupView;
  targetOnly: boolean;
  locked: boolean;
  onClose: () => void;
  onLeft: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null),
    busy = useRef(false);
  const [target, setTarget] = useState(
    view.pendingTarget?.target ?? view.effectiveTarget ?? 2,
  );
  const [action, setAction] = useState<"leave" | "transfer_owner" | "archive">(
    "leave",
  );
  const [recipient, setRecipient] = useState(""),
    [message, setMessage] = useState("");
  // The split dialog stays open after a confirmed change so it can be
  // cancelled; the primary button then closes it until the value changes.
  const [saved, setSaved] = useState<number | null>(null);
  const done = targetOnly && saved !== null && saved === target;
  const [sending, setSending] = useState(false);
  useDialogFocus(ref, true);
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
  }, [sending]);
  // Disabling the submit button during a request can move focus to BODY.
  // Keep Escape/Tab scoped to the mounted modal even in that interval.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!busy.current) onClose();
      } else if (
        e.key === "Tab" &&
        !ref.current?.contains(document.activeElement)
      ) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  const owner = view.group.ownerId === engine.userId;
  const others = view.members.filter(
    (m) => !m.leftAt && m.userId !== engine.userId,
  );
  const needsRecipient =
    action === "transfer_owner" ||
    (action === "leave" && owner && !view.group.archivedAt);
  const unresolved = view.intentions.length > 0;
  const blocked =
    locked ||
    sending ||
    (!targetOnly && (unresolved || (needsRecipient && !recipient)));
  const submit = async (cancelTarget = false) => {
    if (done && !cancelTarget) return onClose();
    if (busy.current || blocked) return;
    busy.current = true;
    setSending(true);
    setMessage("");
    try {
      const requests = sharedRequests(engine),
        id = view.group.id;
      const out = targetOnly
        ? await requests.perform(`target:${id}`, "set_target", {
            group_id: id,
            target: cancelTarget ? null : target,
          })
        : action === "transfer_owner"
          ? await requests.perform(`transfer:${id}`, "transfer_owner", {
              group_id: id,
              user_id: recipient,
            })
          : action === "archive"
            ? await requests.perform(`archive:${id}`, "archive", {
                group_id: id,
              })
            : await requests.perform(`leave:${id}`, "leave", {
                group_id: id,
                ...(needsRecipient ? { transfer_to: recipient } : {}),
              });
      if (!out.ok) {
        setMessage(outcomeText(out.code));
        return;
      }
      await engine.syncNow();
      if (out.code === "left") onLeft();
      else if (targetOnly) {
        setSaved(cancelTarget ? null : target);
        setMessage(
          `Confirmed: ${out.target} days from ${dateLabel(out.effectiveRound!)}. Current and historical targets stay unchanged.`,
        );
      } else onClose();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      busy.current = false;
      setSending(false);
    }
  };
  return (
    <div className="shared-modal-scrim">
      <form
        ref={ref}
        className="shared-modal shared-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shared-manage-title"
        tabIndex={-1}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (!sending) onClose();
          }
        }}
      >
        <h2 id="shared-manage-title">
          {targetOnly ? "Edit split" : "Manage membership"}
        </h2>
        {targetOnly ? (
          <>
            <p className="shared-note">
              Everyone can see your target, at least 2 days. Changes apply at
              the next eligible round boundary, never mid-round.
            </p>
            <fieldset className="shared-fields" disabled={locked || sending}>
              <Stepper min={2} value={target} onChange={setTarget} />
            </fieldset>
            <p className="shared-note">
              Current target: {view.effectiveTarget} days
              {view.pendingTarget
                ? ` · Pending: ${view.pendingTarget.target} from ${dateLabel(view.pendingTarget.effectiveRound)}`
                : ""}
            </p>
            {!!view.pendingTarget && (
              <button
                type="button"
                className="ctl"
                disabled={blocked}
                onClick={() => void submit(true)}
              >
                Cancel pending change
              </button>
            )}
          </>
        ) : (
          <>
            <fieldset className="shared-fields" disabled={locked || sending}>
              <legend className="sr-only">Membership action</legend>
              <label>
                <input
                  data-autofocus
                  type="radio"
                  name="membership-action"
                  checked={action === "leave"}
                  onChange={() => setAction("leave")}
                />{" "}
                Leave group
              </label>
              {owner && !view.group.archivedAt && (
                <>
                  <label>
                    <input
                      type="radio"
                      name="membership-action"
                      checked={action === "transfer_owner"}
                      onChange={() => setAction("transfer_owner")}
                    />{" "}
                    Transfer ownership
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="membership-action"
                      checked={action === "archive"}
                      onChange={() => setAction("archive")}
                    />{" "}
                    Archive group
                  </label>
                </>
              )}
              {needsRecipient && (
                <div className="field">
                  <label htmlFor="shared-successor">New owner</label>
                  <select
                    className="inp"
                    id="shared-successor"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                  >
                    <option value="">Choose an accepted member</option>
                    {others.map((m) => (
                      <option key={m.id} value={m.userId}>
                        {engine
                          .getSnapshot()
                          .cache?.snapshot.profiles.find(
                            (p) => p.userId === m.userId,
                          )?.displayName ?? "Member"}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </fieldset>
            <p className="shared-note">
              {action === "leave"
                ? "Leaving immediately removes access to this group and its history on this device. Your accepted check-ins remain in peer-visible history. An owner must transfer ownership or archive first."
                : action === "archive"
                  ? "Archival is permanent. No new rounds or uncommitted check-ins can be added. The existing history stays read-only for members."
                  : "The selected accepted member becomes owner immediately. You remain a member."}
            </p>
            {needsRecipient && !others.length && (
              <p role="status">
                You are the only member. Archive the group before leaving.
              </p>
            )}
            {unresolved && (
              <p role="status">
                Resolve all pending/rejected check-ins before leaving,
                transferring or archiving. Close this dialog to sync or review
                them.
              </p>
            )}
          </>
        )}
        {message && (
          <p role="status" className="shared-message">
            {message}
          </p>
        )}
        <div className="shared-actions">
          <button
            data-autofocus={targetOnly ? true : undefined}
            type="button"
            className="ctl"
            disabled={sending}
            onClick={onClose}
          >
            Cancel · Esc
          </button>
          <span className="flex-1" />
          <button
            type="submit"
            className="b b-commit b-primary"
            disabled={blocked}
          >
            <span className="lab">
              {sending
                ? "Sending…"
                : done
                  ? "Done"
                  : targetOnly
                    ? "Confirm target change"
                    : action === "leave"
                      ? "Confirm leave"
                      : action === "archive"
                        ? "Confirm archive"
                        : "Confirm transfer"}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
