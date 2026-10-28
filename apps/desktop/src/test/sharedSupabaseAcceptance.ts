// Real local Supabase Auth/JWT/PostgREST. Never import this into the application.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { createSharedRemote } from "@/lib/sync/shared/remote";
import { makeCommand } from "@/lib/sharedGoals/contracts";

type Settings = { API_URL: string; ANON_KEY: string; JWT_SECRET?: string };
export async function runSupabaseAcceptance(settings: Settings) {
  const base = settings.API_URL;
  if (base !== "http://127.0.0.1:56421")
    throw Error("Disposable loopback required");
  if (!settings.JWT_SECRET)
    throw Error(
      "Disposable claim probes require a local signing-key positive control",
    );
  let assertions = 0;
  const checks: string[] = [],
    jwt: Record<string, unknown>[] = [],
    clients: SupabaseClient[] = [];
  const deniedToken = (status: number) => status === 401 || status === 403;
  const check = (ok: unknown, label: string) => {
    if (!ok) throw Error(label);
    assertions++;
  };
  const client = (storage?: Map<string, string>) => {
    const c = createClient(base, settings.ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: !!storage,
        ...(storage
          ? {
              storage: {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => {
                  storage.set(key, value);
                },
                removeItem: (key: string) => {
                  storage.delete(key);
                },
              },
            }
          : {}),
      },
    });
    clients.push(c);
    return c;
  };
  const request = async (
    route: string,
    token?: string,
    body?: unknown,
    method?: string,
  ) => {
    const r = await fetch(base + route, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        apikey: settings.ANON_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const verification = async (email: string, type: "signup" | "recovery") => {
    for (let n = 0; n < 30; n++) {
      const inbox = await fetch("http://127.0.0.1:56424/api/v1/messages").then(
        (r) => r.json(),
      );
      for (const message of inbox.messages ?? []) {
        if (
          !(message.To ?? []).some(
            (to: { Address: string }) => to.Address === email,
          )
        )
          continue;
        const detail = await fetch(
          `http://127.0.0.1:56424/api/v1/message/${message.ID}`,
        ).then((r) => r.json());
        const html: string = `${detail.HTML ?? ""} ${detail.Text ?? ""}`;
        const links =
          html.replaceAll("&amp;", "&").match(/https?:\/\/[^\s"<>]+/g) ?? [];
        for (const raw of links) {
          const url = new URL(raw);
          if (
            url.origin === base &&
            url.pathname === "/auth/v1/verify" &&
            url.searchParams.get("type") === type
          )
            return { token_hash: url.searchParams.get("token")!, type };
        }
      }
      await delay(200);
    }
    throw Error(`Local mail capture missing ${type} verification`);
  };
  try {
    const suffix = randomUUID().slice(0, 8),
      password = `Disposable-${randomUUID()}-aA1!`;
    const store = new Map<string, string>(),
      a = client(store),
      b = client(),
      outsider = client();
    const users: { id: string; email: string }[] = [];
    for (const [n, c] of [a, b, outsider].entries()) {
      const email = `facta-${suffix}-${n}@example.test`;
      const signup = await c.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: "facta://auth/callback" },
      });
      check(
        !signup.error && signup.data.user && !signup.data.session,
        "real signup requires email confirmation and does not sign in early",
      );
      const unconfirmed = await c.auth.signInWithPassword({ email, password });
      check(!!unconfirmed.error, "unconfirmed account cannot sign in");
      const confirmation = await c.auth.verifyOtp(
        await verification(email, "signup"),
      );
      check(
        !confirmation.error &&
          !!confirmation.data.session &&
          !!confirmation.data.user?.email_confirmed_at,
        "local captured email confirms through real Auth and returns a session",
      );
      users.push({ id: confirmation.data.user!.id, email });
    }
    checks.push(
      "real GoTrue signup, unconfirmed rejection, captured local email confirmation and issued sessions",
    );
    const resumed = client(store),
      restored = await resumed.auth.getSession();
    check(
      restored.data.session?.user.id === users[0].id,
      "SDK persistence restores the real issued account",
    );
    check(
      !(await resumed.auth.getUser()).error,
      "restored session is validated by Auth HTTP",
    );
    const oldRefresh = restored.data.session!.refresh_token;
    const refreshed = await resumed.auth.refreshSession();
    check(
      !refreshed.error &&
        refreshed.data.session?.user.id === users[0].id &&
        refreshed.data.session.refresh_token !== oldRefresh,
      "refresh rotates the token and keeps account identity",
    );
    const refreshedSession = refreshed.data.session!;
    const at = refreshedSession.access_token;
    const tokenPayload = JSON.parse(
      Buffer.from(at.split(".")[1], "base64url").toString(),
    );
    check(
      tokenPayload.sub === users[0].id &&
        tokenPayload.aud === "authenticated" &&
        tokenPayload.role === "authenticated",
      "issued JWT carries the authenticated account/role/audience",
    );
    const authenticated = await request("/auth/v1/user", at);
    check(
      authenticated.status === 200 && authenticated.data.id === users[0].id,
      "Auth validates a real access token",
    );
    const bad = at.slice(0, -8) + "AAAAAAAA";
    for (const [kind, token] of [
      ["tampered signature", bad],
      ["unsigned", "eyJhbGciOiJub25lIn0.e30."],
    ]) {
      const auth = await request("/auth/v1/user", token),
        rest = await request("/rest/v1/shared_groups?select=id", token);
      check(
        deniedToken(auth.status) && deniedToken(rest.status),
        `${kind} rejected by Auth and PostgREST (Auth ${auth.status}, REST ${rest.status})`,
      );
      jwt.push({ kind, auth: auth.status, postgrest: rest.status });
    }
    if (settings.JWT_SECRET) {
      const sign = (change: Record<string, unknown>) => {
        const header = Buffer.from(
          JSON.stringify({ alg: "HS256", typ: "JWT" }),
        ).toString("base64url");
        const payload = Buffer.from(
          JSON.stringify({ ...tokenPayload, ...change }),
        ).toString("base64url");
        return `${header}.${payload}.${createHmac("sha256", settings.JWT_SECRET!).update(`${header}.${payload}`).digest("base64url")}`;
      };
      const control = sign({});
      const authControl = await request("/auth/v1/user", control),
        restControl = await request(
          "/rest/v1/shared_groups?select=id",
          control,
        );
      const usable = authControl.status === 200 && restControl.status === 200;
      check(
        usable,
        "same-signer valid-claims control succeeds before claim rejection probes",
      );
      jwt.push({
        kind: "local HS256 valid-claims positive control",
        auth: authControl.status,
        postgrest: restControl.status,
      });
      if (usable)
        for (const [kind, changes] of [
          ["expired", { exp: Math.floor(Date.now() / 1000) - 120 }],
          ["future nbf", { nbf: Math.floor(Date.now() / 1000) + 3600 }],
          ["wrong audience", { aud: "another-application" }],
          ["wrong issuer", { iss: "https://invalid.example.test/auth/v1" }],
        ] as const) {
          const token = sign(changes);
          const auth = await request("/auth/v1/user", token),
            rest = await request("/rest/v1/shared_groups?select=id", token);
          jwt.push({ kind, auth: auth.status, postgrest: rest.status });
        }
    }
    checks.push(
      "JWT signature/unsigned rejection and explicit claim-validation probes with positive-control evidence",
    );
    const remotes = [resumed, b, outsider].map((c, n) =>
      createSharedRemote(users[n].id, c as never),
    );
    for (let n = 0; n < 3; n++)
      check(
        (
          await remotes[n].command(
            makeCommand("set_profile", {
              handle: `http_${suffix}_${n}`,
              display_name: `HTTP person ${n}`,
            }),
          )
        ).ok,
        "real PostgREST command maps profile outcome",
      );
    const draftCommand = makeCommand("create_draft", {
      name: "HTTP · gym \u2713",
      template: "gym",
      schedule_kind: "n",
      target: 2,
      time_zone: "Asia/Riyadh",
      round_weekday: 1,
    });
    const draft = await remotes[0].command(draftCommand),
      replay = await remotes[0].command(draftCommand);
    check(
      draft.ok &&
        draft.groupId &&
        replay.groupId === draft.groupId &&
        JSON.stringify(replay) === JSON.stringify(draft),
      "real HTTP same-UUID receipt replay preserves group identity and mapped outcome",
    );
    const gid = draft.groupId!;
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const nextMonday = new Date(`${tomorrow}T00:00:00Z`);
    while (nextMonday.getUTCDay() !== 1)
      nextMonday.setUTCDate(nextMonday.getUTCDate() + 1);
    const first = nextMonday.toISOString().slice(0, 10);
    check(
      (
        await remotes[0].command(
          makeCommand("publish", {
            group_id: gid,
            expected_revision: 1,
            first_round_date: first,
          }),
        )
      ).ok,
      "real publication accepts validated upcoming round",
    );
    const invitation = await remotes[0].command(
      makeCommand("issue_link", { group_id: gid }),
    );
    check(
      invitation.ok && invitation.token,
      "real RPC serializes memory-only invitation token",
    );
    const before = await b.from("shared_groups").select("id").eq("id", gid);
    check(
      !before.error && before.data.length === 0,
      "nonmember account HTTP table read cannot see the group",
    );
    const denied = await remotes[1].command(
      makeCommand("archive", { group_id: gid }),
    );
    check(
      !denied.ok && denied.code === "forbidden",
      "nonmember HTTP command cannot archive another account's group",
    );
    const preview = await remotes[1].preview(invitation.token!);
    check(
      "groupId" in preview && preview.groupId === gid,
      "authenticated preview RPC maps only the invited group",
    );
    const joinCommand = makeCommand("join", {
      token: invitation.token!,
      target: 2,
    });
    const joined = await remotes[1].command(joinCommand),
      joinedReplay = await remotes[1].command(joinCommand);
    check(
      joined.ok &&
        joined.groupId === gid &&
        joined.eligibleRound &&
        JSON.stringify(joinedReplay) === JSON.stringify(joined),
      "PostgREST join eligible_round date and exact-UUID receipt decode correctly",
    );
    const range = {
      from: new Date(Date.now() - 86400000 * 14).toISOString().slice(0, 10),
      until: first,
    };
    const snapshot = await remotes[0].snapshot(range);
    check(
      snapshot.groups.some(
        (g) => g.id === gid && g.name === "HTTP · gym \u2713",
      ),
      "real snapshot JSON/Unicode/dates map through the production adapter",
    );
    const theirSnapshot = await remotes[2].snapshot(range);
    check(
      !theirSnapshot.groups.some((g) => g.id === gid),
      "outsider snapshot HTTP response excludes the group",
    );
    const anonymous = client();
    for (const name of [
      "facta_shared_command",
      "facta_shared_snapshot",
      "facta_shared_preview",
      "facta_shared_pending_invites",
    ]) {
      const body =
        name === "facta_shared_command"
          ? {
              command_id: randomUUID(),
              operation: "archive",
              payload: { group_id: gid },
            }
          : name === "facta_shared_snapshot"
            ? { history_from: range.from, history_until: range.until }
            : name === "facta_shared_preview"
              ? { token: invitation.token }
              : {};
      const response = await request(`/rest/v1/rpc/${name}`, undefined, body);
      check(
        response.status === 401 || response.status === 403,
        "anonymous HTTP cannot execute shared RPCs",
      );
    }
    const anonRows = await anonymous.from("shared_groups").select("id");
    check(
      !!anonRows.error || anonRows.data?.length === 0,
      "anonymous HTTP obtains no group rows",
    );
    const direct = await b
      .from("shared_memberships")
      .insert({ group_id: gid, user_id: users[2].id });
    check(
      !!direct.error,
      "authenticated direct membership writes cannot bypass RPC constraints",
    );
    const privateRead = await b
      .schema("facta_private")
      .from("shared_invite_tokens")
      .select("*");
    check(
      !!privateRead.error,
      "private token storage is not exposed through HTTP",
    );
    const malformed = await request("/rest/v1/rpc/facta_shared_command", at, {
      command_id: randomUUID(),
      operation: "archive",
      payload: { group_id: gid, injected: true },
    });
    check(
      malformed.status >= 400,
      "real RPC rejects unknown serialized payload keys",
    );
    check(
      (await remotes[1].command(makeCommand("leave", { group_id: gid }))).ok,
      "member leaves through actual HTTP RPC",
    );
    const afterLeave = await b.from("shared_groups").select("id").eq("id", gid);
    check(
      !afterLeave.error && afterLeave.data.length === 0,
      "leave immediately removes HTTP row access",
    );
    checks.push(
      "actual production adapter: receipt retries, Unicode/date serialization, eligible_round join, preview/snapshot, anonymous/cross-account/RLS/private-schema and leave authorization",
    );
    const recoveryEmail = users[2].email;
    check(
      !(await outsider.auth.resetPasswordForEmail(recoveryEmail)).error,
      "Auth sends recovery only into local mail capture",
    );
    check(
      !(
        await outsider.auth.verifyOtp(
          await verification(recoveryEmail, "recovery"),
        )
      ).error,
      "real recovery token verification succeeds",
    );
    const nextPassword = `Updated-${randomUUID()}-aA1!`;
    check(
      !(await outsider.auth.updateUser({ password: nextPassword })).error,
      "Auth updates disposable account password",
    );
    await outsider.auth.signOut();
    check(
      !!(
        await outsider.auth.signInWithPassword({
          email: recoveryEmail,
          password,
        })
      ).error,
      "old password is rejected after recovery",
    );
    check(
      !(
        await outsider.auth.signInWithPassword({
          email: recoveryEmail,
          password: nextPassword,
        })
      ).error,
      "new password signs in",
    );
    const logoutRefresh = (await outsider.auth.getSession()).data.session!
      .refresh_token;
    check(
      !(await outsider.auth.signOut()).error &&
        !(await outsider.auth.getSession()).data.session,
      "real logout clears SDK session and revokes refresh session",
    );
    const loggedOut = await client().auth.refreshSession({
      refresh_token: logoutRefresh,
    });
    check(!!loggedOut.error, "logged-out refresh token is rejected by GoTrue");
    checks.push(
      "actual password recovery/update, old-password rejection, sign-in/logout and server refresh-session revocation",
    );
    // Real naturally issued JWT expiration, without changing Auth/PostgREST clocks.
    const remaining = tokenPayload.exp * 1000 - Date.now() + 35000;
    if (remaining > 0 && remaining < 180000) await delay(remaining);
    const expiredAuth = await request("/auth/v1/user", at),
      expiredRest = await request("/rest/v1/shared_groups?select=id", at);
    check(
      deniedToken(expiredAuth.status) && deniedToken(expiredRest.status),
      "naturally expired issued JWT rejected by Auth and PostgREST",
    );
    check(
      !(await resumed.auth.refreshSession()).error,
      "valid refresh session recovers after access-token expiry",
    );
    checks.push(
      "natural access-token expiration on Auth and PostgREST, followed by real refresh recovery",
    );
    const claimGaps = jwt.filter(
      (r) =>
        ["wrong audience", "wrong issuer", "future nbf", "expired"].includes(
          r.kind as string,
        ) &&
        (!deniedToken(r.auth as number) || !deniedToken(r.postgrest as number)),
    );
    return {
      ok: claimGaps.length === 0,
      assertions,
      checks,
      jwt,
      claimGaps,
      identity:
        "real local GoTrue-issued users and JWTs; Kong/PostgREST HTTP; no synthetic identity bridge",
      limits: [
        "local configuration only; no live Supabase",
        "production Windows installer/native gates remain separate",
      ],
    };
  } finally {
    for (const c of clients) {
      c.auth.stopAutoRefresh();
      await c.removeAllChannels();
    }
  }
}

/** No UI input: another real session changes the disposable group while the
 * unchanged production SyncProvider reconciles it into the native export. */
export async function runNativeBackgroundAcceptance(
  settings: Settings,
  fixture: {
    api: string;
    groupId: string;
    today: string;
    users: { id: string; email: string; password: string }[];
  },
  exportFile: string,
) {
  if (
    settings.API_URL !== "http://127.0.0.1:56421" ||
    fixture.api !== settings.API_URL
  )
    throw Error("Dedicated disposable stack required");
  let assertions = 0;
  const check = (ok: unknown, label: string) => {
    if (!ok) throw Error(label);
    assertions++;
  };
  const clients = [0, 1].map(() =>
    createClient(settings.API_URL, settings.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  );
  const readExport = async () => JSON.parse(await readFile(exportFile, "utf8"));
  const groupOf = (data: any) =>
    data.shared_goals?.groups?.find((g: any) => g.groupId === fixture.groupId);
  const waitExport = async (predicate: (data: any) => boolean) => {
    for (let n = 0; n < 75; n++) {
      const data = await readExport();
      if (data.user_id !== fixture.users[0].id)
        throw Error("Native account changed; stop fixture mutations");
      if (predicate(data)) return data;
      await delay(2000);
    }
    throw Error(
      "Native automatic reconciliation did not update export within 150 seconds; no UI input attempted",
    );
  };
  try {
    const before = await waitExport((e) =>
      groupOf(e)?.rows.some((r: any) => r.self && r.adherencePct === 50),
    );
    check(
      before.user_id === fixture.users[0].id &&
        groupOf(before)?.rows.some((r: any) => r.self && r.adherencePct === 50),
      "native production-provider export starts with the real account and confirmed 50% score",
    );
    const personal = JSON.stringify(before.goals);
    for (const c of clients) {
      const signed = await c.auth.signInWithPassword({
        email: fixture.users[0].email,
        password: fixture.users[0].password,
      });
      check(
        !signed.error && signed.data.user?.id === fixture.users[0].id,
        "independent real Auth session for the same account",
      );
    }
    const remotes = clients.map((c) =>
      createSharedRemote(fixture.users[0].id, c as never),
    );
    const range = {
      from: new Date(Date.parse(fixture.today + "T00:00:00Z") - 14 * 86400000)
        .toISOString()
        .slice(0, 10),
      until: fixture.today,
    };
    const snapshot = await remotes[0].snapshot(range);
    const membership = snapshot.memberships.find(
      (m) => m.groupId === fixture.groupId && m.userId === fixture.users[0].id,
    )!;
    check(
      membership &&
        !snapshot.checkins.some(
          (c) =>
            c.membershipId === membership.id && c.checkinDate === fixture.today,
        ),
      "disposable today's occurrence is initially unchecked; do not overwrite user work",
    );
    const payload = {
      group_id: fixture.groupId,
      membership_id: membership.id,
      date: fixture.today,
      captured_at: new Date().toISOString(),
      completed: true,
      base_revision: 0,
    };
    const intent = makeCommand("set_checkin", payload),
      checked = await remotes[0].command(intent);
    check(checked.ok, "real HTTP session confirms today's check-in");
    const replay = await remotes[0].command(intent);
    check(
      JSON.stringify(replay) === JSON.stringify(checked),
      "same UUID/body HTTP retry returns the exact receipt",
    );
    const conflict = await remotes[1].command(
      makeCommand("set_checkin", { ...payload, completed: false }),
    );
    check(
      !conflict.ok && conflict.code === "conflict",
      "second authenticated session cannot overwrite a newer check-in revision",
    );
    const confirmed = await waitExport((e) =>
      groupOf(e)?.rows.some((r: any) => r.self && r.adherencePct === 100),
    );
    check(
      !groupOf(confirmed).stale &&
        !groupOf(confirmed).pending &&
        JSON.stringify(confirmed.goals) === personal,
      "native automatic read exports confirmed 100% and preserves personal completion",
    );
    const server = await remotes[0].snapshot(range);
    check(
      server.scores.some(
        (s) =>
          s.groupId === fixture.groupId &&
          s.userId === fixture.users[0].id &&
          s.adherencePct === 100,
      ),
      "real scoring-view snapshot matches native export",
    );
    check(
      (
        await remotes[0].command(
          makeCommand("transfer_owner", {
            group_id: fixture.groupId,
            user_id: fixture.users[1].id,
          }),
        )
      ).ok,
      "ownership transfers before the owner leaves",
    );
    check(
      (
        await remotes[0].command(
          makeCommand("leave", { group_id: fixture.groupId }),
        )
      ).ok,
      "real HTTP owner leave succeeds",
    );
    const cleared = await waitExport((e) => !groupOf(e));
    check(
      JSON.stringify(cleared.goals) === personal &&
        cleared.shared_goals.groups.length === 0,
      "native production-provider reconciliation removes inaccessible shared rows while retaining personal data",
    );
    return {
      ok: true,
      assertions,
      checks: [
        "real Auth independent sessions: immutable receipt and stale-revision conflict",
        "production native SyncProvider automatic 50→100 score/export parity and personal independence",
        "real ownership/leave HTTP followed by automatic native export access cleanup",
      ],
      limits: [
        "no UI input or visual claim; screen left alone at owner's request",
        "separate app ID/data/test scheme; not installer or production facta:// acceptance",
        "two sessions on one host, not two physical devices",
      ],
    };
  } finally {
    for (const c of clients) {
      c.auth.stopAutoRefresh();
      await c.removeAllChannels();
    }
  }
}
