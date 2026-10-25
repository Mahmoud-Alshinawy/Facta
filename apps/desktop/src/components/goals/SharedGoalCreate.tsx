import { useEffect, useRef, useState } from "react";
import type { SharedDraftFields, SharedGroup } from "@/types/sharedGoals";
import type { SharedSync } from "@/lib/sync/shared/engine";
import type { SharedState } from "@/lib/sync/shared/state";
import {
  creationFields,
  groupFields,
  validateCreation,
  scheduleText,
  dateLabel,
  WEEKDAYS,
  outcomeText,
} from "@/lib/sharedGoals/creation";
import { nextRoundDate } from "@/lib/sharedGoals/dates";
import { sharedRequests } from "@/lib/sharedGoals/requests";
import { Commit } from "../calendar/common";
import ChoiceGroup from "../settings/ChoiceGroup";
import {
  Callout,
  DayPicker,
  IconPicker,
  SharedFoot,
  SharedHeader,
  SharedIcon,
  Stepper,
} from "./SharedParts";
import SharedPeople from "./SharedPeople";

export default function SharedGoalCreate({
  engine,
  data,
  savedId,
  locked,
  weekStart,
  now,
  onClose,
  onDone,
}: {
  engine: SharedSync;
  data: SharedState;
  savedId?: string;
  locked: boolean;
  weekStart: number;
  now: () => number;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const initialGroup = data.cache?.snapshot.groups.find(
    (g) => g.id === savedId,
  );
  const [draftId, setDraftId] = useState(savedId ?? crypto.randomUUID());
  const [groupId, setGroupId] = useState<string | null>(
    initialGroup?.id ?? null,
  );
  const [fields, setFields] = useState<SharedDraftFields>(() => {
    const defaults = creationFields(
      weekStart,
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );
    if (initialGroup)
      return groupFields(
        initialGroup,
        data.cache?.snapshot.memberships.find(
          (m) =>
            m.groupId === savedId && m.userId === engine.userId && !m.leftAt,
        )?.initialGymTarget ?? null,
      );
    return {
      ...defaults,
      ...data.drafts.find((d) => d.id === savedId)?.fields,
    };
  });
  const [step, setStep] = useState(initialGroup ? 2 : 0),
    [message, setMessage] = useState("");
  const [firstDate, setFirstDate] = useState<string | null>(null),
    [revision, setRevision] = useState<number | null>(null),
    [reconfirm, setReconfirm] = useState(false);
  const [working, setWorking] = useState(false),
    busy = useRef(false),
    nameRef = useRef<HTMLInputElement>(null);
  const requests = sharedRequests(engine),
    disabled = locked || working;
  const latest = data.cache?.snapshot.groups.find((g) => g.id === groupId);
  const reviewMembers =
    data.cache?.snapshot.memberships.filter(
      (m) => m.groupId === groupId && !m.leftAt && !m.deletedAt,
    ) ?? [];
  const reviewInvites =
    data.cache?.snapshot.invites.filter(
      (i) =>
        i.groupId === groupId &&
        i.kind === "direct" &&
        i.state === "pending" &&
        !i.deletedAt &&
        Date.parse(i.expiresAt) > now(),
    ) ?? [];
  const update = (patch: Partial<SharedDraftFields>) => {
    if (!disabled) {
      setFields((f) => ({ ...f, ...patch }));
      setMessage("");
      setReconfirm(false);
    }
  };
  useEffect(() => {
    if (step !== 1) return;
    const raf = requestAnimationFrame(() => nameRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [step]);
  useEffect(() => {
    if (!fields.name.trim() || latest?.publishedAt) return;
    const timer = setTimeout(() => {
      void engine
        .saveDraft({ id: draftId, fields, updatedAt: now() })
        .catch((e) => setMessage(e.message));
    }, 300);
    return () => clearTimeout(timer);
  }, [engine, draftId, fields, now, latest?.publishedAt]);
  const currentGroup = async (id: string): Promise<SharedGroup> => {
    await engine.syncNow();
    const group = engine
      .getSnapshot()
      .cache?.snapshot.groups.find((g) => g.id === id);
    if (!group)
      throw new Error(
        "The draft has not been refreshed. Retry when connected.",
      );
    return group;
  };
  const ensureDraft = async () => {
    const error = validateCreation(fields);
    if (error) throw new Error(error);
    await engine.saveDraft({ id: draftId, fields, updatedAt: now() });
    let id = groupId;
    if (!id) {
      const out = await requests.perform(
        `draft:${draftId}`,
        "create_draft",
        fields,
      );
      if (!out.ok || !out.groupId) throw new Error(outcomeText(out.code));
      id = out.groupId;
      setGroupId(id);
      setDraftId(id);
    }
    let g = await currentGroup(id);
    if (g.publishedAt) {
      onDone(id);
      return g;
    }
    const target =
      engine
        .getSnapshot()
        .cache?.snapshot.memberships.find(
          (m) => m.groupId === id && m.userId === engine.userId && !m.leftAt,
        )?.initialGymTarget ?? null;
    if (JSON.stringify(groupFields(g, target)) !== JSON.stringify(fields)) {
      const out = await requests.perform(`update:${id}`, "update_draft", {
        ...fields,
        group_id: id,
        expected_revision: g.revision,
      });
      if (!out.ok) throw new Error(outcomeText(out.code));
      g = await currentGroup(id);
    }
    return g;
  };
  const next = async () => {
    if (disabled || busy.current) return;
    setMessage("");
    busy.current = true;
    setWorking(true);
    try {
      if (step === 0) setStep(1);
      else if (step === 1) {
        await ensureDraft();
        setStep(2);
      } else if (step === 2) {
        if (!groupId) throw new Error("Save the details first.");
        const g = await currentGroup(groupId);
        setRevision(g.revision);
        setFirstDate(
          nextRoundDate(now(), fields.time_zone, fields.round_weekday),
        );
        setReconfirm(false);
        setStep(3);
      } else {
        if (!groupId || !firstDate || revision === null)
          throw new Error("Review this draft first.");
        const out = await requests.perform(`publish:${groupId}`, "publish", {
          group_id: groupId,
          expected_revision: revision,
          first_round_date: firstDate,
        });
        if (out.code === "confirmation_required") {
          setFirstDate(out.firstRoundDate!);
          setRevision(out.revision!);
          setReconfirm(true);
          setMessage(
            `The first round or draft changed. Review ${dateLabel(out.firstRoundDate!)} before explicitly confirming.`,
          );
          const g = await currentGroup(groupId);
          const m = engine
            .getSnapshot()
            .cache?.snapshot.memberships.find(
              (m) =>
                m.groupId === groupId &&
                m.userId === engine.userId &&
                !m.leftAt,
            );
          setFields(groupFields(g, m?.initialGymTarget ?? null));
        } else if (out.ok || out.code === "already_published") {
          await engine.removeDraft(draftId);
          await engine.syncNow();
          onDone(groupId);
        } else throw new Error(outcomeText(out.code));
      }
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "The action could not complete.",
      );
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };
  const close = async () => {
    if (busy.current) return;
    try {
      if (fields.name.trim())
        await engine.saveDraft({ id: draftId, fields, updatedAt: now() });
      onClose();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <div
      className="gmain shared-page"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          void close();
        }
        if (
          e.key === "Enter" &&
          !(e.target as HTMLElement).closest("form,button")
        ) {
          e.preventDefault();
          void next();
        }
      }}
    >
      <SharedHeader
        title="New shared goal"
        kicker={`STEP ${step + 1} OF 4`}
        step={step}
        busy={working}
        onClose={() => void close()}
      />
      <div className="gscroll">
        <form
          className="shared-wizard"
          onSubmit={(e) => {
            e.preventDefault();
            void next();
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              (e.target as HTMLElement).closest(
                '[role="radio"], [role="checkbox"]',
              )
            ) {
              e.preventDefault();
              void next();
            }
          }}
        >
          <section
            className="shared-card"
            aria-label={
              ["Choose a template", "Details", "People", "Review"][step]
            }
          >
            <fieldset disabled={disabled} className="shared-fields">
              {step === 0 && (
                <>
                  <h2>Choose a template</h2>
                  <ChoiceGroup
                    label="Template"
                    value={fields.template}
                    options={[
                      {
                        value: "gym",
                        label: (
                          <>
                            <SharedIcon icon="dumbbell" />
                            <strong>Gym</strong>
                            <span>
                              Everyone chooses their own days per week when
                              joining, at least 2. Ranked by adherence.
                            </span>
                          </>
                        ),
                      },
                      {
                        value: "custom",
                        label: (
                          <>
                            <SharedIcon icon="goals" />
                            <strong>Custom</strong>
                            <span>
                              Every day, specific days or a number of days a
                              week. Same rule for everyone.
                            </span>
                          </>
                        ),
                      },
                    ]}
                    onChange={(template) =>
                      update(
                        template === "gym"
                          ? {
                              template,
                              icon: "dumbbell",
                              schedule_kind: "n",
                              weekdays: [],
                              times_per_week: null,
                              target: 3,
                            }
                          : {
                              template,
                              icon: "book",
                              schedule_kind: "every",
                              weekdays: [],
                              times_per_week: null,
                              target: null,
                            },
                      )
                    }
                  />
                </>
              )}
              {step === 1 && (
                <>
                  <h2>
                    {fields.template === "gym" ? "Gym crew" : "Custom goal"}{" "}
                    details
                  </h2>
                  <div className="field">
                    <label htmlFor="shared-name">Name</label>
                    <input
                      ref={nameRef}
                      id="shared-name"
                      className="inp"
                      maxLength={120}
                      value={fields.name}
                      autoComplete="off"
                      onChange={(e) => update({ name: e.target.value })}
                    />
                  </div>
                  <IconPicker
                    value={fields.icon ?? "goals"}
                    onChange={(icon) => update({ icon })}
                  />
                  {fields.template === "gym" ? (
                    <>
                      <Callout>
                        Each person chooses 2–7 days per week. Targets are
                        visible to everyone. Changes take effect next round.
                      </Callout>
                      <Stepper
                        value={fields.target ?? 3}
                        min={2}
                        onChange={(target) => update({ target })}
                      />
                    </>
                  ) : (
                    <>
                      <ChoiceGroup
                        label="How often"
                        value={fields.schedule_kind}
                        options={[
                          { value: "every", label: "Every day" },
                          { value: "days", label: "Specific days" },
                          { value: "n", label: "N per week" },
                        ]}
                        onChange={(schedule_kind) =>
                          update({
                            schedule_kind,
                            weekdays: [],
                            times_per_week: schedule_kind === "n" ? 3 : null,
                          })
                        }
                      />
                      {fields.schedule_kind === "days" && (
                        <DayPicker
                          label="Which days"
                          days={fields.weekdays ?? []}
                          onChange={(day) =>
                            update({
                              weekdays: fields.weekdays?.includes(day)
                                ? fields.weekdays.filter((d) => d !== day)
                                : [...(fields.weekdays ?? []), day].sort(),
                            })
                          }
                        />
                      )}
                      {fields.schedule_kind === "n" && (
                        <Stepper
                          label="Days per week"
                          value={fields.times_per_week ?? 3}
                          min={1}
                          onChange={(times_per_week) =>
                            update({ times_per_week })
                          }
                        />
                      )}
                    </>
                  )}
                  <DayPicker
                    label="Rounds start on"
                    days={[fields.round_weekday]}
                    radio
                    onChange={(round_weekday) => update({ round_weekday })}
                  />
                  <span className="shared-note">
                    Defaults to your week-start preference. Each goal keeps its
                    own.
                  </span>
                  <div className="field">
                    <label htmlFor="shared-zone">Group time zone</label>
                    <input
                      id="shared-zone"
                      className="inp"
                      value={fields.time_zone}
                      onChange={(e) => update({ time_zone: e.target.value })}
                    />
                    <span className="shared-note">
                      IANA zone, shared by every member. Frozen at publication.
                    </span>
                  </div>
                </>
              )}
              {step === 2 && groupId && (
                <SharedPeople
                  engine={engine}
                  data={data}
                  groupId={groupId}
                  locked={disabled}
                  now={now()}
                  report={setMessage}
                />
              )}
              {step === 3 && (
                <>
                  <h2>Review your goal</h2>
                  <div className="shared-person shared-summary">
                    <SharedIcon icon={fields.icon ?? "goals"} />
                    <div>
                      <strong>{fields.name}</strong>
                      <p className="shared-note">{scheduleText(fields)}</p>
                    </div>
                  </div>
                  <div className="shared-facts">
                    <div>
                      <span className="mono sec">PROPOSED FIRST ROUND</span>
                      <strong>{firstDate && dateLabel(firstDate)}</strong>
                    </div>
                    <div>
                      <span className="mono sec">ROUNDS START</span>
                      <strong>Every {WEEKDAYS[fields.round_weekday]}</strong>
                    </div>
                    <div>
                      <span className="mono sec">PEOPLE</span>
                      <strong>
                        {reviewMembers.length} joined · {reviewInvites.length}{" "}
                        invited
                      </strong>
                    </div>
                    <div>
                      <span className="mono sec">VISIBLE TO</span>
                      <strong>Everyone in it</strong>
                    </div>
                  </div>
                  <p className="shared-note">
                    Group time zone: {fields.time_zone}
                  </p>
                  <div aria-label="People in this goal">
                    {reviewMembers.map((m) => (
                      <div className="shared-person" key={m.id}>
                        <span className="flex-1">
                          {data.cache?.snapshot.profiles.find(
                            (p) => p.userId === m.userId,
                          )?.displayName ?? "Member"}
                          <small>
                            {m.userId === engine.userId
                              ? "You · owner"
                              : "Joined"}
                          </small>
                        </span>
                        <span className="shared-note">
                          {fields.template === "gym"
                            ? `${m.initialGymTarget} days per week`
                            : "Same rule for all"}
                        </span>
                      </div>
                    ))}
                    {reviewInvites.map((i) => (
                      <div className="shared-person" key={i.id}>
                        <span className="flex-1">
                          {data.cache?.snapshot.profiles.find(
                            (p) => p.userId === i.recipientId,
                          )?.displayName ?? "Invited person"}
                          <small>Invite sent</small>
                        </span>
                        <span className="shared-note">
                          {fields.template === "gym"
                            ? "Picks own days on joining"
                            : "Same rule for all"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Callout>
                    The first date is revalidated when you publish. If it
                    changes, you must review and confirm again. A round scores
                    only when at least two members are eligible at its boundary.
                  </Callout>
                  {fields.template === "gym" && (
                    <p>
                      Your target: {fields.target} days per week. Other members
                      choose their own target when joining.
                    </p>
                  )}
                  {latest?.publishedAt && (
                    <p>This goal is already published.</p>
                  )}
                </>
              )}
            </fieldset>
            {message && (
              <p role="status" aria-live="polite" className="shared-message">
                {message}
              </p>
            )}
          </section>
          <div className="shared-actions">
            <button
              className="ctl"
              type="button"
              disabled={working || !!latest?.publishedAt}
              onClick={() => (step === 0 ? void close() : setStep(step - 1))}
            >
              {step === 0 ? "Cancel" : "Back"}
            </button>
            <span className="flex-1" />
            <Commit
              type="submit"
              keyHint={step === 3 ? undefined : "Enter"}
              disabled={disabled}
            >
              {working
                ? "Saving…"
                : step === 3
                  ? reconfirm
                    ? "Confirm updated date and create goal"
                    : "Create goal"
                  : "Next"}
            </Commit>
          </div>
        </form>
      </div>
      <SharedFoot />
    </div>
  );
}
