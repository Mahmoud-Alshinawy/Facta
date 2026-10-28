// Disposable real GoTrue users; a historical domain fixture, never synthetic JWTs.
// Alters only the private domain clock during setup, restoring it in finally.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
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
const file = path.join(area, "native-users.json");
let saved;
try {
  saved = JSON.parse(await readFile(file, "utf8"));
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
const command = async (client, operation, payload) => {
  const result = await client.rpc("facta_shared_command", {
    command_id: randomUUID(),
    operation,
    payload,
  });
  if (result.error || !result.data?.ok)
    throw Error(`Disposable fixture ${operation} failed`);
  return result.data;
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
  const past = new Date(Date.now() - 14 * 86400000),
    first = new Date(past);
  while (first.getUTCDay() !== 1) first.setUTCDate(first.getUTCDate() + 1);
  let groupId;
  try {
    sql(
      `create or replace function facta_private.sg_now() returns timestamptz language sql volatile set search_path='' as $$ select '${past.toISOString()}'::timestamptz $$;`,
    );
    const draft = await command(clients[0], "create_draft", {
      name: "Real Auth native group",
      template: "gym",
      schedule_kind: "n",
      target: 2,
      time_zone: "Asia/Riyadh",
      round_weekday: 1,
    });
    groupId = draft.group_id;
    await command(clients[0], "publish", {
      group_id: groupId,
      expected_revision: 1,
      first_round_date: first.toISOString().slice(0, 10),
    });
    const invite = await command(clients[0], "issue_link", {
      group_id: groupId,
    });
    await command(clients[1], "join", { token: invite.token, target: 2 });
  } finally {
    sql(
      "create or replace function facta_private.sg_now() returns timestamptz language sql volatile set search_path='' as $$ select clock_timestamp() $$;",
    );
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
  const snapshot = await clients[0].rpc("facta_shared_snapshot", {
    history_from: yesterday,
    history_until: today,
  });
  if (snapshot.error) throw Error("Disposable snapshot failed");
  const own = snapshot.data.memberships.find(
    (m) => m.group_id === groupId && m.user_id === users[0].id,
  );
  await command(clients[0], "set_checkin", {
    group_id: groupId,
    membership_id: own.id,
    date: yesterday,
    captured_at: `${yesterday}T09:00:00Z`,
    completed: true,
    base_revision: 0,
  });
  if (!saved) {
    const goal = await clients[0].from("goals").insert({
      id: randomUUID(),
      user_id: users[0].id,
      title: "Native independent personal goal",
      category: "must-do",
      date: today,
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
      today,
      users,
    }),
  );
  console.log(
    JSON.stringify({
      nativeAccounts: 2,
      reusedAccounts: !!saved,
      groupId,
      today,
      clocks: "domain setup only; restored; Auth/JWT clocks unchanged",
    }),
  );
} finally {
  for (const client of [admin, ...clients]) {
    await client.auth.stopAutoRefresh();
    await client.removeAllChannels();
  }
}
