import { useRef, useState } from "react";
import type { SharedSync } from "@/lib/sync/shared/engine";
import { toggleSharedCheckin } from "@/lib/sharedGoals/checkin";

/** One check-in or undo at a time, with its error in plain words. */
export function useSharedCheckin(
  engine: SharedSync,
  groupId: string,
  now: () => number,
) {
  const busy = useRef(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await toggleSharedCheckin(engine, groupId, now());
      if (navigator.onLine) void engine.syncNow();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return { toggle, saving, error };
}
