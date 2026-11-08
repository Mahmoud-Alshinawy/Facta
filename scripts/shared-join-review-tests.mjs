// Invitation wording on the full production App: an existing member, a member
// who starts with the first round, and a later joiner.
// Real account engines/IndexedDB/SDK/disposable SQL; synthetic identity only.
export async function runJoinReviewTests({ page, url, fixture }) {
  const config = await fetch(`${fixture}/test/config`).then((r) => r.json());
  let assertions = 0;
  const check = (ok, label) => {
    if (!ok) throw Error(label);
    assertions++;
  };
  const clock = async (now) => {
    const response = await fetch(`${fixture}/test/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clock", now }),
    });
    if (!response.ok) throw Error("Disposable clock failed");
    await page.clock.setFixedTime(new Date(now));
  };
  const joins = async () =>
    (
      await fetch(`${fixture}/test/metrics`).then((r) => r.json())
    ).commands.filter((c) => c.operation === "join").length;
  const button = (name) => page.getByRole("button", { name, exact: true });
  const text = (value) => page.getByText(value, { exact: false });
  const actor = async (id) => {
    await page.evaluate((id) => window.acceptance.actor(id), id);
    await page.evaluate(() => window.acceptance.sync());
  };
  const route = (link) =>
    page.evaluate((link) => window.acceptance.route(link), link);
  const command = (id, op, payload) =>
    page.evaluate(
      ({ id, op, payload }) => window.acceptance.command(id, op, payload),
      { id, op, payload },
    );

  await page.clock.install({ time: new Date("2026-10-14T09:00:00Z") });
  await page.goto(url);
  await page.waitForFunction(() => !!window.acceptance);
  await clock("2026-10-14T09:00:00Z");
  const draft = await command(config.owner, "create_draft", {
    name: "Join review",
    template: "gym",
    schedule_kind: "n",
    target: 2,
    time_zone: "Asia/Riyadh",
    round_weekday: 1,
  });
  check(draft.ok, "create the group");
  check(
    (
      await command(config.owner, "publish", {
        group_id: draft.groupId,
        expected_revision: 1,
        first_round_date: "2026-10-19",
      })
    ).ok,
    "publish the group",
  );
  const invite = await command(config.owner, "issue_link", {
    group_id: draft.groupId,
  });
  check(invite.ok && invite.token, "issue an invitation link");
  const link = `facta://join/${invite.token}`;

  // The owner opens their own link.
  await actor(config.owner);
  const before = await joins();
  await route(link);
  await page
    .getByRole("heading", { name: "You're already in Join review" })
    .waitFor();
  check(
    (await button("Join Join review").count()) === 0,
    "an existing member gets no Join button",
  );
  check(
    (await page.getByText("Your days per week", { exact: true }).count()) === 0,
    "an existing member gets no target picker",
  );
  check(
    (await text("invited you to").count()) === 0,
    "an existing member is not told they were invited",
  );
  await button("Open group").click();
  await page
    .getByRole("heading", { name: "Join review", exact: true })
    .waitFor();
  check((await joins()) === before, "opening the group sends no join command");

  // Joining before the first round starts means starting with it.
  await actor(config.third);
  await route(link);
  await button("Join Join review").click();
  await text("You start with the first round on Mon 19 Oct 2026.").waitFor();
  check(
    (await text("You start the week of").count()) === 0,
    "an early joiner is not told about a later boundary",
  );
  await route(`facta://group/${draft.groupId}`);
  await text(
    "That is the group's first round, so you start with it.",
  ).waitFor();
  check(
    (await text("earlier days don't count against you").count()) === 0,
    "group detail does not read as if the early joiner were late",
  );

  // A later joiner keeps the next-round wording.
  await clock("2026-10-20T09:00:00Z");
  await actor(config.other);
  await route(link);
  await button("Join Join review").click();
  await text("You start the week of Mon 26 Oct 2026.").waitFor();
  check(
    (await text("You start with the first round").count()) === 0,
    "a later joiner is told about the next round",
  );
  await route(`facta://group/${draft.groupId}`);
  await text("earlier days don't count against you").waitFor();
  check(
    (await text("That is the group's first round").count()) === 0,
    "group detail keeps the later-joiner wording",
  );
  return {
    ok: true,
    assertions,
    checks: [
      "own invitation link: already-a-member screen, no Join or target picker, Open group, no join command",
      "joined before the first round: first-round wording on the result and detail",
      "joined after the first round: next-round wording on the result and detail",
    ],
  };
}
