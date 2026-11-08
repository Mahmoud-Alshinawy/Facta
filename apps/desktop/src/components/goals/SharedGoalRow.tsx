import { useId } from "react";
import GoalRowView from "../GoalRowView";
import { PendingReview } from "./SharedProgress";
import { useSharedCheckin } from "@/hooks/useSharedCheckin";
import type { SharedSync } from "@/lib/sync/shared/engine";
import { sharedSubline, type SharedTodayItem } from "@/lib/sharedGoals/asGoals";

/** A shared goal as a goal row: the checkbox checks in through the outbox. */
export default function SharedGoalRow({
  item,
  engine,
  localDay,
  now,
  locked,
  onOpenGroup,
}: {
  item: SharedTodayItem;
  engine: SharedSync;
  /** The viewer's own date, to say when the group's day differs. */
  localDay: string;
  now: () => number;
  /** A group request is in flight, so check-ins wait. */
  locked: boolean;
  onOpenGroup: (id: string) => void;
}) {
  const checkin = useSharedCheckin(engine, item.groupId, now);
  const stateId = useId();
  const todayFailed = item.view.todayIntent?.phase === "failed";
  const state = item.pending
    ? "Not synced yet"
    : todayFailed
      ? "Not saved"
      : "";
  return (
    <>
      <GoalRowView
        title={item.title}
        done={item.done}
        toggleLabel={`${item.done ? "Undo check-in" : "Check in"}: ${item.title}`}
        onToggle={() => void checkin.toggle()}
        disabled={!item.canCheck || locked || checkin.saving}
        describedBy={state ? stateId : undefined}
        onOpen={() => onOpenGroup(item.groupId)}
        openLabel={`Open group ${item.title}`}
        subline={sharedSubline(item, localDay)}
        trailing={
          <>
            {state && (
              <span id={stateId} className="text-xs text-text-2">
                {state}
              </span>
            )}
            <span className="flex h-6 items-center rounded-md bg-raised-2 px-2 text-xs text-text-2">
              Shared
            </span>
          </>
        }
      />
      {(item.failed.length > 0 || checkin.error) && (
        <li className="list-none px-3 pb-2">
          <PendingReview engine={engine} intentions={item.failed} compact />
          {checkin.error && (
            <p role="status" className="m-0 text-xs text-text-2">
              {checkin.error}
            </p>
          )}
        </li>
      )}
    </>
  );
}
