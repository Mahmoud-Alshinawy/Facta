// Test entry only; never imported by the app. Native IndexedDB, actual SDK
// requests and real SQL functions. The local HTTP bridge does NOT verify JWTs.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { IndexedDbStore, plannerKeys } from "@/lib/sync/indexedDbStore";
import { SharedSync } from "@/lib/sync/shared/engine";
import { createSharedRemote } from "@/lib/sync/shared/remote";
import { decodeSharedState, sharedStorageKey } from "@/lib/sync/shared/state";
import { makeCommand } from "@/lib/sharedGoals/contracts";
import { defaultHistoryRange } from "@/lib/sharedGoals/dates";
import { projectSharedProgress } from "@/lib/sharedGoals/projection";
import { PlannerSync } from "@/lib/sync/engine";
import { createSupabaseRemotes } from "@/lib/sync/supabaseRemote";

interface Config {
  owner: string;
  other: string;
  third: string;
  groupId: string;
  otherGroupId: string;
  now: string;
}
interface Checkpoint {
  db: string;
  now: number;
  id: string;
  body: string;
}
interface RunOptions {
  fixtureUrl: string;
  phase: number;
  checkpoint?: Checkpoint;
}
interface Metric {
  commands: {
    actor: string;
    commandId: string;
    operation: string;
    body: string | null;
    code: string;
  }[];
  snapshots: string[];
  personal_writes: number;
  held: boolean;
}

async function runSharedIntegration({
  fixtureUrl,
  phase,
  checkpoint,
}: RunOptions) {
  const config: Config = await fetch(`${fixtureUrl}/test/config`).then((r) =>
    r.json(),
  );
  const checks: string[] = [];
  let assertions = 0;
  const check = (ok: unknown, message: string) => {
    Object.assign(window, { sharedIntegrationCheckpoint: message });
    assertions++;
    if (!ok) throw new Error(message);
  };
  const step = (name: string) => checks.push(name);
  const control = (action: string, extra: object = {}) =>
    fetch(`${fixtureUrl}/test/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    }).then(async (r) => {
      if (!r.ok) throw new Error("Fixture control failed");
      return r.json();
    });
  const metrics = (): Promise<Metric> =>
    fetch(`${fixtureUrl}/test/metrics`).then((r) => r.json());
  const held = async () => {
    const end = Date.now() + 10_000;
    while (Date.now() < end) {
      if ((await metrics()).held) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("Fixture request did not reach the hold point");
  };
  const rejected = async (work: () => unknown) => {
    try {
      await work();
      return false;
    } catch {
      return true;
    }
  };
  const db = checkpoint?.db ?? `facta-shared-browser-${crypto.randomUUID()}`;
  let now = checkpoint?.now ?? Date.parse(config.now);
  let current: string | null = config.owner;
  let sdkUser = config.owner;
  const client = createClient<Database>(fixtureUrl, "disposable-key", {
    accessToken: async () => `fixture.${sdkUser}`,
  });
  const remote = (userId: string) =>
    createSharedRemote(userId, client, {
      getSession: async () =>
        current ? { userId: current, accessToken: `fixture.${current}` } : null,
      timeoutMs: 10_000,
    });
  const actorRemote = (userId: string) =>
    createSharedRemote(userId, client, {
      getSession: async () => ({ userId, accessToken: `fixture.${userId}` }),
      timeoutMs: 10_000,
    });
  const engine = (store: IndexedDbStore, userId = config.owner) => {
    const shared = new SharedSync({
      userId,
      store,
      remote: remote(userId),
      currentUserId: () => current,
      now: () => now,
      debounceMs: 60_000,
    });
    shared.load();
    return shared;
  };
  const raw = async (name: string, key: string): Promise<string | null> =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const connection = request.result;
        const tx = connection.transaction("kv", "readonly");
        const value = tx.objectStore("kv").get(key);
        tx.oncomplete = () => {
          connection.close();
          resolve(value.result ?? null);
        };
        tx.onabort = () => {
          connection.close();
          reject(tx.error);
        };
      };
    });
  const quotaOnce = () => {
    const original = IDBObjectStore.prototype.put;
    let armed = true;
    IDBObjectStore.prototype.put = function (...args) {
      if (armed && args[1] === sharedStorageKey(config.owner)) {
        armed = false;
        throw new DOMException("Injected quota failure", "QuotaExceededError");
      }
      return original.apply(this, args);
    };
    return () => {
      IDBObjectStore.prototype.put = original;
    };
  };

  if (phase === 1) {
    // Exercise the real join response codec, including negative receipt replay
    // after publication and successful replay after token revocation.
    const ownerRemote = actorRemote(config.owner);
    const joiningRemote = actorRemote(config.third);
    const draft = await ownerRemote.command(
      makeCommand("create_draft", {
        name: "Join contract regression",
        template: "gym",
        schedule_kind: "n",
        time_zone: "Asia/Riyadh",
        round_weekday: 1,
        target: 2,
      }),
    );
    check(draft.ok && draft.groupId, "Join regression draft must exist");
    const invitation = await ownerRemote.command(
      makeCommand("issue_link", { group_id: draft.groupId! }),
    );
    check(
      invitation.ok && invitation.token && invitation.inviteId,
      "Draft invitation must issue through the adapter",
    );
    const beforePublication = makeCommand("join", {
      token: invitation.token!,
      target: 2,
    });
    const unpublished = await joiningRemote.command(beforePublication);
    check(
      !unpublished.ok &&
        unpublished.code === "not_published" &&
        unpublished.eligibleRound === undefined,
      "Unpublished join must return its actual not_published outcome",
    );
    check(
      JSON.stringify(await joiningRemote.command(beforePublication)) ===
        JSON.stringify(unpublished),
      "Unpublished same-UUID receipt replay must decode identically",
    );
    const draftSnapshot = await ownerRemote.snapshot(defaultHistoryRange(now));
    const revision = draftSnapshot.groups.find(
      (g) => g.id === draft.groupId,
    )!.revision;
    const published = await ownerRemote.command(
      makeCommand("publish", {
        group_id: draft.groupId!,
        expected_revision: revision,
        first_round_date: "2026-10-26",
      }),
    );
    check(published.ok, "Join regression must publish through the adapter");
    check(
      JSON.stringify(await joiningRemote.command(beforePublication)) ===
        JSON.stringify(unpublished),
      "Publishing must not change an already committed negative join receipt",
    );
    const joinPacket = makeCommand("join", {
      token: invitation.token!,
      target: 2,
    });
    const joined = await joiningRemote.command(joinPacket);
    check(
      joined.ok &&
        joined.code === "joined" &&
        joined.groupId === draft.groupId &&
        joined.membershipId &&
        joined.eligibleRound === "2026-10-26",
      "Published join must decode the server eligibility date",
    );
    check(
      JSON.stringify(await joiningRemote.command(joinPacket)) ===
        JSON.stringify(joined),
      "Published same-UUID receipt replay must retain eligibility and membership",
    );
    check(
      (
        await ownerRemote.command(
          makeCommand("revoke_invite", { invite_id: invitation.inviteId! }),
        )
      ).ok,
      "Join regression token must revoke",
    );
    check(
      JSON.stringify(await joiningRemote.command(joinPacket)) ===
        JSON.stringify(joined),
      "Committed join receipt must remain decodable after token revocation",
    );
    check(
      (
        await ownerRemote.command(
          makeCommand("archive", { group_id: draft.groupId! }),
        )
      ).ok,
      "Join regression group must archive",
    );
    check(
      (
        await ownerRemote.command(
          makeCommand("leave", { group_id: draft.groupId! }),
        )
      ).ok,
      "Join regression owner must leave its archived group",
    );
    check(
      (
        await joiningRemote.command(
          makeCommand("leave", { group_id: draft.groupId! }),
        )
      ).ok,
      "Join regression member must leave its archived group",
    );
    step(
      "real adapter published/unpublished join responses and exact-UUID receipt replay before/after lifecycle changes",
    );

    // Upgrade the existing real object store; all old per-account keys survive.
    const migrationDb = `${db}-migration`;
    const legacy = Object.fromEntries(
      plannerKeys(config.owner)
        .slice(0, 6)
        .map((key, i) => [key, JSON.stringify({ preserved: i })]),
    );
    for (const [key, value] of Object.entries(legacy))
      localStorage.setItem(key, value);
    const oldOpen = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function () {
      throw new DOMException("Injected open denial", "SecurityError");
    };
    try {
      check(
        await rejected(() =>
          IndexedDbStore.create(config.owner, { name: migrationDb }),
        ),
        "Open denial must fail visibly",
      );
    } finally {
      IDBFactory.prototype.open = oldOpen;
    }
    check(
      Object.entries(legacy).every(
        ([key, value]) => localStorage.getItem(key) === value,
      ),
      "Failed open must preserve legacy data",
    );
    const migrated = await IndexedDbStore.create(config.owner, {
      name: migrationDb,
    });
    check(
      Object.entries(legacy).every(
        ([key, value]) => migrated.get(key) === value,
      ),
      "Upgrade must preserve all four caches, queue and widget receipts",
    );
    await migrated.close();
    const reopened = await IndexedDbStore.create(config.owner, {
      name: migrationDb,
    });
    check(
      Object.entries(legacy).every(
        ([key, value]) => reopened.get(key) === value,
      ),
      "Imported data must survive reopen",
    );
    await reopened.close();
    step(
      "native IndexedDB upgrade/open-failure recovery preserves six personal keys",
    );

    let store = await IndexedDbStore.create(config.owner, { name: db });
    let shared = engine(store);
    await shared.syncNow();
    check(
      shared.getStatus().state === "idle",
      "Initial real SQL snapshot must load",
    );
    check(
      shared
        .getSnapshot()
        .cache?.snapshot.groups.some((g) => g.id === config.groupId),
      "Own group must be mapped",
    );
    const roundConfirmedAt = now;
    check(
      projectSharedProgress(
        shared.getSnapshot(),
        config.owner,
        now,
        config.groupId,
      )?.confirmedAt === roundConfirmedAt,
      "Displayed round must use its initial coverage confirmation",
    );
    now += 180_000;
    await control("clock", { now: new Date(now).toISOString() });
    await shared.syncNow({ from: "2026-10-26", until: "2026-11-01" });
    const retainedProgress = projectSharedProgress(
      shared.getSnapshot(),
      config.owner,
      now,
      config.groupId,
    );
    check(
      retainedProgress?.confirmedAt === roundConfirmedAt &&
        retainedProgress.stale &&
        retainedProgress.round?.start === "2026-10-19",
      "Real unrelated history read must not refresh retained scores",
    );
    await shared.syncNow({ from: "2026-10-19", until: "2026-10-19" });
    const refreshedProgress = projectSharedProgress(
      shared.getSnapshot(),
      config.owner,
      now,
      config.groupId,
    );
    check(
      refreshedProgress?.confirmedAt === now && !refreshedProgress.stale,
      "Real reread covering the round start must refresh that round",
    );
    step(
      "round-specific coverage retains old confirmation after unrelated reads and refreshes only on matching reread",
    );
    const oldDisk = await raw(db, sharedStorageKey(config.owner));
    const restore = quotaOnce();
    try {
      check(
        await rejected(() =>
          shared.enqueueCheckin({
            groupId: config.groupId,
            date: "2026-10-20",
            completed: true,
          }),
        ),
        "Quota failure must reject queue confirmation",
      );
    } finally {
      restore();
    }
    check(
      shared.getStatus().storageError &&
        shared.getStatus().lastError?.includes("storage is full"),
      "Quota failure must stay actionable",
    );
    check(
      (await raw(db, sharedStorageKey(config.owner))) === oldDisk,
      "Failed real transaction must not partially commit intent",
    );
    await shared.retrySaving();
    check(
      shared.getSnapshot().outbox.length === 1 &&
        !shared.getStatus().storageError,
      "Retry saving must recover retained intent",
    );
    await shared.saveDraft({
      id: crypto.randomUUID(),
      fields: { name: "Retained local draft", template: "gym" },
      updatedAt: now,
    });
    check(
      decodeSharedState(
        (await raw(db, sharedStorageKey(config.owner)))!,
        config.owner,
      ).outbox.length === 1,
      "Intent must be durable before sending",
    );
    shared.dispose();
    await store.close();
    store = await IndexedDbStore.create(config.owner, { name: db });
    shared = engine(store);
    check(
      shared.getSnapshot().drafts.length === 1 &&
        shared.getStatus().pending === 1,
      "Draft and queued intent must reload",
    );
    step(
      "real transaction quota failure, explicit recovery and durable queue/draft reopen",
    );
    await control("drop_command");
    await shared.syncNow();
    check(
      shared.getStatus().state === "offline" &&
        shared.getStatus().pending === 1,
      "A committed lost reply must retain pending intent",
    );
    const entry = shared.getSnapshot().outbox[0];
    check(
      entry.command !== null && entry.phase === "attempted",
      "Prepared command must precede remote work",
    );
    const body = JSON.stringify(entry.command);
    check(
      JSON.stringify(
        decodeSharedState(
          (await raw(db, sharedStorageKey(config.owner)))!,
          config.owner,
        ).outbox[0].command,
      ) === body,
      "Exact attempted command must be in IndexedDB",
    );
    shared.dispose();
    await store.close();
    step(
      "timeout after database commit retains exact UUID/body for browser reload",
    );
    return { assertions, checks, checkpoint: { db, now, id: entry.id, body } };
  }

  check(checkpoint, "A browser reload checkpoint is required");
  let store = await IndexedDbStore.create(config.owner, { name: db });
  let shared = engine(store);
  if (phase === 2) {
    check(
      JSON.stringify(shared.getSnapshot().outbox[0].command) ===
        checkpoint!.body,
      "Reload must retain original request bytes",
    );
    now += 86_400_000;
    await control("clock", { now: new Date(now).toISOString() });
    await shared.syncNow();
    check(
      shared.getStatus().pending === 0 && shared.getStatus().failed === 0,
      "Lost-reply retry must settle",
    );
    const repeated = (await metrics()).commands.filter(
      (c) => c.commandId === checkpoint!.id,
    );
    check(
      repeated.length === 2 &&
        repeated[0].body === repeated[1].body &&
        repeated.every((c) => c.actor === config.owner),
      "Retry must use identical SDK request bytes under original account",
    );
    const recovered = shared
      .getSnapshot()
      .cache!.snapshot.checkins.find((c) => c.checkinDate === "2026-10-20");
    check(
      recovered?.revision === 1 && recovered.completed,
      "Receipt replay must not write a second completion",
    );
    check(
      shared
        .getSnapshot()
        .cache!.snapshot.scores.find((s) => s.userId === config.owner)
        ?.adherencePct === 50,
      "Displayed score must come from the server view",
    );
    step(
      "actual browser reload and next-day receipt replay preserve UUID/body/date and server score",
    );

    await shared.enqueueCheckin({
      groupId: config.groupId,
      date: "2026-10-21",
      completed: true,
    });
    await control("hold_command");
    const sending = shared.syncNow();
    await held();
    const firstId = shared.getSnapshot().outbox[0].id;
    await shared.enqueueCheckin({
      groupId: config.groupId,
      date: "2026-10-21",
      completed: false,
    });
    check(
      shared.getSnapshot().outbox.length === 2 &&
        shared.getSnapshot().outbox[1].command === null,
      "New edit must wait independently of immutable in-flight request",
    );
    await control("release");
    await sending;
    const edits = (await metrics()).commands.filter(
      (c) => c.body && JSON.parse(c.body).payload.date === "2026-10-21",
    );
    check(
      edits.length === 2 &&
        edits[0].commandId === firstId &&
        edits[1].commandId !== firstId,
      "Check and later uncheck need separate command identities",
    );
    check(
      JSON.parse(edits[1].body!).payload.base_revision === 1,
      "Later unattempted intent uses its own predecessor's acknowledgement",
    );
    check(
      shared
        .getSnapshot()
        .cache!.snapshot.checkins.find((c) => c.checkinDate === "2026-10-21")
        ?.completed === false,
      "Later uncheck must survive a slow request",
    );
    step(
      "in-flight edit sequencing uses separate immutable commands and server revisions",
    );

    const member = shared
      .getSnapshot()
      .cache!.snapshot.memberships.find(
        (m) => m.userId === config.owner && m.groupId === config.groupId,
      )!;
    await remote(config.owner).command(
      makeCommand("set_checkin", {
        group_id: config.groupId,
        membership_id: member.id,
        date: "2026-10-21",
        captured_at: new Date(now).toISOString(),
        completed: true,
        base_revision: 2,
      }),
    );
    await shared.enqueueCheckin({
      groupId: config.groupId,
      date: "2026-10-21",
      completed: false,
    });
    const rejectedId = shared.getSnapshot().outbox[0].id;
    await shared.syncNow();
    check(
      shared.getStatus().failed === 1 &&
        shared.getSnapshot().outbox[0].failure === "conflict",
      "Opposing stale intent must be parked, never auto-overwrite",
    );
    await shared.retryFailed(rejectedId);
    check(
      shared.getSnapshot().outbox[0].id !== rejectedId,
      "An explicit new attempt needs a new UUID",
    );
    await shared.syncNow();
    check(
      shared
        .getSnapshot()
        .cache!.snapshot.checkins.find((c) => c.checkinDate === "2026-10-21")
        ?.revision === 4,
      "Explicit conflict review uses fresh canonical base revision",
    );
    step(
      "actual SQL conflict is retained for review; explicit retry gets a new UUID",
    );

    const packet = makeCommand("issue_link", { group_id: config.groupId });
    const issued = await shared.executeOnline(packet);
    check(
      issued.token?.length === 43,
      "Online token response must remain usable in memory",
    );
    check(
      !store.get(sharedStorageKey(config.owner))!.includes(issued.token!),
      "No token may enter shared cache or outbox",
    );
    const retried = await shared.executeOnline(packet);
    check(
      retried.inviteId === issued.inviteId && !retried.token,
      "Exact control retry must acknowledge the original one-time token result",
    );
    check(
      await rejected(() =>
        shared.saveDraft({
          id: crypto.randomUUID(),
          fields: { token: issued.token } as never,
          updatedAt: now,
        }),
      ),
      "Local drafts must reject bearer-token fields",
    );
    await shared.syncNow();
    step(
      "finite online commands preserve packet identity and keep tokens out of storage",
    );

    // Commit succeeded, but the acknowledgement transaction fails. Leave the
    // failed pending batch in memory, then the runner really reloads the page.
    await shared.enqueueCheckin({
      groupId: config.groupId,
      date: "2026-10-21",
      completed: true,
    });
    await control("hold_command");
    const ack = shared.syncNow();
    await held();
    const pending = shared.getSnapshot().outbox[0];
    const restore = quotaOnce();
    try {
      await control("release");
      await ack;
    } finally {
      restore();
    }
    check(
      shared.getStatus().storageError && shared.getStatus().pending === 1,
      "A failed acknowledgement save must not announce success",
    );
    const disk = decodeSharedState(
      (await raw(db, sharedStorageKey(config.owner)))!,
      config.owner,
    );
    check(
      disk.outbox[0].id === pending.id && disk.outbox[0].command !== null,
      "Crash recovery record must retain the attempted command",
    );
    shared.dispose(); // Deliberately no store.close/flush: model process loss.
    step(
      "failed acknowledgement transaction retains a durable attempted command before abrupt reload",
    );
    return {
      assertions,
      checks,
      checkpoint: {
        db,
        now,
        id: pending.id,
        body: JSON.stringify(pending.command),
      },
    };
  }

  check(
    JSON.stringify(shared.getSnapshot().outbox[0].command) === checkpoint!.body,
    "Abrupt reload must recover the pre-ack command",
  );
  await shared.syncNow();
  check(
    shared.getStatus().pending === 0 && !shared.getStatus().storageError,
    "Receipt acknowledgement must recover after crash",
  );
  check(
    shared
      .getSnapshot()
      .cache!.snapshot.checkins.find((c) => c.checkinDate === "2026-10-21")
      ?.revision === 5,
    "Acknowledgement loss must not increment the server revision twice",
  );
  const crashRetries = (await metrics()).commands.filter(
    (c) => c.commandId === checkpoint!.id,
  );
  check(
    crashRetries.length === 2 && crashRetries[0].body === crashRetries[1].body,
    "Crash retry must preserve exact immutable request bytes",
  );
  step(
    "abrupt reload after acknowledgement-save failure replays the committed receipt safely",
  );

  await control("missing", { value: true });
  await shared.syncNow();
  check(
    shared.getStatus().state === "unavailable",
    "Missing shared RPC must be separately unavailable",
  );
  await shared.enqueueCheckin({
    groupId: config.groupId,
    date: "2026-10-21",
    completed: false,
  });
  const personal = new PlannerSync({
    userId: config.owner,
    store,
    remotes: createSupabaseRemotes(config.owner, client),
    currentUserId: () => current,
    now: () => now,
  });
  personal.load();
  personal.goals.upsert({
    id: crypto.randomUUID(),
    title: "Personal remains available",
    category: "must-do",
    date: "2026-10-21",
    completed: false,
    notificationsEnabled: false,
    notificationMessage: "",
  });
  personal.events.upsert({
    id: crypto.randomUUID(),
    title: "Independent event",
    date: "2026-10-21",
    startTime: "10:00",
    endTime: "11:00",
    color: "blue",
  });
  personal.notes.upsert({
    id: crypto.randomUUID(),
    title: "Independent note",
    body: [],
    color: null,
    tags: [],
    pinned: false,
    pinnedToWidget: false,
    font: null,
    align: null,
    links: [],
    trashedAt: null,
    createdAt: new Date(now).toISOString(),
  });
  personal.diaryEntries.upsert({
    id: crypto.randomUUID(),
    date: "2026-10-21",
    oneLine: "Independent diary",
    mood: 3,
    body: null,
    tags: [],
    createdAt: new Date(now).toISOString(),
  });
  await Promise.all([personal.syncNow(), shared.syncNow()]);
  check(
    personal.getStatus().state === "idle" && personal.getStatus().pending === 0,
    "Shared outage must not block personal synchronization",
  );
  const remotes = createSupabaseRemotes(config.owner, client);
  for (const table of [
    remotes.goals,
    remotes.events,
    remotes.notes,
    remotes.diary_entries,
  ]) {
    const data = await table.fetchAll();
    check(
      data.ok && data.data.length === 1,
      "Personal collection must exist in actual PostgreSQL while shared is missing",
    );
  }
  check(
    shared.getStatus().pending === 1 &&
      shared.getSnapshot().drafts.length === 1,
    "Unavailable shared infrastructure must retain its own intent and drafts",
  );
  await control("missing", { value: false });
  await shared.syncNow();
  check(
    shared.getStatus().pending === 0,
    "Shared queue must resume once infrastructure returns",
  );
  step(
    "four real personal collections sync during a shared-only outage; shared intent recovers",
  );

  const before = JSON.stringify(shared.getSnapshot().cache);
  await control("malformed");
  await shared.syncNow();
  check(
    shared.getStatus().state === "error" &&
      JSON.stringify(shared.getSnapshot().cache) === before,
    "Partial/malformed response must never erase a valid snapshot",
  );
  await shared.syncNow();
  step("malformed full-read response retains the last valid snapshot");
  personal.dispose();

  await control("hold_snapshot");
  const oldRead = shared.syncNow();
  await held();
  current = config.other;
  sdkUser = config.other;
  shared.dispose();
  await store.close();
  const otherStore = await IndexedDbStore.create(config.other, { name: db });
  const other = engine(otherStore, config.other);
  await other.syncNow();
  await control("release");
  await oldRead;
  check(
    shared.getSnapshot().cache === null,
    "Old account must stop exposing data immediately",
  );
  check(
    other.getSnapshot().userId === config.other &&
      other
        .getSnapshot()
        .cache?.snapshot.groups.some((g) => g.id === config.otherGroupId),
    "New account must load only its own scoped record",
  );
  check(
    await rejected(() => otherStore.get(sharedStorageKey(config.owner))),
    "New account store must refuse old keys",
  );
  check(
    await rejected(() =>
      shared.enqueueCheckin({
        groupId: config.groupId,
        date: "2026-10-21",
        completed: true,
      }),
    ),
    "Disposed account must reject edits",
  );
  const pinned = createSharedRemote(config.owner, client, {
    getSession: async () => ({
      userId: config.owner,
      accessToken: `fixture.${config.owner}`,
    }),
  });
  const own = await pinned.snapshot(defaultHistoryRange(now));
  check(
    !own.groups.some((g) => g.id === config.otherGroupId),
    "SDK token changes must not replace the request's pinned account",
  );
  step(
    "late old-account read is dropped; account keys and pinned bearer identity stay isolated",
  );
  other.dispose();
  await otherStore.close();
  current = config.owner;
  sdkUser = config.owner;
  store = await IndexedDbStore.create(config.owner, { name: db });
  shared = engine(store);
  await shared.syncNow();

  // One committed-but-unacknowledged command and one genuinely unsent intent.
  await shared.enqueueCheckin({
    groupId: config.groupId,
    date: "2026-10-21",
    completed: true,
  });
  await shared.enqueueCheckin({
    groupId: config.groupId,
    date: "2026-10-20",
    completed: false,
    capturedAt: "2026-10-20T09:00:00Z",
  });
  await control("drop_command");
  await shared.syncNow();
  check(
    shared.getStatus().pending === 2,
    "Lost reply must leave both attempted and unattempted work durable",
  );
  shared.dispose();
  await store.close();
  store = await IndexedDbStore.create(config.owner, { name: db });
  shared = engine(store);
  check(
    (
      await shared.executeOnline(
        makeCommand("leave", {
          group_id: config.groupId,
          transfer_to: config.other,
        }),
      )
    ).code === "left",
    "Leave receipt must decode through the actual adapter",
  );
  check(
    shared.getSnapshot().cache!.snapshot.groups.length === 0,
    "Confirmed leave must purge cached access before a subsequent snapshot",
  );
  shared.dispose();
  await store.close();
  store = await IndexedDbStore.create(config.owner, { name: db });
  shared = engine(store);
  await shared.syncNow();
  check(
    shared.getSnapshot().cache!.snapshot.groups.length === 0 &&
      shared.getSnapshot().cache!.snapshot.scores.length === 0,
    "Successful visibility refresh must purge revoked group/history data",
  );
  check(
    shared.getStatus().pending === 0 &&
      shared.getStatus().failed === 1 &&
      shared.getSnapshot().outbox[0].date === "2026-10-20",
    "Prior committed receipt may settle after leave; unsent revoked intent must be retained for review",
  );
  check(
    shared.getSnapshot().outbox[0].failure === "forbidden" &&
      !shared.getSnapshot().outbox[0].command,
    "Unsent revoked work must not become a new remote mutation",
  );
  step(
    "revocation purges inaccessible data, acknowledges prior receipts and parks genuinely unsent work",
  );
  shared.dispose();
  await store.close();

  current = config.other;
  sdkUser = config.other;
  store = await IndexedDbStore.create(config.other, { name: db });
  shared = engine(store, config.other);
  await shared.syncNow();
  const link = await shared.executeOnline(
    makeCommand("issue_link", { group_id: config.groupId }),
  );
  check(
    link.ok && link.token,
    "Remaining owner must issue a memory-only invitation",
  );
  check(
    (await remote(config.other).preview(link.token!)).ok,
    "Real invitation preview must decode",
  );
  check(
    Array.isArray(await remote(config.other).pendingInvites()),
    "Real pending-invitation read must decode",
  );
  const joinPacket = makeCommand("join", { token: link.token!, target: 2 });
  const joined = await actorRemote(config.third).command(joinPacket);
  check(
    joined.ok && joined.eligibleRound === "2026-10-26",
    "Third account must decode acceptance and next-round eligibility through the adapter",
  );
  check(
    JSON.stringify(await actorRemote(config.third).command(joinPacket)) ===
      JSON.stringify(joined),
    "Next-round join receipt replay must decode identically",
  );
  now = Date.parse("2026-10-21T10:00:00Z");
  await control("clock", { now: new Date(now).toISOString() });
  await shared.syncNow();
  check(
    !shared
      .getSnapshot()
      .cache!.snapshot.rounds.some(
        (r) => r.groupId === config.groupId && r.isActive,
      ),
    "Next-round joiner must not resume a paused round early",
  );
  await shared.enqueueCheckin({
    groupId: config.groupId,
    date: "2026-10-20",
    capturedAt: "2026-10-20T09:00:00Z",
    completed: true,
  });
  await shared.enqueueCheckin({
    groupId: config.groupId,
    date: "2026-10-21",
    completed: true,
  });
  now = Date.parse("2026-10-25T22:00:00Z");
  await control("clock", { now: new Date(now).toISOString() });
  await shared.enqueueCheckin({
    groupId: config.groupId,
    date: "2026-10-26",
    completed: true,
  });
  await shared.syncNow();
  const resumed = shared.getSnapshot().cache!.snapshot;
  check(
    resumed.checkins.some(
      (c) =>
        c.groupId === config.groupId &&
        c.userId === config.other &&
        c.checkinDate === "2026-10-20" &&
        c.completed,
    ),
    "Pre-pause capture must settle within grace after resume",
  );
  check(
    resumed.checkins.some(
      (c) =>
        c.groupId === config.groupId &&
        c.userId === config.other &&
        c.checkinDate === "2026-10-26" &&
        c.completed,
    ),
    "Resumed-round capture must count in its original round",
  );
  check(
    shared
      .getSnapshot()
      .outbox.some(
        (e) => e.date === "2026-10-21" && e.failure === "inactive_period",
      ),
    "Pause-gap capture must remain a visible failure with its original date",
  );
  check(
    resumed.rounds
      .filter((r) => r.groupId === config.groupId)
      .map((r) => r.roundStart)
      .sort()
      .join() === "2026-10-19,2026-10-26",
    "Client must preserve exact server round set without fabricating the pause gap",
  );
  step(
    "next-round joiner cannot resume early; pre-pause/gap/resumed captures retain original lifecycle meaning",
  );

  await shared.enqueueCheckin({
    groupId: config.otherGroupId,
    date: "2026-10-26",
    completed: true,
  });
  await shared.enqueueCheckin({
    groupId: config.otherGroupId,
    date: "2026-10-25",
    capturedAt: "2026-10-25T09:00:00Z",
    completed: true,
  });
  await control("drop_command");
  await shared.syncNow();
  const archivedRetry = shared
    .getSnapshot()
    .outbox.find((e) => e.groupId === config.otherGroupId && e.command)!;
  check(
    archivedRetry && shared.getStatus().pending === 2,
    "Archive scenario must retain both committed and unsent work",
  );
  now += 1_000;
  await control("clock", { now: new Date(now).toISOString() });
  check(
    (
      await shared.executeOnline(
        makeCommand("archive", { group_id: config.otherGroupId }),
      )
    ).ok,
    "Owner archive must decode through the real adapter",
  );
  await shared.syncNow();
  check(
    shared
      .getSnapshot()
      .receipts.some((r) => r.id === archivedRetry.id && r.outcome.ok),
    "Committed receipt must replay after archive",
  );
  check(
    shared
      .getSnapshot()
      .outbox.some(
        (e) =>
          e.groupId === config.otherGroupId &&
          e.date === "2026-10-25" &&
          e.failure === "archived" &&
          !e.command,
      ),
    "Archive must park genuinely unsent work without sending it",
  );
  const archiveRounds = () =>
    shared
      .getSnapshot()
      .cache!.snapshot.rounds.filter((r) => r.groupId === config.otherGroupId)
      .sort((a, b) => a.roundStart.localeCompare(b.roundStart));
  const frozen = JSON.stringify(archiveRounds());
  now += 56 * 86_400_000;
  await control("clock", { now: new Date(now).toISOString() });
  await shared.syncNow({ from: "2026-10-01", until: "2026-12-31" });
  check(
    JSON.stringify(archiveRounds()) === frozen,
    "Reading eight weeks later must not create post-archive rounds",
  );
  const archiveRequests = (await metrics()).commands.filter(
    (c) => c.commandId === archivedRetry.id,
  );
  check(
    archiveRequests.length === 2 &&
      archiveRequests[0].body === archiveRequests[1].body,
    "Archive receipt replay must retain identical UUID/body",
  );
  step(
    "archival permits committed receipt replay only; unsent intent parks and historical round keys remain frozen",
  );
  const timed = createSharedRemote(config.other, client, {
    getSession: () => new Promise(() => {}),
    timeoutMs: 10,
  });
  check(
    await rejected(() => timed.snapshot(defaultHistoryRange(now))),
    "Session resolution must obey the adapter deadline",
  );
  const stalledSdk = createClient<Database>(fixtureUrl, "disposable-key", {
    accessToken: () => new Promise(() => {}),
  });
  const stalled = createSharedRemote(config.other, stalledSdk, {
    getSession: async () => ({
      userId: config.other,
      accessToken: `fixture.${config.other}`,
    }),
    timeoutMs: 10,
  });
  check(
    await Promise.race([
      rejected(() => stalled.snapshot(defaultHistoryRange(now))),
      new Promise((resolve) => setTimeout(() => resolve(false), 500)),
    ]),
    "SDK token resolution must not outlive the adapter deadline",
  );
  shared.dispose();
  await store.close();
  store = await IndexedDbStore.create(config.other, { name: db });
  shared = engine(store, config.other);
  check(
    !shared.getStatus().storageError && shared.getStatus().failed === 2,
    "Rejected intents and their negative receipts must survive a real IndexedDB reopen",
  );
  shared.dispose();
  await store.close();
  return { assertions, checks };
}

Object.assign(window, { runSharedIntegration });
