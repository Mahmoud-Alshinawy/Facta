// Full Settings screen, real account engines/IndexedDB/SDK/disposable SQL.
// Synthetic identity only; this is not Auth/JWT/PostgREST acceptance.
export async function runSettingsProgressSelectionTests({
  page,
  url,
  fixture,
}) {
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
  };
  await page.clock.install({ time: new Date("2026-10-27T12:00:00Z") });
  await page.clock.setFixedTime(new Date("2026-10-27T12:00:00Z"));
  await page.goto(url);
  await page.waitForFunction(() => !!window.acceptance);
  const command = (id, op, payload) =>
    page.evaluate(
      ({ id, op, payload }) => window.acceptance.command(id, op, payload),
      { id, op, payload },
    );
  let selected;
  for (let n = 1; n <= 17; n++) {
    // Distinct creation instants make the last group sort after the cap,
    // independently of random UUID ordering. Join before its first round.
    await clock(`2026-10-14T10:${String(n).padStart(2, "0")}:00Z`);
    const draft = await command(config.owner, "create_draft", {
      name: `Preview priority ${n}`,
      template: "gym",
      schedule_kind: "n",
      time_zone: "Asia/Riyadh",
      round_weekday: 1,
      target: 2,
    });
    check(draft.ok, `create authorized group ${n}`);
    check(
      (
        await command(config.owner, "publish", {
          group_id: draft.groupId,
          expected_revision: 1,
          first_round_date: "2026-10-19",
        })
      ).ok,
      `publish group ${n}`,
    );
    const invite = await command(config.owner, "issue_link", {
      group_id: draft.groupId,
    });
    check(invite.ok, `issue group ${n} invitation`);
    check(
      (await command(config.other, "join", { token: invite.token, target: 2 }))
        .ok,
      `second eligible member joins group ${n}`,
    );
    selected = draft;
  }
  await clock("2026-10-27T12:00:00Z");
  for (const date of ["2026-10-26", "2026-10-27"])
    check(
      (
        await command(config.owner, "set_checkin", {
          group_id: selected.groupId,
          membership_id: selected.membershipId,
          date,
          captured_at: `${date}T09:00:00Z`,
          completed: true,
          base_revision: 0,
        })
      ).ok,
      `confirm selected group's ${date} check-in`,
    );
  await page.evaluate((id) => window.acceptance.actor(id), config.owner);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Add widget", exact: true }).click();
  await page.getByRole("radio", { name: "Progress", exact: true }).click();
  const picker = page.getByLabel("New Progress group", { exact: true });
  const options = await picker.locator("option").allTextContents();
  check(
    options.length - 1 > 16 && options.indexOf("Preview priority 17") > 16,
    "selected group is authorized but lies beyond the first 16 choices",
  );
  await picker.selectOption(selected.groupId);
  const preview = page.locator('[data-progress-surface="widget"]');
  check(
    (await preview.innerText()).includes("Preview priority 17 · weekly round"),
    "Settings preview displays the selected group beyond the 16-group export cap",
  );
  check(
    (await preview
      .getByRole("list", { name: "Server-confirmed leaderboard" })
      .count()) === 1,
    "selected group has its confirmed leaderboard",
  );
  const owner = preview.locator(`[data-score="${config.owner}"]`),
    peer = preview.locator(`[data-score="${config.other}"]`);
  check(
    (await owner.innerText()).includes("You") &&
      (await owner.getAttribute("data-percent")) === "100" &&
      (await owner.getAttribute("data-rank")) === "1",
    "selected group shows confirmed self 100%, rank 1",
  );
  check(
    (await peer.innerText()).includes("Client 1") &&
      (await peer.getAttribute("data-percent")) === "0" &&
      (await peer.getAttribute("data-rank")) === "2",
    "selected group shows confirmed peer 0%, rank 2",
  );
  check(
    (await preview.innerText()).includes("Confirmed 2026-10-27 12:00 UTC") &&
      !(await preview.innerText()).includes("Group unavailable"),
    "selected group is confirmed and available",
  );
  await picker.selectOption(config.groupId);
  check(
    (await preview.innerText()).includes("Client integration · weekly round"),
    "explicit selection can return to an earlier group",
  );
  await picker.selectOption(selected.groupId);
  check(
    (await preview.innerText()).includes(
      "Preview priority 17 · weekly round",
    ) && (await preview.locator("[data-score]").count()) === 2,
    "reselecting the late group retains its name and both confirmed rows",
  );
  return {
    ok: true,
    assertions,
    checks: [
      "full Settings: >16 real authorized groups, selected late group name/confirmed ranks and rows, earlier-group selection and reselection",
    ],
    identity: "synthetic local SQL bridge; full Auth/JWT/PostgREST unverified",
  };
}
