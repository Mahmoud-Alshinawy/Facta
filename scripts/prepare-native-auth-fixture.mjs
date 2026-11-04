// Disposable real GoTrue users; a historical domain fixture, never synthetic JWTs.
// Alters only the private domain clock during setup, restoring it in finally.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { nativeScoringPlan } from "../apps/desktop/src/test/sharedAcceptanceDates.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const area = path.join(root, "tmp/supabase-acceptance");
const settings = JSON.parse(
  await readFile(path.join(area, "status.json"), "utf8"),
);
if (settings.API_URL !== "http://127.0.0.1:56421")
  throw Error("Dedicated local stack required");
const container = "supabase_db_facta-acceptance-20261028";
const inspected = JSON.parse(
  execFileSync("docker", ["inspect", container], {
    encoding: "utf8",
    windowsHide: true,
  }),
);
if (
  inspected[0].Config.Labels["com.supabase.cli.project"] !==
  "facta-acceptance-20261028"
)
  throw Error("Unexpected database container");
const sql = (source) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: source, encoding: "utf8", windowsHide: true },
  );
const require = createRequire(path.join(root, "apps/desktop/package.json"));
const { createClient } = require("@supabase/supabase-js");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const verifyBoundaries = process.argv.includes("--verify-boundaries");
const file = path.join(area, "native-users.json");
let saved;
try {
  if (!verifyBoundaries) saved = JSON.parse(await readFile(file, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (saved && saved.api !== settings.API_URL)
  throw Error("Unexpected saved fixture URL");
const admin = createClient(
  settings.API_URL,
  settings.SERVICE_ROLE_KEY,
  options,
);
const users = saved?.users ?? [];
const clients = [];
const attempt = async (client, operation, payload) => {
  const result = await client.rpc("facta_shared_command", {
    command_id: randomUUID(),
    operation,
    payload,
  });
  if (result.error) throw Error(`Disposable fixture ${operation} errored`);
  return result.data;
};
const command = async (client, operation, payload) => {
  const data = await attempt(client, operation, payload);
  if (!data?.ok) throw Error(`Disposable fixture ${operation} failed`);
  return data;
};
try {
  for (let n = 0; n < 2; n++) {
    if (!users[n]) {
      const email = `native-${randomUUID().slice(0, 8)}-${n}@example.test`,
        password = `Native-${randomUUID()}-aA1!`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error) throw Error("Disposable user provisioning failed");
      users[n] = { id: created.data.user.id, email, password };
    }
    const client = createClient(settings.API_URL, settings.ANON_KEY, options);
    clients.push(client);
    const login = await client.auth.signInWithPassword({
      email: users[n].email,
      password: users[n].password,
    });
    if (login.error || login.data.user?.id !== users[n].id)
      throw Error("Disposable sign-in failed");
    if (!saved)
      await command(client, "set_profile", {
        handle: `native_${randomUUID().slice(0, 8)}`,
        display_name: `Native person ${n}`,
      });
  }
  const setClock = (instant, read = false) => {
    const expression = instant
      ? `'${instant}'::timestamptz`
      : "clock_timestamp()";
    const names = read ? ["sg_now", "sg_read_now"] : ["sg_now"];
    sql(
      names
        .map(
          (name) =>
            `create or replace function facta_private.${name}() returns timestamptz language sql volatile set search_path='' as $$ select ${expression} $$;`,
        )
        .join("\n"),
    );
  };
  const check = (ok, label) => {
    if (!ok) throw Error(label);
    assertions++;
  };
  let assertions = 0;
  const cases = verifyBoundaries
    ? [
        "2026-10-26",
        "2026-10-27",
        "2026-10-28",
        "2026-10-29",
        "2026-10-30",
        "2026-10-31",
        "2026-11-01",
      ]
        .map((day) => ({ now: Date.parse(`${day}T09:00:00Z`) }))
        // Last and first second around Riyadh midnight (UTC+3). The action
        // instant belongs to one group date; the other side must be refused.
        .concat(
          { now: Date.parse("2026-10-28T20:59:59Z"), otherSide: "2026-10-29" },
          { now: Date.parse("2026-10-28T21:00:00Z"), otherSide: "2026-10-28" },
        )
    : [{ now: Date.now() }];
  const results = [];
  const skew = [];
  if (verifyBoundaries) {
    // Device clock ahead of the database: Sunday-based group whose round started
    // yesterday, with the domain clock held at a fixed server time.
    const server = Date.parse("2026-10-28T09:00:00Z");
    const plan = nativeScoringPlan(server);
    try {
      setClock(plan.createdAt);
      const draft = await command(clients[0], "create_draft", {
        name: "Clock skew group",
        template: "gym",
        schedule_kind: "n",
        target: 2,
        time_zone: plan.zone,
        round_weekday: plan.roundWeekday,
      });
      await command(clients[0], "publish", {
        group_id: draft.group_id,
        expected_revision: 1,
        first_round_date: plan.firstRoundDate,
      });
      const invite = await command(clients[0], "issue_link", {
        group_id: draft.group_id,
      });
      await command(clients[1], "join", { token: invite.token, target: 2 });
      setClock(new Date(server).toISOString(), true);
      const snapshot = await clients[0].rpc("facta_shared_snapshot", {
        history_from: plan.seedDate,
        history_until: plan.today,
      });
      if (snapshot.error) throw Error("Disposable snapshot failed");
      const own = snapshot.data.memberships.find(
        (m) => m.group_id === draft.group_id && m.user_id === users[0].id,
      );
      const stamp = (ms) => new Date(server + ms).toISOString();
      const send = (captured, date, base_revision, completed = true) =>
        attempt(clients[0], "set_checkin", {
          group_id: draft.group_id,
          membership_id: own.id,
          date,
          captured_at: captured,
          completed,
          base_revision,
        });
      const stored = async () => {
        const row = await clients[0]
          .from("shared_checkins")
          .select("captured_at,revision")
          .eq("group_id", draft.group_id)
          .eq("user_id", users[0].id)
          .eq("checkin_date", plan.today)
          .single();
        if (row.error) throw Error("Disposable check-in read failed");
        return row.data;
      };
      const beyond = await send(stamp(300_001), plan.today, 0);
      check(
        beyond?.ok === false && beyond.code === "invalid_date",
        "a stamp beyond 5 minutes ahead is refused",
      );
      const ahead = await send(stamp(5_000), plan.today, 0);
      check(ahead?.ok, "a stamp 5 seconds ahead is accepted");
      const first = await stored();
      check(
        Date.parse(first.captured_at) === server,
        "the stored capture is clamped to the server time",
      );
      const edge = await send(
        stamp(300_000),
        plan.today,
        first.revision,
        false,
      );
      check(edge?.ok, "a stamp exactly 5 minutes ahead is accepted");
      const second = await stored();
      check(
        Date.parse(second.captured_at) === server,
        "the edge capture is clamped to the server time too",
      );
      const past = await send(stamp(-60_000), plan.today, second.revision);
      check(past?.ok, "a stamp behind the server is still accepted");
      check(
        Date.parse((await stored()).captured_at) === server - 60_000,
        "a stamp behind the server is stored unchanged",
      );
      // Riyadh is UTC+3, so 21:00Z is group midnight. The controls show the
      // refusal comes from the date rule, not from a wrong zone in this setup.
      setClock("2026-10-28T20:59:30Z", true);
      const sameDay = await send(
        "2026-10-28T20:59:50Z",
        plan.today,
        (await stored()).revision,
      );
      check(
        plan.today === "2026-10-28" && sameDay?.ok,
        "control: 20 s ahead, still the 28th in Riyadh, is accepted",
      );
      const midnight = await send("2026-10-28T21:00:10Z", "2026-10-29", 0);
      check(
        midnight?.ok === false && midnight.code === "invalid_date",
        "a device already past group midnight is refused until the server gets there",
      );
      const wrongDay = await send(
        "2026-10-28T21:00:10Z",
        plan.today,
        (await stored()).revision,
      );
      check(
        wrongDay?.ok === false && wrongDay.code === "invalid_date",
        "control: the same stamp for the 28th is refused, as it is the 29th in Riyadh",
      );
      setClock("2026-10-28T21:00:20Z", true);
      const after = await send("2026-10-28T21:00:10Z", "2026-10-29", 0);
      check(
        after?.ok,
        "control: the same past-midnight check-in is accepted once the server reaches midnight",
      );
      skew.push(
        "beyond 5 min refused; 5 s and exactly 5 min stored clamped; behind unchanged; past group midnight refused by the date rule (same-day control accepted, accepted after server midnight)",
      );
    } finally {
      setClock(null, true);
    }
  }
  for (const { now, otherSide } of cases) {
    const plan = nativeScoringPlan(now);
    let groupId;
    try {
      check(
        plan.firstRoundDate > plan.creationDate,
        "first round is strictly after group-local fixture creation",
      );
      setClock(plan.createdAt);
      const draft = await command(clients[0], "create_draft", {
        name: "Real Auth native group",
        template: "gym",
        schedule_kind: "n",
        target: 2,
        time_zone: plan.zone,
        round_weekday: plan.roundWeekday,
      });
      groupId = draft.group_id;
      await command(clients[0], "publish", {
        group_id: groupId,
        expected_revision: 1,
        first_round_date: plan.firstRoundDate,
      });
      const invite = await command(clients[0], "issue_link", {
        group_id: groupId,
      });
      await command(clients[1], "join", { token: invite.token, target: 2 });
      // Boundary cases move only domain command/view clocks, never Auth/JWT.
      setClock(
        verifyBoundaries ? plan.actionCapturedAt : null,
        verifyBoundaries,
      );
      const snapshot = async () => {
        const r = await clients[0].rpc("facta_shared_snapshot", {
          history_from: plan.seedDate,
          history_until: plan.today,
        });
        if (r.error) throw Error("Disposable snapshot failed");
        return r.data;
      };
      const before = await snapshot();
      const own = before.memberships.find(
        (m) => m.group_id === groupId && m.user_id === users[0].id,
      );
      await command(clients[0], "set_checkin", {
        group_id: groupId,
        membership_id: own.id,
        date: plan.seedDate,
        captured_at: plan.seedCapturedAt,
        completed: true,
        base_revision: 0,
      });
      const seeded = await snapshot();
      const score50 = seeded.scores.find(
        (r) => r.group_id === groupId && r.user_id === users[0].id,
      );
      check(
        score50 &&
          score50.round_start === plan.seedDate &&
          score50.completed_days === 1 &&
          score50.target === 2 &&
          Number(score50.adherence_pct) === 50,
        `fixture ${plan.today}: actual server seed is 1 of 2 / 50% in the current round`,
      );
      if (verifyBoundaries) {
        if (otherSide) {
          const refused = await attempt(clients[0], "set_checkin", {
            group_id: groupId,
            membership_id: own.id,
            date: otherSide,
            captured_at: plan.actionCapturedAt,
            completed: true,
            base_revision: 0,
          });
          check(
            refused?.ok === false && refused.code === "invalid_date",
            `fixture ${plan.actionCapturedAt}: server refuses ${otherSide} across Riyadh midnight`,
          );
        }
        await command(clients[0], "set_checkin", {
          group_id: groupId,
          membership_id: own.id,
          date: plan.today,
          captured_at: plan.actionCapturedAt,
          completed: true,
          base_revision: 0,
        });
        const after = await snapshot();
        const score100 = after.scores.find(
          (r) => r.group_id === groupId && r.user_id === users[0].id,
        );
        check(
          score100 &&
            score100.round_start === score50.round_start &&
            score100.completed_days === 2 &&
            score100.target === 2 &&
            Number(score100.adherence_pct) === 100,
          `fixture ${plan.today}: actual server action reaches 2 of 2 / 100% in the same round`,
        );
        results.push({
          at: plan.actionCapturedAt,
          today: plan.today,
          creationDate: plan.creationDate,
          firstRoundDate: plan.firstRoundDate,
          roundWeekday: plan.roundWeekday,
          roundStart: score50.round_start,
          before: 50,
          after: 100,
        });
      } else {
        if (!saved) {
          const goal = await clients[0].from("goals").insert({
            id: randomUUID(),
            user_id: users[0].id,
            title: "Native independent personal goal",
            category: "must-do",
            date: plan.today,
            completed: false,
            repeat: "none",
            notifications_enabled: false,
            notification_message: "",
          });
          if (goal.error) throw Error("Disposable personal goal failed");
        }
        await writeFile(
          file,
          JSON.stringify({
            api: settings.API_URL,
            key: settings.ANON_KEY,
            groupId,
            today: plan.today,
            plan,
            users,
          }),
        );
        results.push({ today: plan.today, groupId, before: 50 });
      }
    } finally {
      setClock(null, true);
    }
  }
  const result = {
    ok: true,
    assertions,
    cases: results,
    skew,
    clocks: "domain clocks restored; Auth/JWT clocks unchanged",
    nativeAccounts: 2,
    reusedAccounts: !!saved,
  };
  await writeFile(
    path.join(
      area,
      verifyBoundaries ? "boundary-result.json" : "native-fixture-result.json",
    ),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  for (const client of [admin, ...clients]) {
    await client.auth.stopAutoRefresh();
    await client.removeAllChannels();
  }
}
