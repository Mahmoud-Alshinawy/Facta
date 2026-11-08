// A device clock ahead of the server, on the full production App: real account
// engines/IndexedDB/SDK/disposable SQL with the new migration; synthetic identity.
// Tests run the app and server on one clock, so the page clock is moved apart.
const SERVER = "2026-10-27T12:00:00Z";
const at = (seconds) =>
  new Date(Date.parse(SERVER) + seconds * 1000).toISOString();

export async function runCheckinSkewTests({ page, url, fixture }) {
  const config = await fetch(`${fixture}/test/config`).then((r) => r.json());
  let assertions = 0;
  const check = (ok, label) => {
    if (!ok) throw Error(label);
    assertions++;
  };
  const serverClock = async (now) => {
    const response = await fetch(`${fixture}/test/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clock", now }),
    });
    if (!response.ok) throw Error("Disposable clock failed");
  };
  const deviceClock = (now) => page.clock.setFixedTime(new Date(now));
  const sync = () => page.evaluate(() => window.acceptance.sync());
  const snapshot = () => page.evaluate(() => window.acceptance.snapshot());
  const today = page.locator('[data-progress-surface="today"]');
  const button = (name) => today.getByRole("button", { name, exact: true });
  // The shared goal is a row on Today: its checkbox, then its state text.
  const checkButton = today.getByRole("checkbox").first();
  const shareRow = today.locator("li").first();
  // The click queues asynchronously, so wait on the confirmed row itself.
  const confirmed = async (completed) => {
    try {
      await page.waitForFunction(
        ({ owner, completed }) => {
          const s = window.acceptance.snapshot();
          return (
            s.outbox.length === 0 &&
            s.cache.snapshot.checkins.some(
              (c) =>
                c.checkinDate === "2026-10-27" &&
                c.completed === completed &&
                s.cache.snapshot.memberships.some(
                  (m) => m.id === c.membershipId && m.userId === owner,
                ),
            )
          );
        },
        { owner: config.owner, completed },
        { timeout: 10_000 },
      );
    } catch {
      const s = await snapshot();
      throw Error(
        `Never confirmed completed=${completed}: ${JSON.stringify(s.outbox.map((e) => [e.phase, e.failure]))}`,
      );
    }
  };
  // The state the row shows, in the words the old button used.
  const label = async () => {
    const checked = (await checkButton.getAttribute("aria-checked")) === "true",
      text = await shareRow.innerText();
    return text.includes("Not saved")
      ? "Not saved"
      : text.includes("Not synced yet")
        ? checked
          ? "Pending check-in"
          : "Pending undo"
        : checked
          ? "Checked in"
          : "Check in";
  };
  // Hold every snapshot read that follows a check-in reply, so the button's
  // state between the reply and the next read can be seen.
  let armed = false;
  let gate = null;
  let release = () => {};
  let held = 0;
  await page.route("**/rpc/facta_shared_command", (route) => {
    if (armed) gate ??= new Promise((r) => (release = r));
    return route.fallback();
  });
  await page.route("**/rpc/facta_shared_snapshot", async (route) => {
    if (gate) {
      held++;
      await gate;
    }
    return route.fallback();
  });
  // Every state and row size the check-in shows, from the click onwards.
  const watchButton = () =>
    page.evaluate(() => {
      const row = document.querySelector('[data-progress-surface="today"] li');
      const box = row.querySelector('[role="checkbox"]');
      const seen = (window.__checkinSeen = []);
      const record = () => {
        const { width, height } = row.getBoundingClientRect();
        const checked = box.getAttribute("aria-checked") === "true",
          t = row.innerText;
        const text = t.includes("Not saved")
          ? "Not saved"
          : t.includes("Not synced yet")
            ? checked
              ? "Pending check-in"
              : "Pending undo"
            : checked
              ? "Checked in"
              : "Check in";
        if (seen.at(-1)?.text !== text) seen.push({ text, width, height });
      };
      record();
      window.__checkinObserver?.disconnect();
      window.__checkinObserver = new MutationObserver(record);
      window.__checkinObserver.observe(row, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    });
  const seen = () => page.evaluate(() => window.__checkinSeen);
  const sizes = new Set();
  // Click, hold the read after the reply, and see the final label while held.
  const heldClick = async (from, pending, done) => {
    await watchButton();
    held = 0;
    armed = true;
    await checkButton.click();
    await page.waitForFunction(
      () => window.acceptance.snapshot().outbox.length === 0,
    );
    const deadline = Date.now() + 10_000;
    while (!held && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 20));
    check(held > 0, `the read after the ${done} reply is held`);
    check(
      (await label()).trim() === done,
      `"${done}" shows before the next read`,
    );
    armed = false;
    gate = null;
    release();
    await confirmed(done === "Checked in");
    const labels = (await seen()).map((x) => x.text);
    check(
      JSON.stringify(labels) === JSON.stringify([from, pending, done]),
      `${from} → ${pending} → ${done} without a step back: ${JSON.stringify(labels)}`,
    );
    for (const x of await seen()) sizes.add(`${x.width}x${x.height}`);
  };
  const stored = async () => {
    const s = await snapshot();
    return s.cache.snapshot.checkins.find(
      (c) =>
        c.checkinDate === "2026-10-27" &&
        s.cache.snapshot.memberships.some(
          (m) => m.id === c.membershipId && m.userId === config.owner,
        ),
    );
  };

  await serverClock(SERVER);
  await page.clock.install({ time: new Date(SERVER) });
  await deviceClock(at(0));
  await page.goto(url);
  await page.waitForFunction(() => !!window.acceptance);
  await page.evaluate((id) => window.acceptance.actor(id), config.owner);
  await sync();
  await checkButton.waitFor();

  // The owner's real failure: a normal check-in, undo, check-in with the device
  // clock 2 seconds ahead of the database, which never moves past the stamps.
  await deviceClock(at(2));
  await heldClick("Check in", "Pending check-in", "Checked in");
  check(
    (await stored())?.completed === true,
    "check-in ahead of the server saved",
  );
  await heldClick("Checked in", "Pending undo", "Check in");
  check(
    (await stored())?.completed === false,
    "undo ahead of the server saved",
  );
  await checkButton.click();
  await confirmed(true);
  // The reply alone already shows the row; read the stored capture time.
  await sync();
  const saved = await stored();
  check(saved?.completed === true, "check-in again ends checked in");
  check(saved?.revision === 3, "all three clicks reached the server");
  check(
    Date.parse(saved.capturedAt) <= Date.parse(SERVER),
    "the stored capture is clamped to the server time",
  );
  check((await label()).trim() === "Checked in", "no stuck pending state");
  check(
    (await today.getByText("wasn't saved", { exact: false }).count()) === 0,
    "no failure message after clock skew",
  );

  // Beyond the tolerance: a plain message and a fix right on Today.
  await deviceClock(at(360));
  await checkButton.click();
  await today
    .getByText("Your device's clock or date doesn't match the server", {
      exact: false,
    })
    .waitFor();
  check(
    (await label()).trim() === "Not saved",
    "the button says it was not saved",
  );
  {
    const { width, height } = await shareRow.boundingBox();
    sizes.add(`${width}x${height}`);
  }
  check(
    (await today.getByText("invalid", { exact: false }).count()) === 0 &&
      (await today.getByText("Rejected", { exact: false }).count()) === 0,
    "the message has no internal wording",
  );
  check(
    (await today.getByText("Pending", { exact: false }).count()) === 0,
    "a rejected change does not read as pending",
  );
  const toasts = () =>
    page.getByText("A check-in wasn't saved", { exact: true }).count();
  await page.getByText("A check-in wasn't saved", { exact: true }).waitFor();
  for (let n = 0; n < 3; n++) await sync();
  check((await toasts()) === 1, "repeated syncs keep a single toast");
  await page
    .getByText("A check-in wasn't saved", { exact: true })
    .waitFor({ state: "hidden" });
  for (let n = 0; n < 2; n++) await sync();
  check(
    (await toasts()) === 0,
    "a faded toast does not come back on later syncs",
  );
  check(
    (await snapshot()).cache.snapshot.checkins.some(
      (c) => c.checkinDate === "2026-10-27" && c.completed,
    ),
    "the confirmed state is unchanged by the rejected undo",
  );

  for (const [theme, name] of [
    ["default", "Black and green"],
    ["light", "Light"],
  ]) {
    await page
      .getByRole("button", { name: `${name} theme`, exact: true })
      .click();
    await today.screenshot({
      path: `tmp/shared-goals-runtime/not-saved-${theme}.png`,
      animations: "disabled",
    });
  }

  // Discard clears it from Today.
  await button("Discard").click();
  await confirmed(true);
  await sync();
  check((await button("Discard").count()) === 0, "Discard removes the row");
  check(
    (await label()).trim() === "Checked in",
    "Discard returns to the confirmed state",
  );

  // Try again succeeds once the server has caught up with the stamp.
  await checkButton.click();
  await button("Try again").waitFor();
  await serverClock(at(361));
  await button("Try again").click();
  await confirmed(false);
  await sync();
  check((await button("Try again").count()) === 0, "Try again removes the row");
  check((await stored())?.completed === false, "Try again saved the change");
  check(
    (await label()).trim() === "Check in",
    "Try again ends in the saved state",
  );

  // The owner's case: the clock ran more than 5 minutes ahead, the change was
  // refused, and the clock was then set right before Try again.
  await deviceClock(at(361 + 400));
  await checkButton.click();
  await button("Try again").waitFor();
  check((await label()).trim() === "Not saved", "far ahead is not saved");
  await serverClock(at(365));
  await deviceClock(at(365));
  await button("Try again").click();
  await confirmed(true);
  await sync();
  check(
    (await button("Try again").count()) === 0,
    "Try again after setting the clock right saves the change",
  );
  check(
    (await today.getByText("incompatible", { exact: false }).count()) === 0,
    "no incompatible-data message",
  );
  check(
    Date.parse((await stored()).capturedAt) <= Date.parse(at(365)),
    "the retried check-in carries the corrected time",
  );
  check((await label()).trim() === "Checked in", "ends checked in");

  // One shape in every state, in both themes.
  for (const [theme, name] of [
    ["light", "Light"],
    ["default", "Black and green"],
  ]) {
    await page
      .getByRole("button", { name: `${name} theme`, exact: true })
      .click();
    for (const state of ["checked", "unchecked"]) {
      if (state === "unchecked") {
        await checkButton.click();
        await confirmed(false);
      } else if ((await label()).trim() !== "Checked in") {
        await checkButton.click();
        await confirmed(true);
      }
      await sync();
      const { width, height } = await shareRow.boundingBox();
      sizes.add(`${width}x${height}`);
      await today.screenshot({
        path: `tmp/shared-goals-runtime/checkin-${state}-${theme}.png`,
        animations: "disabled",
      });
    }
  }
  check(
    sizes.size === 1,
    `the shared row keeps one size in every state: ${[...sizes].join(", ")}`,
  );

  // The same shared goal elsewhere: Goals > Mine, the calendar, the agenda.
  const nav = (name) =>
    page
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name, exact: true })
      .click();
  const shared = /^(Check in|Undo check-in): Client integration$/;
  await nav("Goals");
  const mine = page
    .getByRole("option")
    .filter({ hasText: "Client integration" });
  await mine.first().waitFor();
  check(
    (await mine.count()) === 2 &&
      (await mine.nth(0).innerText()).includes("Shared") &&
      (await mine.nth(1).innerText()).includes("Shared") &&
      (await page.getByRole("checkbox", { name: shared }).count()) === 1,
    "Goals > Mine lists the shared goal for today and as a recurring row, tagged Shared",
  );
  // Like the personal edit button, it shows on hover.
  await mine.nth(1).hover();
  await mine
    .nth(1)
    .getByRole("button", { name: "Open group Client integration" })
    .click();
  await page
    .getByRole("heading", { name: "Client integration", exact: true })
    .waitFor();
  check(true, "the Mine row opens the group, not the personal edit dialog");
  await nav("Calendar");
  await page.getByRole("checkbox", { name: shared }).first().waitFor();
  check(
    (await page.getByRole("checkbox", { name: shared }).count()) >= 1,
    "the week view shows today's shared goal, checkable",
  );
  await page.getByRole("radio", { name: /^Agenda/ }).click();
  const agendaRow = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("checkbox", { name: shared }) });
  await agendaRow.first().waitFor();
  check(
    (await agendaRow.first().innerText()).includes("Shared goal"),
    "the agenda lists today's shared goal as a shared goal",
  );
  await page.getByRole("radio", { name: /^Week/ }).click();
  await nav("Today");
  await checkButton.waitFor();

  // Network gone: one calm message over repeated failed retries, then recovery.
  const paused = () =>
    page.getByText("Shared goals paused", { exact: true }).count();
  await page.context().setOffline(true);
  await sync();
  await page.getByText("Shared goals paused", { exact: true }).waitFor();
  for (let n = 0; n < 3; n++) await sync();
  check((await paused()) === 1, "repeated offline retries keep a single toast");
  check(
    (await page.getByText("Shared goals need attention").count()) === 0,
    "being offline is not shown as an error",
  );
  await page
    .getByText("Shared goals paused", { exact: true })
    .waitFor({ state: "hidden" });
  for (let n = 0; n < 2; n++) await sync();
  check((await paused()) === 0, "further offline retries do not bring it back");
  await page.context().setOffline(false);
  await sync();
  check((await paused()) === 0, "recovery shows nothing further");
  check(
    (await today.getByText("could not connect", { exact: false }).count()) ===
      0,
    "the connection message clears on recovery",
  );
  return {
    ok: true,
    assertions,
    checks: [
      "check in, undo, check in with the device 2 s ahead: all saved, clamped, no stuck state",
      "6 min ahead: plain not-saved state on Today, one toast across syncs, nothing pending",
      "Discard and Try again both work from Today",
      "the label goes straight from Pending to Checked in (and back for undo) while the next read is held",
      "Try again after the clock is set right re-stamps and saves",
      "the shared row keeps one size in every state, screenshots in both themes",
      "Goals > Mine, week view and agenda show the shared goal; the Mine row opens the group",
      "offline: one calm toast over repeated retries, no return after fading, clears on recovery",
    ],
  };
}
