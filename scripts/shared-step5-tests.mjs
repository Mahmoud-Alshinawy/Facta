import { mkdir } from "node:fs/promises";
import path from "node:path";
export async function runSharedStep5Tests({ context, url, fixture, root }) {
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
  page.on("pageerror", (e) => console.error("Step 5 runtime:", e.message));
  let assertions = 0;
  const check = (ok, label) => {
    if (!ok) throw Error(label);
    assertions++;
  };
  const command = (actor, op, payload) =>
    page.evaluate(
      ({ actor, op, payload }) => window.sharedUi.commandAs(actor, op, payload),
      { actor, op, payload },
    );
  const clock = async (at) => {
    await fetch(`${fixture}/test/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clock", now: at }),
    });
    await page.clock.setFixedTime(new Date(at));
    await page.evaluate((at) => window.sharedUi.now(at), at);
  };
  const actor = (id) => page.evaluate((id) => window.sharedUi.setActor(id), id);
  const sync = () => page.evaluate(() => window.sharedUi.sync());
  const today = page.locator('[data-progress-surface="today"]'),
    widget = page.locator('[data-progress-surface="widget"]');
  const select = async (id) => {
    await today.getByLabel("Today shared group").selectOption(id);
    await widget.getByLabel("Progress shared group").selectOption(id);
  };
  try {
    await page.goto(target.href);
    await page.waitForFunction(() => !!window.sharedUi);
    await clock("2026-10-14T09:00:00Z");
    const create = async (name, zone = "Asia/Riyadh", join = true) => {
      const d = await command(config.owner, "create_draft", {
        name,
        template: "gym",
        schedule_kind: "n",
        target: 2,
        time_zone: zone,
        round_weekday: 1,
      });
      if (!d.ok) throw Error(d.code);
      const p = await command(config.owner, "publish", {
        group_id: d.groupId,
        expected_revision: 1,
        first_round_date: "2026-10-19",
      });
      if (!p.ok) throw Error(p.code);
      const link = await command(config.owner, "issue_link", {
        group_id: d.groupId,
      });
      if (join) {
        const j = await command(config.other, "join", {
          token: link.token,
          target: 2,
        });
        if (!j.ok) throw Error(j.code);
      }
      return { id: d.groupId, token: link.token, name };
    };
    const gym = await create("Step 5 Gym"),
      other = await create("Step 5 Reading", "America/New_York"),
      waiting = await create("Step 5 Waiting", "Asia/Riyadh", false);
    await clock("2026-10-20T23:30:00Z");
    await actor(config.owner);
    await page.evaluate(() => window.sharedUi.seedPersonal("2026-10-20"));
    await select(gym.id);
    check(
      (await today.innerText()).includes("2026-10-21") &&
        (await widget.innerText()).includes("2026-10-21") &&
        (await today.innerText()).includes("2026-10-19 – 2026-10-25") &&
        (await widget.innerText()).includes("2026-10-19 – 2026-10-25"),
      "traveller Today and Progress use the group date, not the device's October 20",
    );
    const personalBefore = await page.evaluate(() =>
      JSON.stringify(window.sharedUi.personal()),
    );
    await today
      .getByRole("button", { name: `Check in: ${gym.name}`, exact: true })
      .click();
    await page.waitForFunction(
      (gid) =>
        window.sharedUi
          .snapshot()
          .cache.snapshot.scores.some(
            (s) => s.groupId === gid && s.completedDays === 1,
          ),
      gym.id,
    );
    const parity = async (id) => {
      const scores = await page.evaluate(
        (gid) =>
          window.sharedUi
            .snapshot()
            .cache.snapshot.scores.filter(
              (s) => s.groupId === gid && s.roundStart === "2026-10-19",
            ),
        id,
      );
      for (const surface of [today, widget])
        for (const s of scores) {
          const row = surface.locator(`[data-score="${s.userId}"]`);
          check(
            Number(await row.getAttribute("data-percent")) === s.adherencePct &&
              Number(await row.getAttribute("data-rank")) === s.rank,
            "Today/Progress exactly preserve server adherence and rank",
          );
        }
    };
    await parity(gym.id);
    check(
      (await page.evaluate(() =>
        JSON.stringify(window.sharedUi.personal()),
      )) === personalBefore,
      "shared check-in leaves personal collections and goalStats unchanged",
    );
    check(
      (await widget.innerText()).includes("0 of 1 done today"),
      "personal ring excludes the shared completion",
    );
    await page.evaluate(() => window.sharedUi.togglePersonal());
    check(
      (await widget.innerText()).includes("1 of 1 done today"),
      "personal completion updates the independent personal ring",
    );
    await parity(gym.id);
    check(
      (await widget.getByRole("button").count()) === 1 &&
        (await widget
          .getByRole("button", { name: "Open group", exact: true })
          .count()) === 1,
      "Progress rows are read-only apart from Open group",
    );
    const exported = await page.evaluate(() => window.sharedUi.widgetExport());
    check(
      exported.userId === config.owner &&
        exported.groups.every((g) => g.rows.length <= 4) &&
        new TextEncoder().encode(JSON.stringify(exported)).length <= 65536,
      "durable IndexedDB export is account-scoped and bounded",
    );
    check(
      !JSON.stringify(exported).includes(gym.token) &&
        !JSON.stringify(exported).includes(other.token) &&
        !/["'](?:token|outbox|drafts|memberships|invites|receipts)["']:/.test(
          JSON.stringify(exported),
        ),
      "export contains neither invite tokens nor raw sync state",
    );
    await widget
      .getByRole("button", { name: "Open group", exact: true })
      .click();
    await page.getByRole("heading", { name: gym.name, exact: true }).waitFor();
    await page.waitForFunction(
      (name) => document.activeElement?.textContent === name,
      gym.name,
    );
    const detail = page.locator(".shared-detail");
    check(
      Number(
        await detail
          .locator(`[data-score="${config.owner}"]`)
          .getAttribute("data-percent"),
      ) === 50,
      "Open group routes to Shared with the same SQL score and mounted heading focus",
    );
    await page
      .getByRole("button", { name: "Test Today surface", exact: true })
      .click();
    check(
      (await widget.getByLabel("Progress shared group").inputValue()) ===
        gym.id &&
        (await today.getByLabel("Today shared group").inputValue()) === gym.id,
      "selection survives surface unmount/remount",
    );
    await select(other.id);
    check(
      (await widget.innerText()).includes("2026-10-20") &&
        (await today.innerText()).includes("2026-10-20"),
      "changing groups consistently uses the New York group date",
    );
    await select(gym.id);
    await isolated.setOffline(true);
    await today
      .getByRole("button", { name: `Undo check-in: ${gym.name}`, exact: true })
      .click();
    await page.waitForFunction(
      () => window.sharedUi.snapshot().outbox.length === 1,
    );
    check(
      (await widget.innerText()).includes("Pending changes") &&
        (await today.innerText()).includes("Pending changes"),
      "offline desired-state checkmark is labelled pending on both surfaces",
    );
    await parity(gym.id);
    await isolated.setOffline(false);
    await sync();
    await page.waitForFunction(
      () => window.sharedUi.snapshot().outbox.length === 0,
    );
    await parity(gym.id);
    await clock("2026-10-20T23:34:00Z");
    check(
      (await widget.innerText()).includes("Last confirmed") &&
        (await today.innerText()).includes("Last confirmed"),
      "retained scores age stale consistently without a new read",
    );
    await select(waiting.id);
    check(
      (await widget.innerText()).includes("Waiting") &&
        (await widget.locator("[data-score]").count()) === 0 &&
        (await today.locator("[data-score]").count()) === 0,
      "waiting group has no invented zero-score leaderboard",
    );
    await select(gym.id);
    await clock("2026-10-21T09:00:00Z");
    await command(config.other, "leave", { group_id: gym.id });
    await sync();
    check(
      (await widget.innerText()).includes("Paused") &&
        (await today.innerText()).includes("Paused") &&
        (await today
          .getByRole("button", { name: `Check in: ${gym.name}`, exact: true })
          .isDisabled()),
      "pause is consistent and Today stops accepting check-ins",
    );
    await mkdir(path.join(root, "tmp/shared-goals-runtime/step5-shots"), {
      recursive: true,
    });
    for (const theme of ["default", "midnight", "ember", "light"]) {
      await page.evaluate((t) => window.sharedUi.theme(t), theme);
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      await page.screenshot({
        path: path.join(
          root,
          `tmp/shared-goals-runtime/step5-shots/${theme}.png`,
        ),
      });
    }
    await actor(config.other);
    check(
      !(await page.locator("[data-progress-surface]").allTextContents())
        .join()
        .includes(gym.name),
      "account change removes the former account's selected group and data",
    );
    const switched = await page.evaluate(() => window.sharedUi.widgetExport());
    check(
      switched.userId === config.other &&
        !switched.groups.some((g) => g.groupId === gym.id),
      "export after account switch excludes inaccessible groups",
    );
    check(
      await page.evaluate(
        (id) =>
          JSON.parse(localStorage.getItem("facta.progress.test-progress"))
            .userId === id,
        config.other,
      ),
      "selection is rebound to the new account",
    );
    await actor(config.owner);
    await select(gym.id);
    await command(config.owner, "archive", { group_id: gym.id });
    await command(config.owner, "leave", { group_id: gym.id });
    await sync();
    check(
      (await widget.innerText()).includes("Group unavailable") &&
        !(await widget.innerText()).includes(gym.name) &&
        !(await today.innerText()).includes(gym.name),
      "leave removes rows/names and leaves the old selection unavailable rather than switching silently",
    );
    check(
      !(await page.evaluate(() => window.sharedUi.widgetExport())).groups.some(
        (g) => g.groupId === gym.id,
      ),
      "confirmed leave removes the group from the next durable export",
    );
    await actor(config.seats[0]);
    for (const g of await page.evaluate(
      () => window.sharedUi.snapshot().cache.snapshot.groups,
    ))
      await command(config.seats[0], "leave", { group_id: g.id });
    await sync();
    await today
      .getByRole("button", { name: "Start shared Gym", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "New shared goal", exact: true })
      .waitFor();
    check(
      (await page
        .getByRole("button", {
          name: "One more day: Your days per week",
          exact: true,
        })
        .count()) === 1,
      "Today Gym launcher opens the preselected Gym details",
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Test Today surface", exact: true })
      .click();
    await today
      .getByRole("button", { name: "Start shared Custom", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "New shared goal", exact: true })
      .waitFor();
    await page.getByRole("radio", { name: "Every day", exact: true }).waitFor();
    check(
      (await page
        .getByRole("button", {
          name: "One more day: Your days per week",
          exact: true,
        })
        .count()) === 0 &&
        (await page
          .getByRole("radio", { name: "Every day", exact: true })
          .count()) > 0,
      "Today Custom launcher opens Custom without a Gym target",
    );
    await actor(null);
    check(
      (await page
        .getByRole("heading", { name: "Test sign-in gate", exact: true })
        .count()) === 1,
      "signed-out gate removes both mounted shared surfaces",
    );
    return {
      ok: true,
      assertions,
      checks: [
        "Today/Progress/Shared SQL parity, group-local traveller dates, independent personal completion and stats",
        "read-only widget rows, bounded token-free durable export, stable selection/remount, pending/stale/waiting/paused and account/leave cleanup",
        "Today Gym/Custom launchers and mounted group navigation",
      ],
    };
  } catch (e) {
    console.error(
      "Step 5 visible state:",
      (await page.locator("body").innerText())
        .replace(/facta:\/\/join\/[A-Za-z0-9_-]+/g, "[redacted invitation]")
        .slice(0, 2500),
    );
    throw e;
  } finally {
    await isolated.close();
  }
}
