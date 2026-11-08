import { useSyncExternalStore } from "react";
import { Users } from "lucide-react";
import type { SharedSync } from "@/lib/sync/shared/engine";
import type { SharedTodayItem } from "@/lib/sharedGoals/asGoals";
import { sharedRequests } from "@/lib/sharedGoals/requests";
import SharedGoalRow from "./SharedGoalRow";

/** Today's shared goals, as one more group in the goal list. */
export default function TodaySharedSection({
  engine,
  items,
  localDay,
  now,
  onOpenGroup,
}: {
  engine: SharedSync;
  items: readonly SharedTodayItem[];
  localDay: string;
  now: () => number;
  onOpenGroup: (id: string) => void;
}) {
  const requests = sharedRequests(engine);
  const pending = useSyncExternalStore(
    requests.subscribe,
    requests.getSnapshot,
  );
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-2" data-progress-surface="today">
      <div className="flex items-center gap-2.5 px-1">
        <Users aria-hidden="true" size={14} className="text-text-2" />
        <h2 className="m-0 text-sm font-semibold tracking-[-0.01em]">Shared</h2>
        <span className="text-xs text-subtle">
          {items.filter((i) => i.done).length} of {items.length}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-0.5 rounded-[14px] border border-border bg-card p-1">
        {items.map((item) => (
          <SharedGoalRow
            key={item.id}
            item={item}
            engine={engine}
            localDay={localDay}
            now={now}
            locked={pending.length > 0}
            onOpenGroup={onOpenGroup}
          />
        ))}
      </ul>
    </div>
  );
}
