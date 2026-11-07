import { useEffect, useState } from "react";
import {
  parseProgressSelection,
  resolveProgressSelection,
  type SharedWidgetExport,
  type ProgressSelection,
} from "@facta/calendar";
export function useProgressSelection(
  data: SharedWidgetExport,
  key: string,
  configuredId: string | null = null,
) {
  const [saved, setSaved] = useState<ProgressSelection | null>(() => {
    try {
      return parseProgressSelection(
        JSON.parse(localStorage.getItem(key) ?? "null"),
      );
    } catch {
      return null;
    }
  });
  const [error, setError] = useState("");
  const selection = resolveProgressSelection(data, saved, configuredId);
  const user = selection?.userId,
    id = selection?.groupId,
    configured = selection?.configuredId;
  useEffect(() => {
    setSaved(selection);
    try {
      if (selection) localStorage.setItem(key, JSON.stringify(selection));
      else localStorage.removeItem(key);
      setError("");
    } catch {
      setError("Could not remember the selected group on this device.");
    }
  }, [key, user, id, configured]);
  return {
    id: selection?.groupId ?? null,
    error,
    select: (groupId: string) => {
      if (selection) setSaved({ ...selection, groupId: groupId || null });
    },
  };
}
