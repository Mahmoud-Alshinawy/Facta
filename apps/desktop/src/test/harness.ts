import { PlannerSync } from "@/lib/sync/engine";
import { memoryStore } from "@/lib/sync/storage";
import { queueStorageKey } from "@/lib/sync/queue";
import type { Goal } from "@/types/planner";
import { createFakeServer } from "@/test/fakeServer";

export const USER = "11111111-1111-4111-8111-111111111111";
export const OTHER_USER = "22222222-2222-4222-8222-222222222222";

export function makeGoal(over: Partial<Goal> = {}): Goal {
  return {
    id: crypto.randomUUID(),
    title: "Write report",
    category: "must-do",
    date: "2026-10-16",
    completed: false,
    completedDates: [],
    repeat: "none",
    notificationsEnabled: false,
    notificationMessage: "",
    ...over,
  };
}

/** An engine wired to an in-memory store, a fake server and a manual clock. */
export function setup(opts: { store?: ReturnType<typeof memoryStore>; online?: boolean } = {}) {
  let t = Date.parse("2026-10-16T09:00:00.000Z");
  const clock = {
    now: () => t,
    advance: (ms: number) => { t += ms; },
  };
  const store = opts.store ?? memoryStore();
  const server = createFakeServer(clock.now);
  let current: string | null = USER;
  const serverWon: string[] = [];
  const engine = new PlannerSync({
    userId: USER,
    store,
    remotes: opts.online === false ? null : server.remotes,
    currentUserId: () => current,
    now: clock.now,
    onServerWon: (table, outcome) => { serverWon.push(`${table}:${outcome}`); },
  });
  engine.load();
  return {
    engine,
    store,
    server,
    clock,
    serverWon,
    statesSeen: () => {
      const seen: string[] = [];
      engine.subscribe(() => { seen.push(engine.getStatus().state); });
      return seen;
    },
    switchUser: (uid: string | null) => { current = uid; },
    cachedGoals: (): Goal[] => JSON.parse(store.get(`planner_goals_${USER}`) ?? "[]"),
    queueData: () => JSON.parse(store.get(queueStorageKey(USER)) ?? "{}"),
  };
}
