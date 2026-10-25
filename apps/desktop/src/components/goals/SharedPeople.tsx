import { useState } from "react";
import { Link, Copy, X } from "lucide-react";
import type { SharedSync } from "@/lib/sync/shared/engine";
import type { SharedState } from "@/lib/sync/shared/state";
import { sharedRequests } from "@/lib/sharedGoals/requests";
import { outcomeText } from "@/lib/sharedGoals/creation";
import { Callout } from "./SharedParts";
export default function SharedPeople({
  engine,
  data,
  groupId,
  locked,
  now,
  report,
}: {
  engine: SharedSync;
  data: SharedState;
  groupId: string;
  locked: boolean;
  now: number;
  report: (text: string) => void;
}) {
  const [handle, setHandle] = useState("");
  const requests = sharedRequests(engine),
    snapshot = data.cache?.snapshot;
  const group = snapshot?.groups.find((g) => g.id === groupId);
  const members =
    snapshot?.memberships.filter(
      (m) => m.groupId === groupId && !m.leftAt && !m.deletedAt,
    ) ?? [];
  const invites =
    snapshot?.invites.filter(
      (i) => i.groupId === groupId && !i.deletedAt && i.state === "pending",
    ) ?? [];
  const link = invites
    .filter((i) => i.kind === "link")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const token = link && requests.tokens.get(link.id);
  const seats =
    members.length +
    invites.filter((i) => i.kind === "direct" && Date.parse(i.expiresAt) > now)
      .length;
  const perform = async (task: () => Promise<unknown>) => {
    if (locked) return;
    try {
      await task();
      await engine.syncNow();
    } catch (e) {
      report(
        e instanceof Error
          ? e.message
          : "The request could not complete. Retry it before a replacement.",
      );
    }
  };
  const issue = () =>
    perform(async () => {
      const out = link
        ? await requests.perform(`rotate:${link.id}`, "rotate_invite", {
            invite_id: link.id,
          })
        : await requests.perform(`link:${groupId}`, "issue_link", {
            group_id: groupId,
          });
      report(
        out.ok
          ? out.token
            ? "Invite link is ready to copy."
            : "Link issued. Rotate it to recover a new one-time token."
          : outcomeText(out.code),
      );
    });
  const add = () =>
    perform(async () => {
      const name = handle.trim().replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(name)) {
        report(
          "Enter an exact username of 3–24 letters, numbers or underscores.",
        );
        return;
      }
      const out = await requests.perform(
        `invite:${groupId}:${name}`,
        "invite",
        { group_id: groupId, handle: name },
      );
      report(
        out.ok ? "Invite sent. Acceptance is pending." : outcomeText(out.code),
      );
      if (out.ok) setHandle("");
    });
  return (
    <>
      <div className="shared-section-title">
        <h2>People</h2>
        <span className="mono sec">{seats} of 8 · 2 to 8 including you</span>
      </div>
      <div className="field">
        <span className="flab">Invite link</span>
        <div className="shared-link">
          <Link size={16} aria-hidden="true" />
          {token ? (
            <input
              aria-label="Invite link"
              readOnly
              value={`facta://join/${token}`}
              onFocus={(e) => e.currentTarget.select()}
            />
          ) : (
            <span>
              {link
                ? "A link exists. Rotate to get a new copy."
                : "Create a real link for this goal."}
            </span>
          )}
          {token && (
            <button
              className="ctl"
              type="button"
              disabled={locked || (link && Date.parse(link.expiresAt) <= now)}
              onClick={() => {
                void navigator.clipboard
                  .writeText(`facta://join/${token}`)
                  .then(
                    () => report("Invite link copied."),
                    () =>
                      report(
                        "Clipboard is unavailable. Select the link and copy it with Ctrl+C.",
                      ),
                  );
              }}
            >
              <Copy size={14} />
              Copy
            </button>
          )}
          <button
            className="ctl"
            type="button"
            disabled={locked}
            onClick={issue}
          >
            {link ? "Rotate link" : "Create link"}
          </button>
          {link && (
            <button
              className="ctl"
              type="button"
              disabled={locked}
              onClick={() =>
                void perform(async () => {
                  const out = await requests.perform(
                    `revoke:${link.id}`,
                    "revoke_invite",
                    { invite_id: link.id },
                  );
                  report(
                    out.ok ? "Invite link revoked." : outcomeText(out.code),
                  );
                })
              }
            >
              Revoke link
            </button>
          )}
        </div>
        <span className="shared-note">
          Rotating invalidates the old link. Links expire after seven days.
        </span>
      </div>
      <div className="field">
        <label htmlFor="shared-invite-handle">Or add by username</label>
        <div className="option-row">
          <input
            id="shared-invite-handle"
            className="inp"
            value={handle}
            placeholder="@username"
            autoComplete="off"
            disabled={locked}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                void add();
              }
            }}
          />
          <button
            className="ctl"
            type="button"
            disabled={locked || seats >= 8}
            onClick={add}
          >
            Add
          </button>
        </div>
      </div>
      <div>
        {members.map((m) => {
          const p = snapshot?.profiles.find((p) => p.userId === m.userId);
          return (
            <div className="shared-person" key={m.id}>
              <span className="shared-avatar">{p?.displayName[0] ?? "?"}</span>
              <span className="flex-1">
                {p?.displayName ?? "Member"}
                <small>
                  {m.userId === group?.ownerId ? "Owner" : "Joined"}
                </small>
              </span>
              <span className="shared-note">
                {group?.template === "gym"
                  ? `${m.initialGymTarget} days a week`
                  : "Same rule for all"}
              </span>
            </div>
          );
        })}
        {invites
          .filter((i) => i.kind === "direct")
          .map((i) => {
            const p = snapshot?.profiles.find(
              (p) => p.userId === i.recipientId,
            );
            const name = p?.displayName ?? "Invited person";
            return (
              <div className="shared-person" key={i.id}>
                <span className="shared-avatar pending">{name[0]}</span>
                <span className="flex-1">
                  {name}
                  <small>
                    {Date.parse(i.expiresAt) <= now
                      ? "Expired"
                      : "Invite sent · picks days on joining"}
                  </small>
                </span>
                <button
                  type="button"
                  className="ctl"
                  disabled={locked}
                  aria-label={`Revoke invitation for ${name}`}
                  onClick={() =>
                    void perform(async () => {
                      const out = await requests.perform(
                        `revoke:${i.id}`,
                        "revoke_invite",
                        { invite_id: i.id },
                      );
                      report(
                        out.ok ? "Invitation revoked." : outcomeText(out.code),
                      );
                    })
                  }
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
      </div>
      <Callout>
        {group?.publishedAt
          ? "People joining later become eligible at the next round boundary. Accepted invitations alone do not activate a round."
          : "Invitations are pending publication. A one-person goal can publish in waiting state; scoring starts only at a boundary with at least two eligible members."}
      </Callout>
    </>
  );
}
