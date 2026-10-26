import { mkdir } from "node:fs/promises";
import path from "node:path";
export async function runSharedStep4Tests({
  page,
  context,
  url,
  fixture,
  root,
}) {
  const config = await fetch(`${fixture}/test/config`).then((r) => r.json());
  const control = (action, extra = {}) =>
    fetch(`${fixture}/test/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    }).then((r) => r.json());
  const button = (name) => page.getByRole("button", { name, exact: true });
  const heading = (name) => page.getByRole("heading", { name, exact: true });
  let assertions = 0;
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    assertions++;
  };
  const shellUrl = new URL(url);
  shellUrl.searchParams.set("shell", "1");
  await page.goto(shellUrl.href);
  await page.waitForFunction(() => !!window.sharedUi);
  await control("clock", { now: "2026-10-20T09:00:00Z" });
  await page.evaluate((id) => window.sharedUi.setActor(id), config.owner);
  await page.evaluate(() => window.sharedUi.now("2026-10-20T09:00:00Z"));
  await button("Open Client integration").click();
  await heading("Client integration").waitFor();
  await page.waitForFunction(
    () => document.activeElement?.textContent === "Client integration",
  );
  check(
    (await page
      .getByRole("region", { name: "Leaderboard", exact: true })
      .count()) === 1,
    "real pointer opens the detail panels and focuses the mounted heading",
  );
  await button("Check in: Client integration").click();
  await page.waitForFunction(
    (uid) =>
      window.sharedUi
        .snapshot()
        .cache.snapshot.scores.some(
          (s) => s.userId === uid && s.completedDays === 1,
        ),
    config.owner,
  );
  const parity = async () => {
    const state = await page.evaluate(() => window.sharedUi.snapshot());
    const rows = state.cache.snapshot.scores.filter(
      (s) => s.groupId === config.groupId && s.roundStart === "2026-10-19",
    );
    for (const row of rows) {
      const ui = page.locator(
        `[data-score="${row.userId}"][data-round="${row.roundStart}"]`,
      );
      check(
        Number(await ui.getAttribute("data-percent")) === row.adherencePct &&
          Number(await ui.getAttribute("data-rank")) === row.rank,
        "displayed rank and adherence exactly match the real SQL snapshot",
      );
    }
  };
  await parity();
  await page.keyboard.press("c");
  await page.waitForFunction(
    (uid) =>
      window.sharedUi
        .snapshot()
        .cache.snapshot.scores.some(
          (s) => s.userId === uid && s.completedDays === 0,
        ),
    config.owner,
  );
  await parity();
  await page.keyboard.press("Escape");
  await heading("Goals").waitFor();
  check(
    await page.evaluate(
      (id) => document.activeElement?.id === `shared-open-${id}`,
      config.groupId,
    ),
    "Escape returns focus to the original mounted card opener",
  );
  const sync = () => page.evaluate(() => window.sharedUi.sync());
  const clock = async (at) => {
    await control("clock", { now: at });
    await page.evaluate((at) => window.sharedUi.now(at), at);
  };
  const command = (actor, operation, payload) =>
    page.evaluate(
      ({ actor, operation, payload }) =>
        window.sharedUi.commandAs(actor, operation, payload),
      { actor, operation, payload },
    );
  await button("Open Client integration").click();
  await page.evaluate(() => window.sharedUi.keyboardBlocked(true));
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.keyboard.press("c");
  check(
    (await page.evaluate(() => window.sharedUi.snapshot().outbox.length)) === 0,
    "C is blocked by the application modal/shortcut scope flag",
  );
  await page.evaluate(() => window.sharedUi.keyboardBlocked(false));
  await button("Edit split").click();
  const modal = page.getByRole("dialog");
  await modal.waitFor();
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  check(
    await page.evaluate(
      () => !!document.activeElement?.closest('[role="dialog"]'),
    ),
    "real Tab navigation remains inside the modal",
  );
  await page.keyboard.press("c");
  check(
    (await page.evaluate(() => window.sharedUi.snapshot().outbox.length)) === 0,
    "C inside the split dialog does not check in underneath it",
  );
  await page
    .getByRole("button", {
      name: "One more day: Your days per week",
      exact: true,
    })
    .click();
  await button("Confirm target change").click();
  await modal.getByText("Confirmed:", { exact: false }).waitFor();
  check(
    await page.evaluate((uid) => {
      const state = window.sharedUi.snapshot(),
        m = state.cache.snapshot.memberships.find(
          (m) =>
            m.userId === uid &&
            m.groupId ===
              state.cache.snapshot.groups.find(
                (g) => g.name === "Client integration",
              ).id,
        );
      return (
        state.cache.snapshot.targets.some(
          (t) =>
            t.membershipId === m.id &&
            t.effectiveRound === "2026-10-26" &&
            t.target === 3,
        ) &&
        state.cache.snapshot.scores.find((s) => s.membershipId === m.id)
          .target === 2
      );
    }, config.owner),
    "Gym target changes are visible but keep the current server denominator unchanged",
  );
  await button("Cancel pending change").click();
  await page.waitForFunction((gid) => {
    const s = window.sharedUi.snapshot().cache.snapshot;
    const m = s.memberships.find(
      (m) =>
        m.groupId === gid &&
        m.userId === s.groups.find((g) => g.id === gid).ownerId,
    );
    return s.targets.some(
      (t) =>
        t.membershipId === m.id &&
        t.effectiveRound === "2026-10-26" &&
        t.target === 2,
    );
  }, config.groupId);
  check(
    (await button("Cancel pending change").count()) === 0,
    "cancelling a pending target restores the next-round target rather than changing history",
  );
  await button("Confirm target change").click();
  await page.waitForFunction(
    (uid) =>
      window.sharedUi
        .snapshot()
        .cache.snapshot.targets.some(
          (t) =>
            t.target === 3 &&
            t.effectiveRound === "2026-10-26" &&
            window.sharedUi
              .snapshot()
              .cache.snapshot.memberships.some(
                (m) => m.id === t.membershipId && m.userId === uid,
              ),
        ),
    config.owner,
  );
  await page.waitForFunction(
    () =>
      !document.querySelector('[role="dialog"] button[type="submit"]')
        ?.disabled,
  );
  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.activeElement?.textContent === "Edit split",
  );
  check(true, "Escape closes split editing and restores the opener focus");

  await context.setOffline(true);
  await button("Check in: Client integration").click();
  await page.waitForFunction(
    () => window.sharedUi.snapshot().outbox.length === 1,
  );
  check(
    (await page
      .locator("[data-score]")
      .first()
      .getAttribute("data-percent")) === "0",
    "offline pending checkmarks do not invent a new score",
  );
  await button("Manage").click();
  check(
    await button("Confirm leave").isDisabled(),
    "unresolved offline check-ins block leaving",
  );
  await page.keyboard.press("Escape");
  await context.setOffline(false);
  await button("Sync now").click();
  await page.waitForFunction(
    () => window.sharedUi.snapshot().outbox.length === 0,
  );
  await parity();
  // A second real SDK client advances the same row twice while the first device
  // is offline; the opposite stale intent must be parked for explicit review.
  const peerContext = await context.browser().newContext();
  await peerContext.route("**/*", (route) =>
    ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  const peer = await peerContext.newPage();
  await peer.goto(url);
  await peer.waitForFunction(() => !!window.sharedUi);
  const state = await page.evaluate(() => window.sharedUi.snapshot());
  const member = state.cache.snapshot.memberships.find(
    (m) => m.groupId === config.groupId && m.userId === config.owner,
  );
  const row = state.cache.snapshot.checkins.find(
    (c) => c.membershipId === member.id && c.checkinDate === "2026-10-20",
  );
  await context.setOffline(true);
  await button("Undo check-in: Client integration").click();
  await page.waitForFunction(
    () => window.sharedUi.snapshot().outbox.length === 1,
  );
  const staleId = await page.evaluate(
    () => window.sharedUi.snapshot().outbox[0].id,
  );
  const peerCommand = (payload) =>
    peer.evaluate(
      ({ actor, payload }) =>
        window.sharedUi.commandAs(actor, "set_checkin", payload),
      { actor: config.owner, payload },
    );
  const payload = {
    group_id: config.groupId,
    membership_id: member.id,
    date: "2026-10-20",
    captured_at: "2026-10-20T09:00:00Z",
    completed: false,
    base_revision: row.revision,
  };
  const a = await peerCommand(payload);
  const b = await peerCommand({
    ...payload,
    completed: true,
    base_revision: a.revision,
  });
  check(
    a.ok && b.ok,
    "the independent SDK peer commits opposing states through the real SQL RPC",
  );
  await context.setOffline(false);
  await button("Sync now").click();
  await page.getByText("conflict", { exact: false }).first().waitFor();
  check(
    await page.evaluate(
      () => window.sharedUi.snapshot().outbox[0]?.phase === "failed",
    ),
    "stale opposing offline intent remains visible as a conflict",
  );
  await button("Review and retry").click();
  await page.waitForFunction(
    () => window.sharedUi.snapshot().outbox.length === 0,
  );
  check(
    await page.evaluate(
      (id) =>
        window.sharedUi
          .snapshot()
          .receipts.some((r) => r.id !== id && r.outcome.ok),
      staleId,
    ),
    "explicit conflict retry uses a new identity and confirms without overwriting silently",
  );
  await parity();
  await peerContext.close();

  const link = await command(config.owner, "issue_link", {
    group_id: config.groupId,
  });
  const joined = await command(config.third, "join", {
    token: link.token,
    target: 3,
  });
  check(
    joined.ok || joined.code === "already_joined",
    "late accepted member is established through the real adapter",
  );
  await sync();
  check(
    (await page
      .getByText("Starts Mon 26 Oct 2026 · No rank", { exact: true })
      .count()) > 0,
    "next-round member has a visible eligibility state and no current rank",
  );
  check(
    (await page.getByLabel(/2026-10-21: future/).count()) > 0,
    "future check-in days are labelled upcoming rather than missed",
  );
  await clock("2026-10-21T12:00:00Z");
  await command(config.other, "leave", { group_id: config.groupId });
  await sync();
  check(
    await button("Check in: Client integration").isDisabled(),
    "leaving one eligible member pauses check-ins despite another accepted next-round member",
  );
  check(
    (await page.getByLabel(/2026-10-22: inactive/).count()) > 0,
    "days beyond the server pause cutoff are inactive, not missed",
  );
  check(
    (await page
      .getByRole("region", { name: "Leaderboard", exact: true })
      .getByText("Left", { exact: false })
      .count()) > 0,
    "the departed member stays in the frozen historical leaderboard",
  );
  await clock("2026-10-26T09:00:00Z");
  await sync();
  check(
    await page.evaluate(
      (uid) =>
        window.sharedUi
          .snapshot()
          .cache.snapshot.scores.some(
            (s) =>
              s.userId === uid &&
              s.roundStart === "2026-10-26" &&
              s.target === 3,
          ),
      config.owner,
    ),
    "resumed boundary applies the confirmed pending Gym target",
  );
  await page.getByLabel("Displayed round").selectOption("2026-10-19");
  check(
    (await page.locator('[data-round="2026-10-19"]').count()) === 2,
    "history preserves the original two-person roster and no synthetic round rows",
  );
  await button("Current / refresh").click();
  await clock("2026-10-27T09:00:00Z");
  await sync();
  await button("Manage").click();
  await page.getByRole("radio", { name: "Archive group", exact: true }).check();
  await button("Confirm archive").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const archivedRounds = await page.evaluate(
    (id) =>
      window.sharedUi
        .snapshot()
        .cache.snapshot.rounds.filter((r) => r.groupId === id),
    config.groupId,
  );
  await clock("2026-11-16T09:00:00Z");
  await sync();
  check(
    await page.evaluate(
      ({ id, keys }) =>
        window.sharedUi
          .snapshot()
          .cache.snapshot.rounds.filter((r) => r.groupId === id)
          .map((r) => r.roundStart)
          .join() === keys,
      {
        id: config.groupId,
        keys: archivedRounds.map((r) => r.roundStart).join(),
      },
    ),
    "reading weeks after archival creates no new rounds",
  );
  check(
    await button("Check in: Client integration").isDisabled(),
    "archived history is read-only",
  );
  await button("Manage").click();
  await button("Confirm leave").click();
  await heading("Goals").waitFor();
  check(
    await page.evaluate(
      (id) =>
        !window.sharedUi
          .snapshot()
          .cache.snapshot.groups.some((g) => g.id === id),
      config.groupId,
    ),
    "confirmed archived-owner leave purges access and local group data",
  );
  await clock("2026-11-18T09:00:00Z");
  const create = async (name, kind, join = true) => {
    const draft = await command(config.owner, "create_draft", {
      name,
      icon: "goals",
      template: "custom",
      schedule_kind: kind,
      weekdays: kind === "days" ? [1, 3] : [],
      times_per_week: kind === "n" ? 1 : null,
      target: null,
      time_zone: "Asia/Riyadh",
      round_weekday: 1,
    });
    if (!draft.ok) throw new Error(`Create fixture: ${draft.code}`);
    const published = await command(config.owner, "publish", {
      group_id: draft.groupId,
      expected_revision: 1,
      first_round_date: "2026-11-23",
    });
    if (!published.ok) throw new Error(`Publish fixture: ${published.code}`);
    const invite = await command(config.owner, "issue_link", {
      group_id: draft.groupId,
    });
    if (join) {
      const out = await command(config.other, "join", { token: invite.token });
      if (!out.ok) throw new Error(`Join fixture: ${out.code}`);
    }
    return { id: draft.groupId, token: invite.token, name };
  };
  const days = await create("Training days", "days");
  const every = await create("Daily walk", "every");
  const weekly = await create("Read together", "n");
  const waiting = await create("Waiting together", "every", false);
  await clock("2026-11-23T09:00:00Z");
  await sync();
  await button("Open Waiting together").click();
  check(
    (await button("Check in: Waiting together").isDisabled()) &&
      (await page.locator("[data-score]").count()) === 0,
    "a boundary with only one eligible member stays waiting without zero scores",
  );
  await clock("2026-11-24T09:00:00Z");
  const late = await command(config.other, "join", { token: waiting.token });
  check(
    late.ok && late.eligibleRound === "2026-11-30",
    "waiting-group late join is eligible only at the next boundary",
  );
  await sync();
  check(
    await button("Check in: Waiting together").isDisabled(),
    "two accepted members do not activate an already-started waiting slot",
  );
  await page.keyboard.press("Escape");
  await button("Open Training days").click();
  check(
    (await button("Check in: Training days").isDisabled()) &&
      (await page.getByLabel(/2026-11-24: rest/).count()) === 2,
    "Custom specific weekdays show rest days and block check-ins",
  );
  await clock("2026-11-25T09:00:00Z");
  await sync();
  await button("Check in: Training days").click();
  await page.waitForFunction(
    (id) =>
      window.sharedUi
        .snapshot()
        .cache.snapshot.scores.some(
          (s) => s.groupId === id && s.completedDays === 1,
        ),
    days.id,
  );
  check(
    (await page.locator('[data-percent="50"]').count()) === 1,
    "Custom weekdays use the shared two-day denominator from SQL",
  );
  await page.keyboard.press("Escape");
  await button("Open Read together").click();
  await button("Check in: Read together").click();
  await page.waitForFunction(
    (id) =>
      window.sharedUi
        .snapshot()
        .cache.snapshot.scores.some(
          (s) => s.groupId === id && s.adherencePct === 100,
        ),
    weekly.id,
  );
  check(
    (await page
      .locator('[data-percent="100"] .shared-score-bar i:not(.low)')
      .count()) === 1,
    "N-per-week capped SQL adherence uses the >=70 accent bar",
  );
  await page.keyboard.press("Escape");
  await button("Open Daily walk").click();
  await button("Check in: Daily walk").click();
  await page.waitForFunction(
    (id) =>
      window.sharedUi
        .snapshot()
        .cache.snapshot.scores.some(
          (s) => s.groupId === id && s.completedDays === 1,
        ),
    every.id,
  );
  check(
    (await page.locator("[data-score] .counts").first().innerText()) ===
      "1 of 7 days",
    "Every-day Custom keeps a shared seven-day target",
  );
  await button("Invite people").click();
  await heading("Invite people").waitFor();
  await page.keyboard.press("Escape");
  await heading("Daily walk").waitFor();
  await page.waitForFunction(
    (id) => document.activeElement?.id === `shared-invite-${id}`,
    every.id,
  );
  check(
    true,
    "returning from invitations restores focus to the mounted detail opener",
  );
  const shots = [];
  const folder = path.join(root, "tmp/shared-goals-runtime/step4-shots");
  await mkdir(folder, { recursive: true });
  for (const theme of ["default", "midnight", "ember", "light"]) {
    await page.evaluate((t) => window.sharedUi.theme(t), theme);
    for (const width of [1440, 1280, 1100]) {
      await page.setViewportSize({ width, height: 960 });
      for (const screen of ["detail", "overview"]) {
        if (screen === "overview") await button("← Shared").click();
        await page.locator(".gscroll").evaluate((el) => {
          el.scrollTop = 0;
        });
        await page.evaluate(() => document.fonts.ready);
        check(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${theme} ${width} ${screen} has no page overflow`,
        );
        const file = path.join(folder, `${theme}-${width}-${screen}.png`);
        await page.screenshot({ path: file });
        shots.push(file);
      }
      await button("Open Daily walk").click();
    }
  }
  await page.evaluate(() => window.sharedUi.theme("default"));
  await page.setViewportSize({ width: 1440, height: 960 });
  await button("Manage").click();
  await page
    .getByRole("radio", { name: "Transfer ownership", exact: true })
    .check();
  await page
    .getByLabel("New owner", { exact: true })
    .selectOption(config.other);
  await button("Confirm transfer").click();
  await modal.waitFor({ state: "hidden" });
  check(
    await page.evaluate(
      (id) =>
        window.sharedUi
          .snapshot()
          .cache.snapshot.groups.find((g) => g.id === id).ownerId !==
        window.sharedUi.snapshot().userId,
      every.id,
    ),
    "real-pointer ownership transfer changes the confirmed owner while retaining membership",
  );
  await button("Manage").click();
  check(
    (await page
      .getByRole("radio", { name: "Archive group", exact: true })
      .count()) === 0,
    "former owner immediately loses owner controls",
  );
  await page.keyboard.press("Escape");
  // Own pending intent remains reviewable after a different device leaves.
  await context.setOffline(true);
  await button("Undo check-in: Daily walk").click();
  await page.waitForFunction(
    () => window.sharedUi.snapshot().outbox.length === 1,
  );
  // The page is offline, so perform the other-device leave through a fresh SDK context.
  const accessContext = await context.browser().newContext();
  await accessContext.route("**/*", (r) =>
    ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
  const accessPage = await accessContext.newPage();
  await accessPage.goto(url);
  await accessPage.waitForFunction(() => !!window.sharedUi);
  const left = await accessPage.evaluate(
    ({ id, gid }) => window.sharedUi.commandAs(id, "leave", { group_id: gid }),
    { id: config.owner, gid: every.id },
  );
  check(
    left.ok,
    "another real SDK device leaves while an offline check-in is pending",
  );
  await accessContext.close();
  await context.setOffline(false);
  await sync();
  await heading("Group unavailable").waitFor();
  check(
    (await page.locator("[data-score]").count()) === 0 &&
      (await page.getByText("Daily walk", { exact: true }).count()) === 0,
    "access revocation removes group details and scores from the mounted panel",
  );
  await button("Discard rejected change").click();
  await page.waitForFunction(
    () => window.sharedUi.snapshot().outbox.length === 0,
  );
  check(true, "own rejected offline intent can be discarded after access loss");
  await page.evaluate((id) => window.sharedUi.setActor(id), config.third);
  await page.evaluate(
    (id) => window.sharedUi.route(`facta://group/${id}`),
    days.id,
  );
  await heading("Group unavailable").waitFor();
  check(
    (await page.locator("[data-score]").count()) === 0,
    "account switch and strict group route reveal no previous-account scores",
  );
  await page.evaluate((id) => window.sharedUi.setActor(id), config.owner);
  await clock("2026-11-30T09:00:00Z");
  await sync();
  await button("Open Waiting together").click();
  check(
    (await page.locator('[data-round="2026-11-30"]').count()) === 2 &&
      (await page.locator('[data-round="2026-11-23"]').count()) === 0,
    "activation at the later eligible boundary produces no scored waiting interval",
  );
  await button("Manage").click();
  await page
    .getByLabel("New owner", { exact: true })
    .selectOption(config.other);
  await button("Confirm leave").click();
  await heading("Goals").waitFor();
  check(
    await page.evaluate(
      (id) =>
        !window.sharedUi
          .snapshot()
          .cache.snapshot.groups.some((g) => g.id === id),
      waiting.id,
    ),
    "owner transfer-and-leave is confirmed atomically and purges the departed group",
  );
  // A fresh device starts with a bounded recent-history window, then requests
  // the earlier interval through the actual page control and remote adapter.
  await clock("2027-02-15T09:00:00Z");
  const historyContext = await context.browser().newContext();
  await historyContext.route("**/*", (r) =>
    ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
  const historyPage = await historyContext.newPage();
  await historyPage.goto(url);
  await historyPage.waitForFunction(() => !!window.sharedUi);
  await historyPage.evaluate(() => window.sharedUi.now("2027-02-15T09:00:00Z"));
  await historyPage.evaluate(
    (id) => window.sharedUi.setActor(id),
    config.owner,
  );
  await historyPage
    .getByRole("button", { name: "Open Training days", exact: true })
    .click();
  check(
    await historyPage.evaluate(
      (id) =>
        !window.sharedUi
          .snapshot()
          .cache.snapshot.rounds.some(
            (r) => r.groupId === id && r.roundStart === "2026-11-23",
          ),
      days.id,
    ),
    "fresh device starts without the older round outside its requested interval",
  );
  await historyPage
    .getByRole("button", { name: "Load older rounds", exact: true })
    .click();
  await historyPage.getByLabel("Displayed round").selectOption("2026-11-23");
  check(
    (await historyPage.locator('[data-round="2026-11-23"]').count()) === 2 &&
      (await historyPage.locator('[data-percent="50"]').count()) === 1,
    "history pagination loads the earlier real SQL roster and scores without recomputation",
  );
  await historyContext.close();
  return {
    ok: true,
    assertions,
    screenshots: shots,
    checks: [
      "real-pointer detail navigation, focus restoration, modal/text keyboard scope, check-in/undo and SQL score parity",
      "Gym pending target/cancellation, Custom every/specific/N schedules, rest/future/inactive days",
      "offline pending/conflict explicit retry, pause/resume, archival, next-boundary activation and history pagination",
      "ownership transfer/leave, access loss with discarded own intent, account-isolated strict routing",
      "overview/detail captures and no page overflow in all four themes at 1440/1280/1100",
    ],
  };
}
