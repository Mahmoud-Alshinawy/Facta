// Group deadlines shown in the viewer's clock, on the full production App.
// Real account engines/IndexedDB/SDK/disposable SQL; synthetic identity only.
import { mkdir } from "node:fs/promises";
import path from "node:path";

const NOW = "2026-10-27T12:00:10Z";
const THEMES = {
  default: "Black and green",
  midnight: "Midnight",
  ember: "Ember",
  light: "Light",
};
// Riyadh group on Tue 27 Oct (round Mon 26 Oct – Sun 1 Nov). Los Angeles is
// on PDT today but PST when the round ends, after US clocks go back.
const LA_LINES = [
  "Today's check-in closes at 2:00pm your time (midnight Asia/Riyadh)",
  "Round ends Sun 1:00pm your time",
];

export async function runSharedDeadlineTests({
  page,
  context,
  url,
  fixture,
  root,
}) {
  const config = await fetch(`${fixture}/test/config`).then((r) => r.json());
  const folder = path.join(root, "tmp/shared-goals-runtime/deadline-shots");
  await mkdir(folder, { recursive: true });
  let assertions = 0;
  const screenshots = [];
  const check = (ok, label) => {
    if (!ok) throw Error(label);
    assertions++;
  };
  await fetch(`${fixture}/test/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "clock", now: NOW }),
  });
  const open = async (p) => {
    await p.clock.install({ time: new Date(NOW) });
    await p.clock.setFixedTime(new Date(NOW));
    await p.goto(url);
    await p.waitForFunction(() => !!window.acceptance);
    await p.evaluate((id) => window.acceptance.actor(id), config.owner);
    await p.evaluate(() => window.acceptance.sync());
  };
  const nav = (p, name) =>
    p
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name, exact: true })
      .click();
  const surfaces = {
    overview: async (p) => {
      await nav(p, "Goals");
      await p.getByRole("radio", { name: /^Shared/ }).click();
      await p
        .getByRole("button", { name: "Open Client integration", exact: true })
        .waitFor();
      return p.locator(".shared-sc", { hasText: "Client integration" }).first();
    },
    detail: async (p) => {
      await p
        .getByRole("button", { name: "Open Client integration", exact: true })
        .click();
      return p.locator(".shared-status-strip");
    },
    today: async (p) => {
      await nav(p, "Today");
      await p
        .locator('[data-progress-surface="today"] [data-score]')
        .first()
        .waitFor();
      return p.locator('[data-progress-surface="today"]');
    },
    settings: async (p) => {
      await nav(p, "Settings");
      await p.getByRole("button", { name: "Add widget", exact: true }).click();
      await p.getByRole("radio", { name: "Progress", exact: true }).click();
      await p
        .locator('[data-progress-surface="widget"] [data-score]')
        .first()
        .waitFor();
      return p.locator('[data-progress-surface="widget"]');
    },
  };
  const lines = (area) =>
    area
      .locator("[data-deadline]")
      .evaluateAll((all) => all.map((e) => e.textContent));

  // Same zone as the group: no extra lines anywhere.
  await open(page);
  for (const [name, reach] of Object.entries(surfaces)) {
    const area = await reach(page);
    check(
      (await lines(area)).length === 0,
      `Riyadh viewer: ${name} adds no deadline lines`,
    );
  }

  const traveller = await context.browser().newContext({
    viewport: { width: 1280, height: 920 },
    timezoneId: "America/Los_Angeles",
  });
  try {
    await traveller.route("**/*", (route) =>
      ["127.0.0.1", "localhost", "[::1]"].includes(
        new URL(route.request().url()).hostname,
      )
        ? route.continue()
        : route.abort(),
    );
    const la = await traveller.newPage();
    await open(la);
    for (const [name, reach] of Object.entries(surfaces)) {
      const area = await reach(la);
      check(
        JSON.stringify(await lines(area)) === JSON.stringify(LA_LINES),
        `Los Angeles viewer: ${name} shows both deadlines in local time`,
      );
      check(
        (await area.innerText()).includes("Asia/Riyadh"),
        `Los Angeles viewer: ${name} shows the group's time zone`,
      );
      for (const theme of Object.keys(THEMES)) {
        await la
          .getByRole("button", { name: `${THEMES[theme]} theme`, exact: true })
          .click();
        if (name === "settings")
          await la
            .getByRole("radiogroup", { name: "Widget theme", exact: true })
            .getByRole("radio", { name: THEMES[theme], exact: true })
            .click();
        await la.evaluate(() => document.fonts.ready);
        check(
          await la.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${name}/${theme}: no page overflow`,
        );
        check(
          await area.locator("[data-deadline]").evaluateAll((all) =>
            all.every((e) => {
              const r = e.getBoundingClientRect();
              return (
                r.width > 0 &&
                r.height > 0 &&
                getComputedStyle(e).visibility !== "hidden"
              );
            }),
          ),
          `${name}/${theme}: deadline lines are visible`,
        );
        const file = path.join(folder, `${name}-${theme}.png`);
        await area.screenshot({ path: file });
        screenshots.push(file);
      }
    }
  } finally {
    await traveller.close();
  }
  return {
    ok: true,
    assertions,
    screenshots,
    checks: [
      "Riyadh group viewed in Riyadh: no deadline lines on Shared card, detail, Today or Settings Progress preview",
      "same group viewed from Los Angeles: check-in close and round end in local time (PDT today, PST at round end), group zone visible, four themes",
    ],
  };
}
