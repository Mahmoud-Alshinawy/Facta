import { mkdir } from "node:fs/promises";
import path from "node:path";

// Production mounted surfaces, native IndexedDB, real SDK commands and SQL.
// The synthetic identity bridge does not verify Auth/JWT/PostgREST.
export async function runSharedStep5ReviewTests({
  context,
  url,
  fixture,
  root,
}) {
  const config = await fetch(`${fixture}/test/config`).then((r) => r.json());
  const isolated = await context.browser().newContext({
    timezoneId: "America/Los_Angeles",
    viewport: { width: 1280, height: 960 },
  });
  await isolated.route("**/*", (r) =>
    ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
  const page = await isolated.newPage();
  await page.clock.install({ time: new Date("2026-10-14T09:00:00Z") });
  const target = new URL(url);
  target.searchParams.set("step5", "1");
  let assertions = 0;
  const check = (ok, label) => {
    if (!ok) throw Error(label);
    assertions++;
  };
  const control = (body) =>
    fetch(`${fixture}/test/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const clock = async (at, display = true) => {
    await control({ action: "clock", now: at });
    await page.clock.setFixedTime(new Date(at));
    await page.evaluate(
      ({ at, display }) =>
        display ? window.sharedUi.now(at) : window.sharedUi.actionNow(at),
      { at, display },
    );
  };
  const command = (actor, op, payload) =>
    page.evaluate(
      ({ actor, op, payload }) => window.sharedUi.commandAs(actor, op, payload),
      { actor, op, payload },
    );
  const sync = () => page.evaluate(() => window.sharedUi.sync());
  const snapshot = () => page.evaluate(() => window.sharedUi.snapshot());
  const metrics = () => fetch(`${fixture}/test/metrics`).then((r) => r.json());
  const today = page.locator('[data-progress-surface="today"]');
  const widget = page.locator('[data-progress-surface="widget"]');
  const select = async (id) => {
    await today.getByLabel("Today shared group").selectOption(id);
    await widget.getByLabel("Progress shared group").selectOption(id);
  };
  try {
    await page.goto(target.href);
    await page.waitForFunction(() => !!window.sharedUi);
    await clock("2026-10-14T09:00:00Z");
    const create = async (name) => {
      const d = await command(config.owner, "create_draft", {
        name,
        template: "gym",
        schedule_kind: "n",
        target: 2,
        time_zone: "Asia/Riyadh",
        round_weekday: 1,
      });
      if (!d.ok) throw Error(d.code);
      const published = await command(config.owner, "publish", {
        group_id: d.groupId,
        expected_revision: 1,
        first_round_date: "2026-10-19",
      });
      if (!published.ok) throw Error(published.code);
      const link = await command(config.owner, "issue_link", {
        group_id: d.groupId,
      });
      const joined = await command(config.other, "join", {
        token: link.token,
        target: 2,
      });
      if (!joined.ok) throw Error(joined.code);
      return { id: d.groupId, name };
    };
    const paused = await create("Review action clock"),
      daily = await create("Review midnight clock");
    await clock("2026-10-20T09:00:00Z");
    await page.evaluate((id) => window.sharedUi.setActor(id), config.owner);
    await select(paused.id);
    await clock("2026-10-20T09:00:30Z", false);
    const left = await command(config.other, "leave", { group_id: paused.id });
    check(left.ok, "peer pauses the group after Today rendered");
    await clock("2026-10-20T09:00:45Z", false);
    await today
      .getByRole("button", { name: `Check in: ${paused.name}`, exact: true })
      .click();
    await page.waitForFunction((id) => {
      const s = window.sharedUi.snapshot();
      return (
        s.outbox.some((i) => i.groupId === id && i.phase === "failed") ||
        s.receipts.some((i) => i.groupId === id)
      );
    }, paused.id);
    const rejected = (await snapshot()).outbox.find(
      (i) => i.groupId === paused.id,
    );
    check(
      rejected?.failure === "inactive_period",
      "SQL rejects the actual post-pause action instant",
    );
    check(
      rejected.capturedAt === "2026-10-20T09:00:45.000Z" &&
        rejected.date === "2026-10-20",
      "mounted action captures click time rather than the 09:00 display render",
    );
    check(
      !(await snapshot()).cache.snapshot.checkins.some(
        (c) => c.groupId === paused.id,
      ),
      "post-pause click creates no confirmed check-in",
    );

    // Prior day is already checked. A click after midnight must not undo it.
    await clock("2026-10-20T20:59:59Z");
    await sync();
    await select(daily.id);
    const member = (await snapshot()).cache.snapshot.memberships.find(
      (m) => m.groupId === daily.id && m.userId === config.owner,
    );
    const previous = await command(config.owner, "set_checkin", {
      group_id: daily.id,
      membership_id: member.id,
      date: "2026-10-20",
      captured_at: "2026-10-20T20:59:59Z",
      completed: true,
      base_revision: 0,
    });
    check(previous.ok, "previous group-local day is confirmed checked");
    await sync();
    await today
      .getByRole("button", {
        name: `Undo check-in: ${daily.name}`,
        exact: true,
      })
      .waitFor();
    await clock("2026-10-20T21:00:01Z", false);
    check(
      (await today.innerText()).includes("2026-10-20"),
      "Today display has not refreshed across Riyadh midnight",
    );
    await control({ action: "drop_command" });
    await today
      .getByRole("button", {
        name: `Undo check-in: ${daily.name}`,
        exact: true,
      })
      .click();
    await page.waitForFunction(
      (id) =>
        window.sharedUi
          .snapshot()
          .outbox.some((i) => i.groupId === id && i.command),
      daily.id,
    );
    const attempted = (await snapshot()).outbox.find(
      (i) => i.groupId === daily.id,
    );
    check(
      attempted.date === "2026-10-21" &&
        attempted.completed &&
        attempted.capturedAt === "2026-10-20T21:00:01.000Z",
      "midnight action derives new group date and checked state from the same fresh instant",
    );
    await clock("2026-10-20T21:00:45Z", false);
    await sync();
    await page.waitForFunction(
      (id) => !window.sharedUi.snapshot().outbox.some((i) => i.groupId === id),
      daily.id,
    );
    const attempts = (await metrics()).commands.filter(
      (c) => c.commandId === attempted.id,
    );
    check(
      attempts.length >= 2 &&
        attempts.every((c) => c.body === attempts[0].body),
      "lost-reply retry preserves the mounted click's UUID and exact serialized body",
    );
    check(
      JSON.parse(attempts[0].body).payload.captured_at ===
        "2026-10-20T21:00:01.000Z",
      "receipt replay retains the original captured instant after the live clock advances",
    );
    const checked = (await snapshot()).cache.snapshot.checkins.filter(
      (c) => c.groupId === daily.id && c.userId === config.owner && c.completed,
    );
    check(
      checked.length === 2 &&
        checked.some((c) => c.checkinDate === "2026-10-20") &&
        checked.some((c) => c.checkinDate === "2026-10-21"),
      "date transition checks the new day and preserves the previous day's completion",
    );

    await clock("2026-10-21T09:00:00Z");
    await sync();
    const shots = path.join(
      root,
      "tmp/shared-goals-runtime/step5-review-shots",
    );
    await mkdir(shots, { recursive: true });
    for (const theme of ["midnight", "ember"]) {
      await page.evaluate((theme) => window.sharedUi.theme(theme), theme);
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      for (const surface of [today, widget]) {
        for (const [user, high] of [
          [config.owner, true],
          [config.other, false],
        ]) {
          const row = surface.locator(`[data-score="${user}"]`);
          check(
            Number(await row.getAttribute("data-percent")) === (high ? 100 : 0),
            `${theme}: actual SQL high/low adherence row is mounted`,
          );
          const colors = await row
            .locator(".progress-bar i")
            .evaluate((bar, high) => {
              const s = getComputedStyle(bar),
                probe = document.createElement("i");
              bar.append(probe);
              probe.style.color = `var(${high ? "--event-green" : "--text-2"})`;
              const expected = getComputedStyle(probe).color;
              probe.style.color = "var(--accent)";
              const accent = getComputedStyle(probe).color;
              probe.remove();
              return { actual: s.backgroundColor, expected, accent };
            }, high);
          check(
            colors.actual === colors.expected &&
              (!high || colors.actual !== colors.accent),
            `${theme}: Today/Progress high bars use event-green and low bars retain text-2`,
          );
        }
      }
      await page.screenshot({ path: path.join(shots, `${theme}.png`) });
    }

    await clock("2026-10-25T20:59:59Z");
    await sync();
    const before = (await metrics()).commands.filter(
      (c) => c.operation === "set_checkin",
    ).length;
    await clock("2026-10-25T21:00:01Z", false);
    await today
      .getByRole("button", { name: `Check in: ${daily.name}`, exact: true })
      .click();
    await today
      .getByRole("status")
      .filter({ hasText: "Reconnect to confirm the current round" })
      .waitFor();
    check(
      !(await snapshot()).outbox.some((i) => i.groupId === daily.id),
      "new unconfirmed round cannot receive a backdated click from the old display",
    );
    check(
      (await metrics()).commands.filter((c) => c.operation === "set_checkin")
        .length === before,
      "round-boundary action sends no check-in before authoritative round confirmation",
    );
    return {
      ok: true,
      assertions,
      checks: [
        "mounted post-pause SQL rejection, frozen-display midnight/round transitions, immutable lost-reply replay",
        "actual SQL 100% and 0% rows: Today/Progress computed green/grey colors in Midnight and Ember",
      ],
    };
  } catch (e) {
    console.error(
      "Step 5 review outbox:",
      JSON.stringify((await snapshot())?.outbox),
    );
    console.error(
      "Step 5 review commands:",
      JSON.stringify(
        (await metrics()).commands
          .filter((c) => c.operation === "set_checkin")
          .slice(-4),
      ),
    );
    console.error(
      "Step 5 review visible:",
      (await today.innerText()).slice(0, 1800),
    );
    throw e;
  } finally {
    await isolated.close();
  }
}
