// Actual mounted wizard + native IndexedDB + disposable SQL receipt recovery.
export async function runDraftRecoveryTests({ page, url, fixture }) {
  const config = await fetch(`${fixture}/test/config`).then((r) => r.json());
  const control = (action, extra = {}) =>
    fetch(`${fixture}/test/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    }).then((r) => {
      if (!r.ok) throw new Error("Disposable fixture control failed");
      return r.json();
    });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const heading = (name) => page.getByRole("heading", { name, exact: true });
  const metrics = () => fetch(`${fixture}/test/metrics`).then((r) => r.json());
  const commandStart = (await metrics()).commands.length;
  let assertions = 0;
  const check = (value, label) => {
    if (!value) throw new Error(label);
    assertions++;
  };
  await page.goto(url);
  await page.waitForFunction(() => !!window.sharedUi);
  await page.evaluate((id) => window.sharedUi.setActor(id), config.owner);
  await control("clock", { now: "2026-10-21T09:00:00Z" });
  await page.evaluate(() => window.sharedUi.now("2026-10-21T09:00:00Z"));
  const name = "Mounted receipt recovery";
  await heading("Goals").waitFor();
  await page.keyboard.press("Shift+N");
  await heading("New shared goal").waitFor();
  await button("Next").click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await control("drop_command");
  await button("Next").click();
  await button("Retry same request").waitFor();
  const alias = await page.evaluate(
    (name) =>
      window.sharedUi.snapshot().drafts.find((d) => d.fields.name === name).id,
    name,
  );
  await button("Retry same request").click();
  await page.waitForFunction(() => window.sharedUi.pending().length === 0);
  await button("Next").click();
  await heading("People").waitFor();
  check(
    await page.evaluate(
      (alias) => !window.sharedUi.snapshot().drafts.some((d) => d.id === alias),
      alias,
    ),
    "consuming the mounted create receipt reconciles the old alias again",
  );
  await button("Next").click();
  await heading("Review your goal").waitFor();
  await button("Create goal").click();
  await heading(name).waitFor();
  const state = await page.evaluate(() => window.sharedUi.snapshot());
  check(
    state.cache.snapshot.groups.filter((g) => g.name === name).length === 1,
    "mounted recovery publishes exactly one server group",
  );
  check(
    !state.drafts.some((d) => d.id === alias || d.fields.name === name),
    "mounted recovery through publication leaves no local alias",
  );
  await button("Back to Shared").click();
  const closeName = "Close receipt recovery";
  const editedName = "Edited recovered draft";
  await page.keyboard.press("Shift+N");
  await heading("New shared goal").waitFor();
  await button("Next").click();
  await page.getByLabel("Name", { exact: true }).fill(closeName);
  await control("drop_command");
  await button("Next").click();
  await button("Retry same request").waitFor();
  const closeAlias = await page.evaluate(
    (name) =>
      window.sharedUi.snapshot().drafts.find((d) => d.fields.name === name).id,
    closeName,
  );
  await button("Retry same request").click();
  await page.waitForFunction(() => window.sharedUi.pending().length === 0);
  await page.getByLabel("Name", { exact: true }).fill(editedName);
  await page.waitForFunction(
    (name) =>
      window.sharedUi.snapshot().drafts.some((d) => d.fields.name === name),
    editedName,
  );
  check(
    await page.evaluate(
      (alias) => !window.sharedUi.snapshot().drafts.some((d) => d.id === alias),
      closeAlias,
    ),
    "autosave after recovered creation cannot recreate its old alias",
  );
  await button("Cancel Esc").click();
  await heading("Goals").waitFor();
  await page
    .locator(".shared-person")
    .filter({ hasText: closeName })
    .getByRole("button", { name: "Resume draft", exact: true })
    .click();
  await heading("People").waitFor();
  await button("Back").click();
  check(
    (await page.getByLabel("Name", { exact: true }).inputValue()) ===
      editedName,
    "closing and resuming recovered creation preserves the latest saved fields",
  );
  await button("Next").click();
  await heading("People").waitFor();
  await button("Next").click();
  await button("Create goal").click();
  await heading(editedName).waitFor();
  check(
    await page.evaluate(
      ({ alias, names }) => {
        const state = window.sharedUi.snapshot();
        return (
          state.cache.snapshot.groups.filter((g) => names.includes(g.name))
            .length === 1 &&
          !state.drafts.some(
            (d) => d.id === alias || names.includes(d.fields.name),
          )
        );
      },
      { alias: closeAlias, names: [closeName, editedName] },
    ),
    "close/resume publishes one server group and leaves no local alias",
  );
  await button("Back to Shared").click();
  const publicationName = "Close recovered publication";
  await page.keyboard.press("Shift+N");
  await heading("New shared goal").waitFor();
  await button("Next").click();
  await page.getByLabel("Name", { exact: true }).fill(publicationName);
  await page.waitForFunction(
    (name) =>
      window.sharedUi.snapshot().drafts.some((d) => d.fields.name === name),
    publicationName,
  );
  const publicationAlias = await page.evaluate(
    (name) =>
      window.sharedUi.snapshot().drafts.find((d) => d.fields.name === name).id,
    publicationName,
  );
  await button("Next").click();
  await heading("People").waitFor();
  await button("Next").click();
  await heading("Review your goal").waitFor();
  await control("drop_command");
  await button("Create goal").click();
  await button("Retry same request").waitFor();
  // Hold the refresh, so cleanup cannot accidentally rely on a newer cached
  // publishedAt value. Close while the wizard still displays its old snapshot.
  await control("hold_snapshot");
  try {
    await button("Retry same request").click();
    await page.waitForFunction(() => window.sharedUi.pending().length === 0);
    check(
      await page.evaluate(
        (name) =>
          window.sharedUi
            .snapshot()
            .cache.snapshot.groups.find((g) => g.name === name).publishedAt ===
          null,
        publicationName,
      ),
      "recovered publication is fenced before the confirmed snapshot refresh",
    );
    await button("Cancel Esc").click();
    await heading("Goals").waitFor();
    check(
      await page.evaluate(
        ({ alias, name }) =>
          !window.sharedUi
            .snapshot()
            .drafts.some((d) => d.id === alias || d.fields.name === name),
        { alias: publicationAlias, name: publicationName },
      ),
      "closing after recovered publication cannot resurrect the completed draft",
    );
  } finally {
    await control("release");
  }
  await page.waitForFunction(
    (name) =>
      !!window.sharedUi
        .snapshot()
        .cache.snapshot.groups.find((g) => g.name === name).publishedAt,
    publicationName,
  );
  check(
    (await page
      .locator(".shared-person")
      .filter({ hasText: publicationName })
      .getByRole("button", { name: "Resume draft", exact: true })
      .count()) === 0,
    "completed recovery offers no stale Resume draft action",
  );
  await page.evaluate((id) => window.sharedUi.setActor(id), config.owner);
  await heading("Goals").waitFor();
  const persisted = await page.evaluate(() => window.sharedUi.snapshot());
  check(
    persisted.cache.snapshot.groups.filter((g) =>
      [name, editedName, publicationName].includes(g.name),
    ).length === 3,
    "each recovery path leaves exactly one server group after store reopen",
  );
  check(
    persisted.drafts.length === 0,
    "real IndexedDB reopen retains no local alias or completed draft",
  );
  const creates = (await metrics()).commands
    .slice(commandStart)
    .filter((c) => c.actor === config.owner && c.operation === "create_draft");
  check(
    creates.length === 5 && new Set(creates.map((c) => c.commandId)).size === 3,
    "two lost-create retries retain UUIDs; the three wizards create only three groups",
  );
  return {
    ok: true,
    assertions,
    checks: [
      "mounted create receipt recovery through publication has one group and no local alias",
      "autosave, close/resume and edited fields remain bound to one recovered server draft",
      "closing recovered publication before snapshot refresh cannot resurrect a completed draft",
      "native IndexedDB reopen preserves cleanup and immutable creation retry identities",
    ],
  };
}
