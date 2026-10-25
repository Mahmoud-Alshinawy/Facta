import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, Plus } from "lucide-react";
import type { SharedInvitePreview } from "@/types/sharedGoals";
import type { SharedSync } from "@/lib/sync/shared/engine";
import type { LinkIntent } from "@/lib/sharedGoals/deepLinks";
import { parseFactaLink } from "@/lib/sharedGoals/deepLinks";
import { sharedRequests } from "@/lib/sharedGoals/requests";
import {
  dateLabel,
  outcomeText,
  validateProfile,
} from "@/lib/sharedGoals/creation";
import { Commit } from "../calendar/common";
import { SharedHeader, SharedFoot, ResultCard, Callout } from "./SharedParts";
import SharedGoalCreate from "./SharedGoalCreate";
import SharedGoalJoin, { type JoinSource } from "./SharedGoalJoin";
import SharedPeople from "./SharedPeople";
import "./shared-goals.css";
const realNow = () => Date.now();
type Panel =
  | { kind: "home" }
  | { kind: "create"; id?: string; key: number }
  | { kind: "paste" }
  | { kind: "join"; source: JoinSource }
  | { kind: "people"; id: string }
  | { kind: "result"; id: string; eligible?: string | null };
export function SignedOutInvitation({ onDismiss }: { onDismiss: () => void }) {
  return (
    <aside role="status" className="shared-auth-notice">
      Invitation kept for this session. Sign in to review it. Nothing joins
      automatically.
      <button type="button" onClick={onDismiss}>
        Dismiss invitation
      </button>
    </aside>
  );
}
function ProfileSetup({
  engine,
  locked,
  report,
  onClose,
}: {
  engine: SharedSync;
  locked: boolean;
  report: (m: string) => void;
  onClose: () => void;
}) {
  const [handle, setHandle] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  const busy = useRef(false);
  const submit = async () => {
    if (locked || busy.current) return;
    const problem = validateProfile(handle, name);
    if (problem) {
      setError(problem);
      return;
    }
    busy.current = true;
    try {
      const out = await sharedRequests(engine).perform(
        "profile",
        "set_profile",
        { handle, display_name: name.trim() },
      );
      if (out.ok) {
        report("Shared profile saved.");
        await engine.syncNow();
      } else setError(outcomeText(out.code));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
    }
  };
  return (
    <>
      <SharedHeader
        title="Your shared profile"
        kicker="BEFORE YOU BEGIN"
        onClose={onClose}
      />
      <div className="gscroll">
        <form
          className="shared-wizard"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <section className="shared-card">
            <h2>Let people find you by username</h2>
            <Callout>
              Your name and handle are visible to your groups. Your handle is
              fixed after setup. There is no public directory.
            </Callout>
            <fieldset disabled={locked} className="shared-fields">
              <div className="field">
                <label htmlFor="shared-handle">Username</label>
                <input
                  id="shared-handle"
                  className="inp"
                  autoComplete="off"
                  maxLength={24}
                  value={handle}
                  onChange={(e) =>
                    setHandle(e.target.value.toLowerCase().replace(/^@/, ""))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="shared-display-name">Display name</label>
                <input
                  id="shared-display-name"
                  className="inp"
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </fieldset>
            {error && (
              <p role="status" className="shared-message">
                {error}
              </p>
            )}
            <Commit type="submit" keyHint="Enter" disabled={locked}>
              Save profile
            </Commit>
          </section>
        </form>
      </div>
    </>
  );
}
export default function SharedGoalsPage({
  engine,
  weekStart,
  onMine,
  request,
  onRequestHandled,
  keyboardBlocked = false,
  now = realNow,
}: {
  engine: SharedSync;
  weekStart: number;
  onMine: () => void;
  request?: LinkIntent | null;
  onRequestHandled?: () => void;
  keyboardBlocked?: boolean;
  now?: () => number;
}) {
  const data = useSyncExternalStore(engine.subscribe, engine.getSnapshot),
    status = useSyncExternalStore(engine.subscribe, engine.getStatus);
  const requests = sharedRequests(engine),
    pending = useSyncExternalStore(requests.subscribe, requests.getSnapshot),
    locked = pending.length > 0;
  const [panel, setPanel] = useState<Panel>({ kind: "home" }),
    [message, setMessage] = useState(""),
    [paste, setPaste] = useState(""),
    [invites, setInvites] = useState<SharedInvitePreview[]>([]),
    [refresh, setRefresh] = useState(0);
  const title = useRef<HTMLHeadingElement>(null),
    returnFocus = useRef<HTMLElement | null>(null),
    handled = useRef<number | null>(null);
  const profile = data.cache?.snapshot.profiles.find(
    (p) => p.userId === engine.userId && !p.deletedAt,
  );
  const groups =
    data.cache?.snapshot.groups.filter((g) => !g.deletedAt && !g.archivedAt) ??
    [];
  const open = (next: Panel) => {
    returnFocus.current = document.activeElement as HTMLElement;
    setMessage("");
    setPanel(next);
  };
  const close = () => {
    setPanel({ kind: "home" });
    setRefresh((n) => n + 1);
    requestAnimationFrame(() => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      else title.current?.focus();
    });
  };
  const done = (id: string, eligible?: string | null) => {
    setPanel({ kind: "result", id, eligible });
    setRefresh((n) => n + 1);
  };
  useEffect(() => {
    if (!request || request.sequence === handled.current) return;
    handled.current = request.sequence;
    if (request.route.kind === "join")
      setPanel({ kind: "join", source: { token: request.route.token } });
    else if (request.route.kind === "group")
      setPanel({ kind: "result", id: request.route.id });
    onRequestHandled?.();
  }, [request, onRequestHandled]);
  useEffect(() => {
    if (!profile) return;
    let alive = true;
    const load = () =>
      void engine.pendingInvites().then(
        (value) => {
          if (alive) setInvites(value);
        },
        (e) => {
          if (alive) setMessage(e.message);
        },
      );
    load();
    const interval = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    window.addEventListener("online", load);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("focus", load);
      window.removeEventListener("online", load);
    };
  }, [engine, !!profile, refresh]);
  useEffect(() => {
    if (panel.kind !== "home") return;
    const r = requestAnimationFrame(() =>
      (returnFocus.current?.isConnected
        ? returnFocus.current
        : title.current
      )?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(r);
  }, [panel.kind, !!profile]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        keyboardBlocked ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target as HTMLElement)?.closest(
          'input,textarea,select,[contenteditable="true"],[role="dialog"]',
        )
      )
        return;
      if (e.shiftKey && e.key.toLowerCase() === "n" && panel.kind === "home") {
        e.preventDefault();
        open({ kind: "create", key: Date.now() });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [keyboardBlocked, panel.kind]);
  const recovery = pending.length > 0 && (
    <aside className="shared-recovery" role="status">
      <p>
        Keep this session open until unresolved requests settle. Retrying uses
        the same UUID and body; invitation tokens stay in memory.
      </p>
      {pending.map((p) => (
        <div key={p.key}>
          <span>
            {p.command.operation.replaceAll("_", " ")}
            {p.busy ? " · sending…" : " · result uncertain"}
          </span>
          <button
            type="button"
            className="ctl"
            disabled={p.busy}
            onClick={() => {
              void requests.retry(p.key).then(
                async (out) => {
                  setMessage(
                    out.ok
                      ? "Request confirmed. Review the refreshed goal before continuing."
                      : outcomeText(out.code),
                  );
                  await engine.syncNow();
                  setRefresh((n) => n + 1);
                },
                (e) => setMessage(e.message),
              );
            }}
          >
            Retry same request
          </button>
        </div>
      ))}
    </aside>
  );
  if (!data.cache)
    return (
      <div className="gmain shared-page">
        <SharedHeader
          title="Shared goals"
          kicker="YOUR GROUPS"
          onClose={onMine}
        />
        <div className="shared-wizard">
          <Callout>{status.lastError ?? "Loading shared goals…"}</Callout>
          <button
            type="button"
            className="ctl"
            onClick={() => void engine.syncNow()}
          >
            Retry loading
          </button>
        </div>
      </div>
    );
  const content = !profile ? (
    <div
      className="gmain shared-page"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onMine();
        }
      }}
    >
      <ProfileSetup
        engine={engine}
        locked={locked}
        report={setMessage}
        onClose={onMine}
      />
      <SharedFoot />
    </div>
  ) : panel.kind === "create" ? (
    <SharedGoalCreate
      key={panel.key}
      engine={engine}
      data={data}
      savedId={panel.id}
      locked={locked}
      weekStart={weekStart}
      now={now}
      onClose={close}
      onDone={done}
    />
  ) : panel.kind === "join" ? (
    <SharedGoalJoin
      key={
        "token" in panel.source
          ? panel.source.token
          : panel.source.invitation.inviteId
      }
      engine={engine}
      source={panel.source}
      locked={locked}
      onClose={close}
      onDone={done}
    />
  ) : panel.kind === "people" ? (
    <div
      className="gmain shared-page"
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <SharedHeader
        title="Invite people"
        kicker="SHARED GOAL"
        onClose={close}
      />
      <div className="gscroll">
        <section className="shared-wizard">
          <div className="shared-card">
            <SharedPeople
              engine={engine}
              data={data}
              groupId={panel.id}
              locked={locked}
              now={now()}
              report={setMessage}
            />
            {message && <p role="status">{message}</p>}
          </div>
        </section>
      </div>
      <SharedFoot />
    </div>
  ) : panel.kind === "result" ? (
    <div className="gmain shared-page">
      <SharedHeader title="Shared goal" kicker="YOUR GROUP" onClose={close} />
      <div className="gscroll">
        <div className="shared-wizard">
          <ResultCard
            title={
              groups.find((g) => g.id === panel.id)?.name ??
              "This goal is unavailable for this account"
            }
            onBack={close}
          >
            {groups.some((g) => g.id === panel.id) && (
              <>
                <p>
                  You are a member.{" "}
                  {panel.eligible
                    ? `Your eligibility starts ${dateLabel(panel.eligible)}.`
                    : "Rounds wait for at least two eligible members."}
                </p>
                {groups.find((g) => g.id === panel.id)?.ownerId ===
                  engine.userId && (
                  <button
                    type="button"
                    className="ctl"
                    onClick={() => open({ kind: "people", id: panel.id })}
                  >
                    Invite people
                  </button>
                )}
              </>
            )}
          </ResultCard>
        </div>
      </div>
    </div>
  ) : panel.kind === "paste" ? (
    <div
      className="gmain shared-page"
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <SharedHeader
        title="Join with a link"
        kicker="INVITATION"
        onClose={close}
      />
      <div className="gscroll">
        <form
          className="shared-wizard"
          onSubmit={(e) => {
            e.preventDefault();
            const link = parseFactaLink(paste);
            if (link?.kind !== "join") {
              setMessage(
                "Paste an exact facta://join/ invitation link, without extra parameters.",
              );
              return;
            }
            setPaste("");
            setPanel({ kind: "join", source: { token: link.token } });
          }}
        >
          <section className="shared-card">
            <label htmlFor="shared-paste">Invitation link</label>
            <input
              id="shared-paste"
              className="inp"
              autoComplete="off"
              spellCheck={false}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <Callout>
              You will review the invitation before choosing to join.
            </Callout>
            {message && <p role="status">{message}</p>}
            <Commit type="submit" keyHint="Enter">
              Review invitation
            </Commit>
          </section>
        </form>
      </div>
      <SharedFoot />
    </div>
  ) : (
    <div className="gmain shared-page">
      <header className="hd shared-header">
        <div>
          <span className="mono sec">YOUR GROUPS</span>
          <h1 ref={title} tabIndex={-1}>
            Goals
          </h1>
        </div>
        <div className="seg" role="radiogroup" aria-label="Goals">
          <button
            type="button"
            role="radio"
            aria-checked={false}
            onClick={onMine}
          >
            Mine
          </button>
          <button type="button" role="radio" aria-checked={true}>
            Shared
          </button>
        </div>
        <span className="flex-1" />
        <button
          type="button"
          className="ctl"
          onClick={() => {
            setPaste("");
            open({ kind: "paste" });
          }}
        >
          <Link size={15} />
          Join with a link
        </button>
        <Commit onClick={() => open({ kind: "create", key: Date.now() })}>
          <Plus size={16} />
          New shared goal
        </Commit>
      </header>
      <div className="gscroll">
        <div className="gwrap">
          {status.lastError && (
            <p role="status" className="shared-callout">
              {status.lastError}
            </p>
          )}
          {message && (
            <p role="status" className="shared-callout">
              {message}
            </p>
          )}
          {invites.map((i) => (
            <section
              className="shared-invitation"
              key={i.inviteId}
              aria-label="Pending invitation"
            >
              <span className="shared-avatar">{i.inviter[0]}</span>
              <div className="flex-1">
                <strong>
                  {i.inviter} invited you to {i.name}
                </strong>
                <p className="shared-note">
                  {i.acceptedCount} people ·{" "}
                  {i.template === "gym"
                    ? "Choose your days when joining"
                    : "Same schedule for everyone"}{" "}
                  ·{" "}
                  {i.published && i.firstRoundDate
                    ? `First round ${dateLabel(i.firstRoundDate)}`
                    : "Awaiting publication"}
                </p>
              </div>
              <button
                type="button"
                className="ctl"
                disabled={locked}
                onClick={() => {
                  void requests
                    .perform(`decline:${i.inviteId}`, "decline_invite", {
                      invite_id: i.inviteId,
                    })
                    .then(
                      async (out) => {
                        setMessage(
                          out.ok
                            ? "Invitation declined."
                            : outcomeText(out.code),
                        );
                        await engine.syncNow();
                        setRefresh((n) => n + 1);
                      },
                      (e) => setMessage(e.message),
                    );
                }}
              >
                Decline
              </button>
              <Commit
                onClick={() =>
                  open({ kind: "join", source: { invitation: i } })
                }
              >
                {i.template === "gym"
                  ? "Choose your days"
                  : "Review invitation"}
              </Commit>
            </section>
          ))}
          {!groups.length && (
            <div className="gempty">
              <h2>No shared goals yet</h2>
              <p>
                Pick a template and invite people, 2 to 8 including you.
                Everyone shares the same weekly round.
              </p>
              <div className="option-row">
                <Commit
                  onClick={() => open({ kind: "create", key: Date.now() })}
                >
                  New shared goal
                </Commit>
                <button
                  type="button"
                  className="ctl"
                  onClick={() => open({ kind: "paste" })}
                >
                  Join with a link
                </button>
              </div>
            </div>
          )}
          {!!groups.length && (
            <section className="shared-saved">
              <h2>Your shared goals and drafts</h2>
              {groups.map((g) => (
                <div className="shared-person" key={g.id}>
                  <span className="flex-1">
                    <strong>{g.name}</strong>
                    <small>
                      {g.publishedAt
                        ? `Published · first round ${dateLabel(g.firstRoundDate!)}`
                        : "Private draft · finish creation"}
                    </small>
                  </span>
                  {g.ownerId === engine.userId && (
                    <button
                      type="button"
                      className="ctl"
                      onClick={() =>
                        open(
                          g.publishedAt
                            ? { kind: "people", id: g.id }
                            : { kind: "create", id: g.id, key: Date.now() },
                        )
                      }
                    >
                      {g.publishedAt ? "Invite people" : "Resume draft"}
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}
          {data.drafts
            .filter((d) => !groups.some((g) => g.id === d.id))
            .map((d) => (
              <div className="shared-person" key={d.id}>
                <span className="flex-1">
                  {d.fields.name || "Untitled draft"}
                  <small>Saved on this device</small>
                </span>
                <button
                  type="button"
                  className="ctl"
                  onClick={() =>
                    open({ kind: "create", id: d.id, key: Date.now() })
                  }
                >
                  Resume draft
                </button>
              </div>
            ))}
        </div>
      </div>
      <footer className="foot">
        <span className="k">Tab · move between controls</span>
        <span className="flex-1" />
        <span className="k">Shift N · new shared goal</span>
      </footer>
    </div>
  );
  return (
    <div className="shared-workspace">
      {content}
      {recovery}
    </div>
  );
}
