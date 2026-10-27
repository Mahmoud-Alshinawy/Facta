// Full production App in an isolated test origin/profile. Identity is synthetic;
// this deliberately makes no Auth/JWT/PostgREST acceptance claim.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import App from "../App";
import DeepLinkBridge from "@/components/DeepLinkBridge";
import { GoalsProvider } from "@/hooks/useGoals";
import { EventsProvider } from "@/hooks/useEvents";
import { SyncEngines } from "@/hooks/useSync";
import { IndexedDbStore } from "@/lib/sync/indexedDbStore";
import { PlannerSync } from "@/lib/sync/engine";
import { SharedSync } from "@/lib/sync/shared/engine";
import { createSupabaseRemotes } from "@/lib/sync/supabaseRemote";
import { createSharedRemote } from "@/lib/sync/shared/remote";
import { makeCommand } from "@/lib/sharedGoals/contracts";
import { appLinks, parseFactaLink } from "@/lib/sharedGoals/deepLinks";
import {
  setWidgetExportStore,
  setWidgetExportUser,
  exportWidgetsNow,
  requestWidgetExport,
} from "@/lib/widgetExportBus";
import { installNativeQuit } from "@/lib/nativeQuit";
import { bindAcceptance } from "./sharedAcceptanceBridge";
import { Toaster } from "sonner";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist/latin-700.css";
import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist-mono/latin-500.css";
import "../index.css";

const fixture = new URLSearchParams(location.search).get("fixture")!;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(fixture))
  throw Error("Loopback fixture required");
let current: string | null = null,
  store: IndexedDbStore | null = null,
  personal: PlannerSync | null = null,
  shared: SharedSync | null = null;
const client = createClient(fixture, "disposable-key", {
  accessToken: async () => (current ? `fixture.${current}` : null),
});
const remote = (id: string) =>
  createSharedRemote(id, client as never, {
    getSession: async () => ({ userId: id, accessToken: `fixture.${id}` }),
  });
let rerender = () => {};
async function actor(id: string | null) {
  personal?.dispose();
  shared?.dispose();
  await store?.close();
  personal = null;
  shared = null;
  store = null;
  current = id;
  appLinks.bindAccount(id);
  setWidgetExportStore(id, null);
  setWidgetExportUser(id);
  bindAcceptance({ personal, shared, userId: id });
  if (id) {
    store = await IndexedDbStore.create(id);
    personal = new PlannerSync({
      userId: id,
      store,
      remotes: createSupabaseRemotes(id, client as never),
      currentUserId: () => current,
      onCacheWrite: requestWidgetExport,
    });
    personal.load();
    await personal.syncNow();
    shared = new SharedSync({
      userId: id,
      store,
      remote: remote(id),
      currentUserId: () => current,
      onCacheWrite: requestWidgetExport,
    });
    shared.load();
    await shared.syncNow();
    setWidgetExportStore(id, store);
    bindAcceptance({ personal, shared, userId: id });
  }
  rerender();
  if ("__TAURI_INTERNALS__" in window) await exportWidgetsNow();
}
function Acceptance() {
  const [, tick] = useState(0);
  rerender = () => tick((n) => n + 1);
  return (
    <>
      <DeepLinkBridge />
      <Toaster />
      <SyncEngines engine={personal} shared={shared}>
        <GoalsProvider>
          <EventsProvider>
            <App />
          </EventsProvider>
        </GoalsProvider>
      </SyncEngines>
      {"__TAURI_INTERNALS__" in window && (
        <aside
          style={{
            position: "fixed",
            bottom: 4,
            right: 4,
            zIndex: 9999,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            padding: 4,
            display: "flex",
            gap: 8,
          }}
        >
          <button onClick={() => void shared?.syncNow()}>Test: Sync</button>
          <button
            onClick={() =>
              void fetch(`${fixture}/test/config`)
                .then((r) => r.json())
                .then((c) => actor(c.owner))
            }
          >
            Test: Owner
          </button>
          <button
            onClick={() =>
              void fetch(`${fixture}/test/config`)
                .then((r) => r.json())
                .then((c) => actor(c.other))
            }
          >
            Test: Other
          </button>
          <button onClick={() => void actor(null)}>Test: Sign out</button>
          <button
            onClick={() =>
              void (async () => {
                personal?.goals.upsert({
                  id: crypto.randomUUID(),
                  title: "Quit durability saved",
                  category: "must-do",
                  date: new Date().toLocaleDateString("en-CA"),
                  completed: false,
                  repeat: "none",
                  notificationsEnabled: false,
                  notificationMessage: "",
                });
                const { invoke } = await import("@tauri-apps/api/core");
                await invoke("acceptance_quit");
              })()
            }
          >
            Test: Stage and quit
          </button>
          <button
            onClick={() =>
              void import("@tauri-apps/api/core").then(({ invoke }) =>
                invoke("acceptance_quit"),
              )
            }
          >
            Test: Quit
          </button>
        </aside>
      )}
    </>
  );
}
Object.assign(window, {
  acceptance: {
    actor,
    sync: () => shared?.syncNow(),
    snapshot: () => shared?.getSnapshot(),
    personal: () => personal?.goals.getSnapshot(),
    command: (
      id: string,
      op: Parameters<typeof makeCommand>[0],
      payload: never,
    ) => remote(id).command(makeCommand(op, payload)),
    route: (raw: string) => {
      const link = parseFactaLink(raw);
      if (link && ["group", "join", "focus"].includes(link.kind))
        appLinks.receive(link as never);
    },
    export: exportWidgetsNow,
    quit: async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("acceptance_quit");
    },
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
  },
});
void (async () => {
  await installNativeQuit();
  createRoot(document.getElementById("root")!).render(<Acceptance />);
  if ("__TAURI_INTERNALS__" in window) {
    const config = await fetch(`${fixture}/test/config`).then((r) => r.json());
    await actor(config.owner);
  }
})();
