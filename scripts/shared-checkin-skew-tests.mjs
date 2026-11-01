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
  const checkButton = today.locator(".shared-check-action button");
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
  const label = () => checkButton.innerText();
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
  await button("Open group").waitFor();

  // The owner's real failure: a normal check-in, undo, check-in with the device
  // clock 2 seconds ahead of the database, which never moves past the stamps.
  await deviceClock(at(2));
  await checkButton.click();
  await confirmed(true);
  check(
    (await stored())?.completed === true,
    "check-in ahead of the server saved",
  );
  await checkButton.click();
  await confirmed(false);
  check(
    (await stored())?.completed === false,
    "undo ahead of the server saved",
  );
  await checkButton.click();
  await confirmed(true);
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
      "offline: one calm toast over repeated retries, no return after fading, clears on recovery",
    ],
  };
}
