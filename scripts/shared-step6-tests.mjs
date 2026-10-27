import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function runSharedAcceptance({
  page,
  context,
  url,
  fixture,
  root,
}) {
  const config = await fetch(`${fixture}/test/config`).then((r) => r.json());
  const folder = path.join(root, "tmp/shared-goals-runtime/step6-shots");
  await mkdir(folder, { recursive: true });
  let assertions = 0;
  const checks = [],
    screenshots = [];
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
  await control({ action: "clock", now: "2026-10-27T12:00:00Z" });
  await page.clock.install({ time: new Date("2026-10-27T12:00:00Z") });
  await page.clock.setFixedTime(new Date("2026-10-27T12:00:00Z"));
  page.on("pageerror", (e) => console.error("Acceptance runtime:", e.message));
  await page.goto(url);
  await page.waitForFunction(() => !!window.acceptance);
  const command = (id, op, payload) =>
    page.evaluate(
      ({ id, op, payload }) => window.acceptance.command(id, op, payload),
      { id, op, payload },
    );
  await control({ action: "clock", now: "2026-10-14T09:00:00Z" });
  const draft = await command(config.owner, "create_draft", {
    name: "Study together",
    template: "custom",
    schedule_kind: "every",
    time_zone: "Asia/Riyadh",
    round_weekday: 1,
  });
  check(draft.ok, "second real group for responsive card comparison");
  const published = await command(config.owner, "publish", {
    group_id: draft.groupId,
    expected_revision: 1,
    first_round_date: "2026-10-19",
  });
  check(published.ok, "second group published");
  const invitation = await command(config.owner, "issue_link", {
    group_id: draft.groupId,
  });
  check(
    (await command(config.other, "join", { token: invitation.token })).ok,
    "second member joins Custom",
  );
  await control({ action: "clock", now: "2026-10-27T12:00:00Z" });
  await page.evaluate((id) => window.acceptance.actor(id), config.owner);
  await page.evaluate(() => window.acceptance.seedPersonal("2026-10-27"));
  let data = await page.evaluate(() => window.acceptance.snapshot());
  const own = data.cache.snapshot.memberships.find(
    (m) => m.groupId === config.groupId && m.userId === config.owner,
  );
  for (const date of ["2026-10-26", "2026-10-27"]) {
    const outcome = await command(config.owner, "set_checkin", {
      group_id: config.groupId,
      membership_id: own.id,
      date,
      captured_at: `${date}T09:00:00Z`,
      completed: true,
      base_revision: 0,
    });
    check(outcome.ok, "server confirms seeded adherence");
  }
  await page.evaluate(() => window.acceptance.sync());
  // Fresh reads can arrive between useNow's minute ticks. Do not mistake the
  // older display render time for a clock rollback and mark that read stale.
  await control({ action: "clock", now: "2026-10-27T12:00:10Z" });
  await page.clock.setFixedTime(new Date("2026-10-27T12:00:10Z"));
  await page.evaluate(() => window.acceptance.sync());
  await page
    .locator('[data-progress-surface="today"] [data-score]')
    .first()
    .waitFor();
  check(
    !(
      await page.locator('[data-progress-surface="today"]').innerText()
    ).includes("Last confirmed"),
    "a fresh read between display ticks remains confirmed",
  );
  const nav = (name) =>
    page
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name, exact: true })
      .click();
  const shared = async () => {
    await nav("Goals");
    const back = page.getByRole("button", { name: "← Shared", exact: true });
    if (await back.count()) await back.click();
    else await page.getByRole("radio", { name: /^Shared/ }).click();
    await page.getByRole("heading", { name: "Goals", exact: true }).waitFor();
  };
  const frame = async (name, theme, width, height) => {
    await page.setViewportSize({ width, height });
    await page
      .getByRole("button", {
        name: `${{ default: "Black and green", midnight: "Midnight", ember: "Ember", light: "Light" }[theme]} theme`,
        exact: true,
      })
      .click();
    if (name === "settings") {
      await page
        .getByRole("radiogroup", { name: "Widget theme", exact: true })
        .getByRole("radio", {
          name: {
            default: "Black and green",
            midnight: "Midnight",
            ember: "Ember",
            light: "Light",
          }[theme],
          exact: true,
        })
        .click();
      check(
        (await page
          .locator('[data-progress-surface="widget"]')
          .getAttribute("data-theme")) === theme,
        "Settings preview uses the selected widget theme independently of the app theme",
      );
      await page.locator(".settings-content").evaluate((e) => {
        e.scrollTop = 0;
      });
    }
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${name}/${theme}/${width}/${height}: no page overflow`,
    );
    if (name === "overview" && width <= 1200)
      check(
        await page.locator(".shared-cards").evaluate((e) => {
          const cards = [...e.children];
          return (
            cards.length >= 2 &&
            Math.abs(
              cards[0].getBoundingClientRect().left -
                cards[1].getBoundingClientRect().left,
            ) < 1
          );
        }),
        "GS narrow layout stacks shared cards per the approved board",
      );
    const file = path.join(folder, `${name}-${theme}-${width}-${height}.png`);
    await page.screenshot({
      path: file,
      mask: [page.getByLabel("Invite link", { exact: true })],
    });
    screenshots.push(file);
    // The focused control must be reachable, rather than hidden behind a footer.
    await page.keyboard.press("Tab");
    check(
      await page.evaluate(() => {
        const e = document.activeElement,
          r = e?.getBoundingClientRect();
        return (
          !!r &&
          e !== document.body &&
          r.width > 0 &&
          r.height > 0 &&
          r.top >= 0 &&
          r.bottom <= innerHeight
        );
      }),
      `${name}/${theme}/${width}/${height}: keyboard focus inside visible window`,
    );
  };
  try {
    for (const surface of [
      "overview",
      "detail",
      "create",
      "gym",
      "people",
      "review",
      "custom",
      "today",
      "settings",
    ]) {
      if (surface === "overview") await shared();
      if (surface === "detail")
        await page
          .getByRole("button", { name: "Open Client integration", exact: true })
          .click();
      if (surface === "create") {
        await shared();
        await page.getByRole("button", { name: /New shared goal/ }).click();
      }
      if (surface === "gym") {
        await page.getByRole("button", { name: /^Next/ }).click();
        await page.getByLabel("Name", { exact: true }).fill("Acceptance Gym");
      }
      if (surface === "people") {
        await page.getByRole("button", { name: /^Next/ }).click();
        await page
          .getByRole("heading", { name: "People", exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "Create link", exact: true })
          .click();
        await page.getByLabel("Invite link", { exact: true }).waitFor();
        await page
          .getByLabel("Or add by username", { exact: true })
          .fill("client_1");
        await page
          .getByLabel("Or add by username", { exact: true })
          .press("Enter");
        await page
          .getByText("Invite sent. Acceptance is pending.", { exact: true })
          .waitFor();
      }
      if (surface === "review") {
        await page.getByRole("button", { name: /^Next/ }).click();
        await page
          .getByRole("heading", { name: "Review your goal", exact: true })
          .waitFor();
      }
      if (surface === "custom") {
        await page
          .locator(".shared-header")
          .getByRole("button", { name: /Cancel/ })
          .click();
        await page.getByRole("button", { name: /New shared goal/ }).click();
        await page.getByRole("radio", { name: /^Custom/ }).click();
        await page.getByRole("button", { name: /^Next/ }).click();
        await page
          .getByLabel("Name", { exact: true })
          .fill("Acceptance Custom");
        await page
          .getByRole("radio", { name: "Specific days", exact: true })
          .click();
      }
      if (surface === "today") await nav("Today");
      if (surface === "today")
        check(
          (await page
            .locator('[data-progress-surface="today"] [data-score]')
            .count()) >= 2,
          "full Today production hook is bound to confirmed shared rows",
        );
      if (surface === "settings") {
        await nav("Settings");
        await page
          .getByRole("button", { name: "Add widget", exact: true })
          .click();
        await page
          .getByRole("radio", { name: "Progress", exact: true })
          .click();
        check(
          (await page
            .locator('[data-progress-surface="widget"] [data-score]')
            .count()) >= 2,
          "Settings Progress preview is bound to confirmed shared rows",
        );
        await control({ action: "clock", now: "2026-10-27T12:00:20Z" });
        await page.clock.setFixedTime(new Date("2026-10-27T12:00:20Z"));
        await page.evaluate(() => window.acceptance.sync());
        check(
          !(
            await page.locator('[data-progress-surface="widget"]').innerText()
          ).includes("Last confirmed"),
          "Settings preview stays confirmed when a read arrives between display ticks",
        );
      }
      for (const theme of ["default", "midnight", "ember", "light"])
        for (const width of [1440, 1280, 1100])
          for (const height of [920, 600])
            await frame(surface, theme, width, height);
      // A real Tab sweep through the short-window app, not programmatic focus.
      const stops = await page
        .locator(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        )
        .count();
      for (let n = 0; n < Math.min(stops + 2, 100); n++) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const e = document.activeElement,
            r = e?.getBoundingClientRect();
          if (!e || e === document.body) return "outside";
          const s = getComputedStyle(e);
          return (
            r.width > 0 &&
            r.height > 0 &&
            r.top >= -1 &&
            r.bottom <= innerHeight + 1 &&
            (s.outlineStyle !== "none" || s.boxShadow !== "none")
          );
        });
        if (focused === "outside") break;
        check(
          focused,
          `${surface}: short-window Tab stop is visible with a focus indicator`,
        );
      }
      if (surface === "custom")
        await page
          .locator(".shared-header")
          .getByRole("button", { name: /Cancel/ })
          .click();
    }
    checks.push(
      "full production App: Shared overview/detail/create, Today and Settings Progress preview; four themes × three widths × 920/600 heights",
    );
    const reference = await context.newPage();
    const fonts = await page.evaluate(() =>
      [...document.styleSheets]
        .flatMap((sheet) =>
          [...sheet.cssRules]
            .filter((r) => r.cssText.startsWith("@font-face"))
            .map((r) =>
              r.cssText.replace(
                /url\(([^)]+)\)/g,
                (_, raw) =>
                  `url("${new URL(raw.replace(/["']/g, ""), sheet.href).href}")`,
              ),
            ),
        )
        .join("\n"),
    );
    // Each component is loaded/rendered separately, never concatenated.
    for (const [component, props, state] of [
      ["GoalsShared", { state: "default" }],
      ["GoalsDetail", { state: "default" }],
      ["GoalsCreate", { state: "template" }],
      ["Main", { hasSharedGoals: true }],
      [
        "Settings",
        { tab: "widgets" },
        { newKind: "progress", newTrans: false },
      ],
      ["Widget", { kind: "progress", transparent: false }],
    ])
      for (const theme of ["bg", "mid", "ember", "light"])
        for (const width of component === "Widget"
          ? [300]
          : [1440, 1280, 1100]) {
          await reference.setViewportSize({
            width,
            height: component === "Widget" ? 480 : 920,
          });
          await renderDesignReference(
            reference,
            path.join(root, `design/canvas-v97/${component}.dc.html`),
            { ...props, theme },
            state,
            fonts,
          );
          await reference.evaluate(() => document.fonts.ready);
          const file = path.join(
            folder,
            `reference-${component}-${theme}-${width}.png`,
          );
          await reference.screenshot({ path: file });
          screenshots.push(file);
        }
    await reference.close();
    await nav("Today");
    const primaryToday = page.locator('[data-progress-surface="today"]');
    await primaryToday
      .getByLabel("Today shared group")
      .selectOption(config.groupId);
    const personalBefore = await page.evaluate(() =>
      JSON.stringify(window.acceptance.personal()),
    );
    const second = await context.browser().newContext({
      viewport: { width: 1280, height: 800 },
      timezoneId: "Asia/Riyadh",
    });
    await second.route("**/*", (r) =>
      ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
        ? r.continue()
        : r.abort(),
    );
    const peer = await second.newPage();
    await peer.clock.install({ time: new Date("2026-10-27T12:00:10Z") });
    await peer.clock.setFixedTime(new Date("2026-10-27T12:00:10Z"));
    try {
      await peer.goto(url);
      await peer.waitForFunction(() => !!window.acceptance);
      await peer.evaluate((id) => window.acceptance.actor(id), config.owner);
      const peerToday = peer.locator('[data-progress-surface="today"]');
      await peerToday
        .getByLabel("Today shared group")
        .selectOption(config.groupId);
      await context.setOffline(true);
      await primaryToday
        .getByRole("button", {
          name: "Undo check-in: Client integration",
          exact: true,
        })
        .click();
      await page.waitForFunction(
        () => window.acceptance.snapshot().outbox.length === 1,
      );
      check(
        (await primaryToday.innerText()).includes("Pending changes"),
        "first device persists an offline pending undo without optimistic scores",
      );
      await peerToday
        .getByRole("button", {
          name: "Undo check-in: Client integration",
          exact: true,
        })
        .click();
      await peer.waitForFunction(
        (gid) =>
          window.acceptance
            .snapshot()
            .cache.snapshot.checkins.some(
              (c) =>
                c.groupId === gid &&
                c.checkinDate === "2026-10-27" &&
                !c.completed,
            ),
        config.groupId,
      );
      await peerToday
        .getByRole("button", {
          name: "Check in: Client integration",
          exact: true,
        })
        .click();
      await peer.waitForFunction(
        (gid) =>
          window.acceptance
            .snapshot()
            .cache.snapshot.checkins.some(
              (c) =>
                c.groupId === gid &&
                c.checkinDate === "2026-10-27" &&
                c.completed &&
                c.revision >= 3,
            ),
        config.groupId,
      );
      await context.setOffline(false);
      await page.evaluate(() => window.acceptance.sync());
      await page.waitForFunction(() =>
        window.acceptance
          .snapshot()
          .outbox.some((i) => i.failure === "conflict"),
      );
      check(
        (await page.evaluate(() =>
          JSON.stringify(window.acceptance.personal()),
        )) === personalBefore,
        "two-device shared conflict leaves personal records unchanged",
      );
      check(
        Number(
          await primaryToday
            .locator(`[data-score="${config.owner}"]`)
            .getAttribute("data-percent"),
        ) === 100,
        "reconnecting device retains server-confirmed score after opposing intent conflict",
      );
      await primaryToday
        .getByRole("button", { name: "Open group", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Discard rejected change", exact: true })
        .click();
      await page.waitForFunction(
        () => window.acceptance.snapshot().outbox.length === 0,
      );
    } finally {
      await context.setOffline(false);
      await second.close();
    }
    checks.push(
      "two independent browser profiles/IndexedDB stores: offline intent, competing server revisions, explicit conflict review, personal-record independence",
    );
    const link = await command(config.owner, "issue_link", {
      group_id: config.groupId,
    });
    const late = await command(config.third, "join", {
      token: link.token,
      target: 2,
    });
    check(
      late.ok && late.eligibleRound === "2026-11-02",
      "late member is accepted only for the next eligible round",
    );
    await page.evaluate((id) => window.acceptance.actor(id), config.third);
    await nav("Today");
    await page.getByLabel("Today shared group").selectOption(config.groupId);
    check(
      await page
        .locator('[data-progress-surface="today"]')
        .getByRole("button", {
          name: "Check in: Client integration",
          exact: true,
        })
        .isDisabled(),
      "next-round member cannot check in early",
    );
    await page.evaluate((id) => window.acceptance.actor(id), config.owner);
    check(
      (await command(config.other, "leave", { group_id: config.groupId })).ok,
      "eligible peer leaves while a next-round member is accepted",
    );
    await page.evaluate(() => window.acceptance.sync());
    await nav("Today");
    await page.getByLabel("Today shared group").selectOption(config.groupId);
    check(
      (await primaryToday.innerText()).includes("Paused"),
      "accepted-but-ineligible member cannot prevent the pause",
    );
    for (const theme of ["default", "midnight", "ember", "light"])
      await frame("paused-today", theme, 1100, 600);
    check(
      (await command(config.owner, "archive", { group_id: config.groupId })).ok,
      "owner archives the paused group",
    );
    await page.evaluate(() => window.acceptance.sync());
    check(
      (await primaryToday.innerText()).includes("Archived"),
      "archived Today state stays read-only with confirmed history",
    );
    check(
      (await command(config.owner, "leave", { group_id: config.groupId })).ok,
      "owner can leave an archived group",
    );
    await page.evaluate(() => window.acceptance.sync());
    check(
      !(await page.evaluate(
        (gid) =>
          window.acceptance
            .snapshot()
            .cache.snapshot.groups.some((g) => g.id === gid),
        config.groupId,
      )),
      "successful leave purges inaccessible group cache",
    );
    await page.evaluate((id) => window.acceptance.actor(id), config.other);
    check(
      await page.evaluate(
        (id) => window.acceptance.snapshot().userId === id,
        config.other,
      ),
      "full-app account switch binds the new account store",
    );
    checks.push(
      "full-app next-round eligibility, accepted/eligible pause boundary, archived read-only state, leave purge and account change",
    );
    return {
      ok: true,
      assertions,
      screenshots,
      checks,
      identity:
        "synthetic local SQL bridge; full Auth/JWT/PostgREST unverified",
    };
  } catch (e) {
    await page.screenshot({ path: path.join(folder, "failure.png") });
    console.error(
      "Acceptance visible:",
      (await page.locator("body").innerText())
        .replace(/facta:\/\/join\/[A-Za-z0-9_-]+/g, "[redacted invitation]")
        .slice(-2500),
    );
    throw e;
  }
}

// Render one approved .dc component at a time, with its own renderVals sample
// state, for visual comparison. No source is copied into the product.
export async function renderDesignReference(
  page,
  file,
  props,
  state,
  fonts = "",
) {
  const source = await readFile(file, "utf8");
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ content: fonts });
  await page.evaluate(
    ({ source, props, state }) => {
      const doc = new DOMParser().parseFromString(source, "text/html");
      const logic = doc.querySelector("script[data-dc-script]").textContent;
      class DCLogic {
        constructor(p) {
          this.props = p;
        }
        setState(p) {
          this.state = { ...this.state, ...p };
        }
      }
      const Component = new Function("DCLogic", `${logic}; return Component;`)(
        DCLogic,
      );
      const component = new Component(props);
      if (state) component.state = { ...component.state, ...state };
      const vals = component.renderVals();
      const expr = (text, ctx) =>
        new Function("ctx", `with(ctx) { return (${text}); }`)(ctx);
      const replace = (text, ctx) =>
        text.replace(/{{\s*([\s\S]*?)\s*}}/g, (_, e) => {
          const value = expr(e, ctx);
          return typeof value === "function" ? "" : (value ?? "");
        });
      const render = (node, ctx) => {
        if (node.nodeType === Node.TEXT_NODE)
          return document.createTextNode(replace(node.textContent, ctx));
        if (node.nodeType !== Node.ELEMENT_NODE)
          return document.createDocumentFragment();
        const tag = node.tagName.toLowerCase(),
          fragment = document.createDocumentFragment();
        if (["script", "helmet"].includes(tag)) return fragment;
        if (tag === "sc-if") {
          const e = node.getAttribute("value").replace(/^{{|}}$/g, "");
          if (expr(e, ctx))
            for (const child of node.childNodes)
              fragment.append(render(child, ctx));
          return fragment;
        }
        if (tag === "sc-for") {
          const e = node.getAttribute("list").replace(/^{{|}}$/g, "");
          for (const item of expr(e, ctx) ?? [])
            for (const child of node.childNodes)
              fragment.append(
                render(child, { ...ctx, [node.getAttribute("as")]: item }),
              );
          return fragment;
        }
        const el = node.cloneNode(false);
        for (const a of [...el.attributes]) {
          if (/^on|^hint-/.test(a.name)) el.removeAttribute(a.name);
          else el.setAttribute(a.name, replace(a.value, ctx));
        }
        for (const child of node.childNodes) el.append(render(child, ctx));
        return el;
      };
      for (const style of doc.querySelectorAll("style")) {
        const copy = document.createElement("style");
        copy.textContent = style.textContent.replace(/@import[^;]+;/g, "");
        document.head.append(copy);
      }
      document.body.style.margin = "0";
      document.body.append(
        render(
          doc.querySelector(".fx") ?? doc.querySelector("x-dc > div"),
          vals,
        ),
      );
    },
    { source, props, state },
  );
}
