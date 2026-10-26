// Review regressions use production mounted components, native IndexedDB,
// the real SDK adapter and SQL RPCs in the runner's disposable database.
export async function runSharedStep4ReviewTests({
  page,
  context,
  url,
  fixture,
}) {
  const config = await fetch(`${fixture}/test/config`).then((r) => r.json());
  let assertions = 0;
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    assertions++;
  };
  const clock = async (at) => {
    await fetch(`${fixture}/test/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clock", now: at }),
    });
    await page.evaluate((at) => window.sharedUi.now(at), at);
  };
  await page.goto(url);
  await page.waitForFunction(() => !!window.sharedUi);
  const command = (actor, operation, payload) =>
    page.evaluate(
      ({ actor, operation, payload }) =>
        window.sharedUi.commandAs(actor, operation, payload),
      { actor, operation, payload },
    );
  await clock("2026-10-14T09:00:00Z");
  const create = async (name, peer = false) => {
    const draft = await command(config.owner, "create_draft", {
      name,
      template: "gym",
      schedule_kind: "n",
      target: 2,
      time_zone: "Asia/Riyadh",
      round_weekday: 1,
    });
    check(draft.ok, `create ${name}`);
    const publish = await command(config.owner, "publish", {
      group_id: draft.groupId,
      expected_revision: 1,
      first_round_date: "2026-10-19",
    });
    check(publish.ok, `publish ${name}`);
    if (peer) {
      const link = await command(config.owner, "issue_link", {
        group_id: draft.groupId,
      });
      const join = await command(config.other, "join", {
        token: link.token,
        target: 2,
      });
      check(join.ok, `join ${name}`);
    }
    return draft.groupId;
  };
  const late = await create("Late target review", true);
  const waiting = await create("Long waiting review");
  const paused = await create("Old paused review", true);
  if (!process.argv.includes("--lifecycle-only")) {
    await clock("2026-10-20T09:00:00Z");
    const invite = await command(config.owner, "issue_link", {
      group_id: late,
    });
    const joined = await command(config.third, "join", {
      token: invite.token,
      target: 2,
    });
    check(
      joined.ok && joined.eligibleRound === "2026-10-26",
      "late joiner starts next round with original target two",
    );
    await page.evaluate((id) => window.sharedUi.setActor(id), config.third);
    await page
      .getByRole("button", { name: "Open Late target review", exact: true })
      .click();
    await page.getByRole("button", { name: "Edit split", exact: true }).click();
    const modal = page.getByRole("dialog");
    await modal
      .getByRole("button", {
        name: "One more day: Your days per week",
        exact: true,
      })
      .click({ clickCount: 2 });
    await modal
      .getByRole("button", { name: "Confirm target change", exact: true })
      .click();
    await modal
      .getByRole("status")
      .filter({ hasText: "Confirmed: 4" })
      .waitFor();
    await modal
      .getByRole("button", { name: "Cancel pending change", exact: true })
      .click();
    await modal
      .getByRole("status")
      .filter({ hasText: /Confirmed: 2|initial target required/ })
      .waitFor();
    check(
      await page.evaluate((gid) => {
        const s = window.sharedUi.snapshot().cache.snapshot;
        const m = s.memberships.find(
          (m) =>
            m.groupId === gid && m.userId === window.sharedUi.snapshot().userId,
        );
        return (
          s.targets.find(
            (t) => t.membershipId === m.id && t.effectiveRound === "2026-10-26",
          )?.target === 2
        );
      }, late),
      "mounted late joiner cancels target four back to original two before first eligibility",
    );
    check(
      (await modal
        .getByRole("button", { name: "Cancel pending change", exact: true })
        .count()) === 0,
      "mounted pending-change control clears after cancellation",
    );
  }
  await clock("2026-10-21T09:00:00Z");
  check(
    (await command(config.other, "leave", { group_id: paused })).ok,
    "old group pauses when its second eligible member leaves",
  );
  await clock("2027-01-18T09:00:00Z");
  const fresh = await context.newPage();
  try {
    await fresh.goto(url);
    await fresh.waitForFunction(() => !!window.sharedUi);
    await fresh.evaluate(() => window.sharedUi.now("2027-01-18T09:00:00Z"));
    await fresh.evaluate((id) => window.sharedUi.setActor(id), config.owner);
    for (const [id, name, phase] of [
      [waiting, "Long waiting review", "Waiting"],
      [paused, "Old paused review", "Paused"],
    ]) {
      check(
        await fresh.evaluate(
          (gid) =>
            !window.sharedUi
              .snapshot()
              .cache.snapshot.rounds.some((r) => r.groupId === gid),
          id,
        ),
        `${phase} fresh cache contains no scored rounds outside default history window`,
      );
      await fresh
        .getByRole("button", { name: `Open ${name}`, exact: true })
        .click();
      check(
        (await fresh.locator(".shared-status-strip").innerText()).includes(
          phase,
        ),
        `fresh successful read resolves ${phase.toLowerCase()} lifecycle without bounded score history`,
      );
      check(
        (await fresh
          .getByRole("button", { name: `Check in: ${name}`, exact: true })
          .isDisabled()) && (await fresh.locator("[data-score]").count()) === 0,
        `${phase} shows no invented scores or enabled check-in`,
      );
      await fresh
        .getByRole("button", { name: "← Shared", exact: true })
        .click();
    }
  } finally {
    await fresh.close();
  }
  return {
    ok: true,
    assertions,
    checks: [
      "late-join Gym cancellation before first eligibility; fresh-device long waiting versus old paused lifecycle",
    ],
  };
}
