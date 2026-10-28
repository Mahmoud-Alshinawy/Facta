import { useSyncExternalStore } from "react";
import { Dumbbell, Plus } from "lucide-react";
import {
  currentSharedProgress,
  emptySharedWidgetExport,
} from "@facta/calendar";
import { useSharedGoals } from "@/hooks/useSharedGoals";
import { useAuth } from "@/hooks/useAuth";
import { usePrefs } from "@/hooks/usePrefs";
import type { SharedSync } from "@/lib/sync/shared/engine";
import type { SharedState } from "@/lib/sync/shared/state";
import {
  sharedProgressChoices,
  projectSharedView,
} from "@/lib/sharedGoals/projection";
import { sharedGroupView } from "@/lib/sharedGoals/view";
import { sharedRequests } from "@/lib/sharedGoals/requests";
import { useProgressSelection } from "../../../../widgets/src/lib/progressSelection";
import {
  ProgressGroupPicker,
  ProgressScores,
  ProgressState,
} from "../../../../widgets/src/components/ProgressShared";
import { CheckinAction } from "./SharedProgress";
type Props = {
  onOpenGroup: (id: string) => void;
  onCreate: (template: "gym" | "custom") => void;
  now: number;
};
export default function TodaySharedPanel(props: Props) {
  const { engine, data, status } = useSharedGoals();
  const { user } = useAuth();
  // Reads can arrive between the parent's minute ticks. Evaluate freshness
  // at this render, independently of the separate click-time capture.
  return (
    <TodaySharedContent
      {...props}
      now={Date.now()}
      userId={user?.id ?? null}
      engine={engine}
      data={data}
      error={status.lastError}
    />
  );
}
/** Mounted separately in acceptance tests with the real SDK/IndexedDB engine. */
export function TodaySharedContent({
  engine,
  data,
  error,
  onOpenGroup,
  onCreate,
  now,
  userId = engine?.userId ?? null,
}: Props & {
  engine: SharedSync | null;
  data: SharedState | null;
  error?: string | null;
  userId?: string | null;
}) {
  const { timeFormat } = usePrefs();
  const choices =
    data && userId ? sharedProgressChoices(data, userId, now) : [];
  const bundle = {
    ...emptySharedWidgetExport(userId),
    groups: choices.map((v) => ({
      ...projectSharedView(v, userId!),
      stale: v.stale || !navigator.onLine,
    })),
    defaultGroupId: choices[0]?.group.id ?? null,
  };
  const selection = useProgressSelection(bundle, "facta.progress.today");
  const raw = bundle.groups.find((g) => g.groupId === selection.id);
  const group = raw ? currentSharedProgress(raw, now) : null;
  const view =
    engine && data && group
      ? sharedGroupView(data, engine.userId, group.groupId, now)
      : null;
  return (
    <section
      className="today-shared-card"
      aria-label="Shared goals"
      data-progress-surface="today"
    >
      <span className="text-xs text-subtle">Shared goal · weekly round</span>
      {group ? (
        <>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "space-between",
            }}
          >
            <h2>{group.name}</h2>
            <span className="mono text-xs text-subtle">
              {bundle.groups.findIndex((g) => g.groupId === group.groupId) + 1}{" "}
              of {bundle.groups.length}
            </span>
          </div>
          <ProgressGroupPicker
            data={bundle}
            id={selection.id}
            onChange={selection.select}
            label="Today shared group"
          />
          <ProgressScores group={group} counts />
          <ProgressState group={group} now={now} timeFormat={timeFormat} />
          <div className="today-shared-actions">
            <button
              className="progress-open"
              onClick={() => onOpenGroup(group.groupId)}
            >
              Open group
            </button>
            {engine && view && <TodayCheck engine={engine} view={view} />}
          </div>
        </>
      ) : (
        <>
          <h2>{selection.id ? "Group unavailable" : "Do it with friends"}</h2>
          <p>
            {selection.id
              ? "Choose an available group or start a new one."
              : "Start a shared goal and see who keeps it up each week."}
          </p>
          {!!bundle.groups.length && (
            <ProgressGroupPicker
              data={bundle}
              id={selection.id}
              onChange={selection.select}
              label="Today shared group"
            />
          )}
          <div className="shared-launchers">
            <button
              onClick={() => onCreate("gym")}
              aria-label="Start shared Gym"
            >
              <Dumbbell size={17} />
              <strong>Gym</strong>
              <small>Template</small>
            </button>
            <button
              onClick={() => onCreate("custom")}
              aria-label="Start shared Custom"
            >
              <Plus size={17} />
              <strong>Custom</strong>
              <small>Set your own goal</small>
            </button>
          </div>
        </>
      )}
      {(error || selection.error) && (
        <p role="status">{selection.error || error}</p>
      )}
    </section>
  );
}
function TodayCheck({
  engine,
  view,
}: {
  engine: SharedSync;
  view: NonNullable<ReturnType<typeof sharedGroupView>>;
}) {
  const requests = sharedRequests(engine);
  const pending = useSyncExternalStore(
    requests.subscribe,
    requests.getSnapshot,
  );
  return (
    <CheckinAction
      engine={engine}
      view={view}
      locked={pending.length > 0}
      now={Date.now}
    />
  );
}
