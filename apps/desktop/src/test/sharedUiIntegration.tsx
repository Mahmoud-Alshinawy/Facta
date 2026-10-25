// Disposable browser harness only; production does not import this entry.
import { createRoot } from "react-dom/client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { IndexedDbStore } from "@/lib/sync/indexedDbStore";
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
let clock = Date.parse("2026-10-20T09:00:00Z");
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
  engine?.dispose();
  if (store) await store.close();
  store = null;
  engine = null;
  current = id;
  appLinks.bindAccount(id);
  render();
  if (!id) return;
  store = await IndexedDbStore.create(id, { name: db });
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
  const [, tick] = useState(0),
    intent = useSyncExternalStore(appLinks.subscribe, appLinks.getSnapshot);
  render = () => tick((n) => n + 1);
  useEffect(() => {
    Object.assign(window, {
      sharedUi: {
        setActor,
        theme: (theme: ThemeId) => chooseTheme(theme),
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
    <div className="fx">
      <main style={{ display: "flex", flex: 1, minWidth: 0 }}>
        {engine ? (
          <SharedGoalsPage
            key={engine.userId}
            engine={engine}
            weekStart={1}
            now={now}
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
let root = createRoot(document.getElementById("root")!);
root.render(<Harness />);
