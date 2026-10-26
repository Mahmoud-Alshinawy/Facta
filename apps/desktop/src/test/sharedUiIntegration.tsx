// Disposable browser harness only; production does not import this entry.
import { createRoot } from "react-dom/client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { IndexedDbStore } from "@/lib/sync/indexedDbStore";
import { PlannerSync } from "@/lib/sync/engine";
import { createSupabaseRemotes } from "@/lib/sync/supabaseRemote";
import { storedSharedWidgetExport } from "@/lib/sharedGoals/widgetExport";
import {
  emptySharedWidgetExport,
  parseSharedWidgetExport,
} from "@facta/calendar";
import { goalStats } from "@/lib/goalStats";
import { TodaySharedContent } from "@/components/goals/TodaySharedPanel";
import ProgressCard from "../../../widgets/src/components/ProgressCard";
import { SharedSync } from "@/lib/sync/shared/engine";
import { sharedStorageKey } from "@/lib/sync/shared/state";
import { createSharedRemote } from "@/lib/sync/shared/remote";
import { makeCommand } from "@/lib/sharedGoals/contracts";
import { appLinks, parseFactaLink } from "@/lib/sharedGoals/deepLinks";
import { sharedRequests } from "@/lib/sharedGoals/requests";
import { chooseTheme, type ThemeId } from "@/lib/theme";
import SharedGoalsPage, {
  SignedOutInvitation,
} from "@/components/goals/SharedGoalsPage";
import Sidebar, {
  nextSidebarMode,
  sidebarRootClass,
  type SidebarMode,
} from "@/components/shell/Sidebar";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist-mono/latin-400.css";
import "../index.css";
const fixture = new URLSearchParams(location.search).get("fixture")!;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(fixture))
  throw new Error("Disposable fixture required");
let current: string | null = null,
  engine: SharedSync | null = null,
  store: IndexedDbStore | null = null;
let personal: PlannerSync | null = null;
let clock = Date.parse("2026-10-20T09:00:00Z");
let blockedKeys = false;
const now = () => clock;
const db =
  new URLSearchParams(location.search).get("database") ??
  `facta-shared-ui-${crypto.randomUUID()}`;
if (!/^facta-shared-ui-[a-f0-9-]{36}$/.test(db))
  throw new Error("Isolated test database required");
const client = createClient<Database>(fixture, "disposable-key", {
  accessToken: async () => (current ? `fixture.${current}` : null),
});
const remote = (id: string) =>
  createSharedRemote(id, client, {
    getSession: async () => ({ userId: id, accessToken: `fixture.${id}` }),
  });
let render: () => void = () => {};
async function setActor(id: string | null) {
  personal?.dispose();
  personal = null;
  engine?.dispose();
  if (store) await store.close();
  store = null;
  engine = null;
  current = id;
  appLinks.bindAccount(id);
  render();
  if (!id) return;
  store = await IndexedDbStore.create(id, { name: db });
  if (new URLSearchParams(location.search).has("step5")) {
    personal = new PlannerSync({
      userId: id,
      store,
      remotes: createSupabaseRemotes(id, client),
      currentUserId: () => current,
      now,
    });
    personal.load();
    await personal.syncNow();
  }
  engine = new SharedSync({
    userId: id,
    store,
    remote: remote(id),
    currentUserId: () => current,
    now,
    debounceMs: 60_000,
  });
  engine.load();
  await engine.syncNow();
  render();
}
function Harness() {
  const [sidebar, setSidebar] = useState<SidebarMode>("");
  const [, tick] = useState(0),
    intent = useSyncExternalStore(appLinks.subscribe, appLinks.getSnapshot);
  render = () => tick((n) => n + 1);
  useEffect(() => {
    Object.assign(window, {
      sharedUi: {
        setActor,
        theme: (theme: ThemeId) => {
          chooseTheme(theme);
          render();
        },
        now: (value: string) => {
          clock = Date.parse(value);
          render();
        },
        route: (raw: string) => {
          const link = parseFactaLink(raw);
          if (link && ["join", "group", "focus"].includes(link.kind))
            appLinks.receive(link as Parameters<typeof appLinks.receive>[0]);
        },
        commandAs: (
          id: string,
          op: Parameters<typeof makeCommand>[0],
          payload: never,
        ) => remote(id).command(makeCommand(op, payload)),
        snapshot: () => engine?.getSnapshot(),
        sync: () => engine?.syncNow(),
        widgetExport: async () => {
          const source = store,
            user = current;
          await source?.flush();
          return user === current && source === store
            ? storedSharedWidgetExport(source, user, clock).data
            : emptySharedWidgetExport(current);
        },
        personal: () => ({
          goals: personal?.goals.getSnapshot(),
          stats: goalStats(
            personal?.goals.getSnapshot() ?? [],
            new Date(clock),
            { weekStart: 1 },
          ),
        }),
        seedPersonal: async (date: string) => {
          personal?.goals.upsert({
            id: crypto.randomUUID(),
            title: "Independent personal goal",
            category: "must-do",
            date,
            completed: false,
            repeat: "none",
            notificationsEnabled: false,
            notificationMessage: "",
          });
          await personal?.syncNow();
        },
        togglePersonal: async () => {
          const g = personal?.goals.getSnapshot()[0];
          if (g) personal?.goals.upsert({ ...g, completed: !g.completed });
          await personal?.syncNow();
        },
        keyboardBlocked: (value: boolean) => {
          blockedKeys = value;
          render();
        },
        legacyDraft: async (id: string) => {
          if (!store || !current) throw new Error("Isolated store required");
          const key = sharedStorageKey(current);
          const record = JSON.parse(store.get(key)!);
          delete record.drafts.find((d: { id: string }) => d.id === id).server;
          store.set(key, JSON.stringify(record));
          await store.flush();
        },
        pending: () =>
          engine
            ? sharedRequests(engine)
                .getSnapshot()
                .map((p) => ({
                  id: p.command.command_id,
                  op: p.command.operation,
                  busy: p.busy,
                }))
            : [],
        remount: () => {
          root.unmount();
          root = createRoot(document.getElementById("root")!);
          root.render(<Harness />);
        },
      },
    });
  }, []);
  return (
    <div className={`fx ${sidebarRootClass(sidebar)}`}>
      {new URLSearchParams(location.search).has("shell") && (
        <Sidebar
          section="goals"
          onSection={() => {}}
          onSearch={() => {}}
          onToggle={() => setSidebar((v) => nextSidebarMode(v, innerWidth))}
        />
      )}
      <main style={{ display: "flex", flex: 1, minWidth: 0 }}>
        {engine && new URLSearchParams(location.search).has("step5") ? (
          <Step5Surface engine={engine} />
        ) : engine ? (
          <SharedGoalsPage
            key={engine.userId}
            engine={engine}
            weekStart={1}
            now={now}
            keyboardBlocked={blockedKeys}
            request={appLinks.ready(current, true)}
            onRequestHandled={() => appLinks.clear(intent?.sequence)}
            onMine={() => {
              void setActor(current);
            }}
          />
        ) : (
          <>
            {intent?.route.kind === "join" && (
              <SignedOutInvitation onDismiss={() => appLinks.clear()} />
            )}
            <h1>Test sign-in gate</h1>
          </>
        )}
      </main>
    </div>
  );
}
function Step5Surface({ engine }: { engine: SharedSync }) {
  const data = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const goals = useSyncExternalStore(
    personal?.subscribe ?? (() => () => {}),
    personal?.goals.getSnapshot ?? (() => []),
  );
  const [mode, setMode] = useState("today"),
    [launch, setLaunch] = useState<{
      key: number;
      template: "gym" | "custom";
    } | null>(null);
  const intent = useSyncExternalStore(appLinks.subscribe, appLinks.getSnapshot);
  const bundle = parseSharedWidgetExport(
    storedSharedWidgetExport(store, current, clock, [], !navigator.onLine).data,
    current,
  );
  const open = (id: string) => {
    appLinks.receive({ kind: "group", id });
    setMode("shared");
  };
  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <button className="ctl" onClick={() => setMode("today")}>
        Test Today surface
      </button>
      {mode === "shared" ? (
        <SharedGoalsPage
          engine={engine}
          weekStart={1}
          now={now}
          launch={launch}
          onLaunchHandled={() => setLaunch(null)}
          request={appLinks.ready(current, true)}
          onRequestHandled={() => appLinks.clear(intent?.sequence)}
          onMine={() => setMode("today")}
        />
      ) : (
        <div
          style={{
            display: "flex",
            gap: 24,
            padding: 24,
            alignItems: "flex-start",
          }}
        >
          <div style={{ width: 420 }}>
            <TodaySharedContent
              engine={engine}
              data={data}
              now={clock}
              onOpenGroup={open}
              onCreate={(template) => {
                setLaunch({ key: Date.now(), template });
                setMode("shared");
              }}
            />
          </div>
          <div style={{ width: 300, height: 480 }}>
            <ProgressCard
              data={bundle}
              goals={goals}
              now={clock}
              widgetId="test-progress"
              theme={document.documentElement.dataset.theme ?? "default"}
              translucent={false}
              onOpen={open}
            />
          </div>
        </div>
      )}
    </div>
  );
}
let root = createRoot(document.getElementById("root")!);
root.render(<Harness />);
