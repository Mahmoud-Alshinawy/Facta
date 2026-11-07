import { randomUUID } from "node:crypto";
// A real page reload clears engine/session maps while retaining this native DB.
export async function runDraftReloadTests({
  page,
  url,
  fixture,
  legacy = false,
}) {
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
  const metrics = () => fetch(`${fixture}/test/metrics`).then((r) => r.json());
  const start = (await metrics()).commands.length;
  const button = (name) => page.getByRole("button", { name, exact: true });
  const heading = (name) => page.getByRole("heading", { name, exact: true });
  let assertions = 0;
  const check = (value, label) => {
    if (!value) throw new Error(label);
    assertions++;
  };
  const testUrl = new URL(url);
  testUrl.searchParams.set("database", `facta-shared-ui-${randomUUID()}`);
  await page.goto(testUrl.href);
  await page.waitForFunction(() => !!window.sharedUi);
  await page.evaluate((id) => window.sharedUi.setActor(id), config.owner);
  await control("clock", { now: "2026-10-21T09:00:00Z" });
  await page.evaluate(() => window.sharedUi.now("2026-10-21T09:00:00Z"));
  await heading("Goals").waitFor();
  await page.keyboard.press("Shift+N");
  await heading("New shared goal").waitFor();
  await button("Next").click();
  const originalName = legacy
      ? "Legacy created before read failure"
      : "Created before read failure",
    editedName = legacy
      ? "Legacy edits preserved across restart"
      : "Edits preserved across restart";
  await page.getByLabel("Name", { exact: true }).fill(originalName);
  await page.waitForFunction(
    (name) =>
      window.sharedUi.snapshot().drafts.some((d) => d.fields.name === name),
    originalName,
  );
  const alias = await page.evaluate(
    (name) =>
      window.sharedUi.snapshot().drafts.find((d) => d.fields.name === name).id,
    originalName,
  );
  await control("fail_snapshots");
  try {
    await button("Next").click();
    await page.waitForFunction(
      ({ name, alias }) =>
        window.sharedUi
          .snapshot()
          .drafts.some((d) => d.fields.name === name && d.id !== alias),
      { name: originalName, alias },
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.trim().startsWith("Next") && !b.disabled,
      ),
    );
    const serverId = await page.evaluate(
      (name) =>
        window.sharedUi.snapshot().drafts.find((d) => d.fields.name === name)
          .id,
      originalName,
    );
    check(
      await page.evaluate(
        (id) =>
          !window.sharedUi
            .snapshot()
            .cache.snapshot.groups.some((g) => g.id === id),
        serverId,
      ),
      "confirmed creation survives a following failed snapshot without a cached group",
    );
    await page.getByLabel("Name", { exact: true }).fill(editedName);
    await page.waitForFunction(
      (name) =>
        window.sharedUi.snapshot().drafts.some((d) => d.fields.name === name),
      editedName,
    );
    if (legacy)
      await page.evaluate((id) => window.sharedUi.legacyDraft(id), serverId);
    await page.reload();
    await page.waitForFunction(() => !!window.sharedUi);
    await page.evaluate((id) => window.sharedUi.setActor(id), config.owner);
    await heading("Goals").waitFor();
    const restored = await page.evaluate(
      (name) =>
        window.sharedUi.snapshot().drafts.find((d) => d.fields.name === name),
      editedName,
    );
    check(
      restored.id === serverId,
      "actual page reload retains the original server draft ID in the same IndexedDB",
    );
    const initialCreate = (await metrics()).commands
      .slice(start)
      .find((c) => c.actor === config.owner && c.operation === "create_draft");
    check(
      legacy
        ? !Object.hasOwn(restored, "server")
        : restored.server?.source === "created" &&
            restored.server.groupId === serverId &&
            restored.server.commandId === initialCreate.commandId,
      legacy
        ? "legacy three-field draft remains readable without fabricating provenance"
        : "validated creation provenance survives autosave and actual reload",
    );
    await page
      .locator(".shared-person")
      .filter({ hasText: editedName })
      .getByRole("button", { name: "Resume draft", exact: true })
      .click();
    await heading("New shared goal").waitFor();
    if (!(await page.getByLabel("Name", { exact: true }).count()))
      await button("Next").click();
    check(
      (await page.getByLabel("Name", { exact: true }).inputValue()) ===
        editedName,
      "resume retains edits even though reads still fail and the group is absent from cache",
    );
    await button("Next").click();
    await page
      .locator(".shared-message")
      .filter({
        hasText: "Shared goals are unavailable on this server.",
      })
      .waitFor();
    check(
      (await metrics()).commands
        .slice(start)
        .filter(
          (c) => c.actor === config.owner && c.operation === "create_draft",
        ).length === 1,
      "pressing Next while reads fail never creates a replacement group",
    );
    await control("fail_snapshots", { value: false });
    await button("Next").click();
    await heading("People").waitFor();
    const groups = await page.evaluate(
      (names) =>
        window.sharedUi
          .snapshot()
          .cache.snapshot.groups.filter((g) => names.includes(g.name)),
      [originalName, editedName],
    );
    check(
      groups.length === 1 && groups[0].id === serverId,
      "restoring reads and continuing after reload reuses the original server group, never a second group",
    );
    const creates = (await metrics()).commands
      .slice(start)
      .filter(
        (c) => c.actor === config.owner && c.operation === "create_draft",
      );
    check(
      creates.length === 1 &&
        new Set(creates.map((c) => c.commandId)).size === 1,
      "actual reload produces no second create command UUID",
    );
    await button("Next").click();
    await button("Create goal").click();
    await heading(editedName).waitFor();
    check(
      await page.evaluate(
        ({ id, alias }) => {
          const state = window.sharedUi.snapshot();
          return (
            state.cache.snapshot.groups.some(
              (g) => g.id === id && g.publishedAt,
            ) && !state.drafts.some((d) => d.id === id || d.id === alias)
          );
        },
        { id: serverId, alias },
      ),
      "reloaded draft publishes the original group and removes its local draft",
    );
  } finally {
    await control("fail_snapshots", { value: false });
  }
  return {
    ok: true,
    assertions,
    checks: [
      legacy
        ? "legacy record actual reload recovers its authorized group without a second creation"
        : "actual page reload during snapshot outage preserves server creation identity, edits and one group/UUID",
    ],
  };
}
