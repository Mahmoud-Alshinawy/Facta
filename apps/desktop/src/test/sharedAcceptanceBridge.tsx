// Test-build aliases only. Production never imports this synthetic identity
// bridge. Engines, IndexedDB, SDK transport and mounted app remain real.
import { useSyncExternalStore } from "react";
import type { PlannerSync } from "@/lib/sync/engine";
import type { SharedSync } from "@/lib/sync/shared/engine";

let binding: {
  personal: PlannerSync | null;
  shared: SharedSync | null;
  userId: string | null;
} = { personal: null, shared: null, userId: null };
const listeners = new Set<() => void>();
export function bindAcceptance(next: typeof binding) {
  binding = next;
  listeners.forEach((fn) => fn());
}
function useBinding() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => binding,
  );
}
export function useAuth() {
  const { userId } = useBinding();
  return {
    user: userId ? { id: userId, email: "disposable@example.test" } : null,
    loading: false,
    signOut: async () =>
      bindAcceptance({ personal: null, shared: null, userId: null }),
  };
}
export function getStorageKey(base: string, userId: string | null | undefined) {
  return `${base}_${userId ?? "anon"}`;
}
