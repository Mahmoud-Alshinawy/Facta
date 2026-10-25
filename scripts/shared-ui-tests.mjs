import path from "node:path";
import { mkdir } from "node:fs/promises";
export async function runSharedUiTests({ page, context, url, fixture, root }) {
  const config = await fetch(`${fixture}/test/config`).then((r) => r.json());
  const control = (action, extra = {}) =>
    fetch(`${fixture}/test/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    }).then((r) => {
      if (!r.ok) throw new Error("Fixture control failed");
      return r.json();
    });
  const metrics = () => fetch(`${fixture}/test/metrics`).then((r) => r.json());
  let assertions = 0,
    last = "startup";
  const runtimeErrors = [];
  page.on("pageerror", (error) =>
    runtimeErrors.push(
      error.message.replace(
        /facta:\/\/join\/[A-Za-z0-9_-]{43}/g,
        "[redacted invitation]",
      ),
    ),
  );
  const checks = [],
    shots = [];
  const check = (value, label) => {
    last = label;
    assertions++;
    if (!value) throw new Error(label);
  };
  const button = (name) => page.getByRole("button", { name, exact: true });
  const heading = (name) => page.getByRole("heading", { name, exact: true });
  const actor = (id) => page.evaluate((id) => window.sharedUi.setActor(id), id);
  const command = (id, operation, payload) =>
    page.evaluate(
      ({ id, operation, payload }) =>
        window.sharedUi.commandAs(id, operation, payload),
      { id, operation, payload },
    );
  const setClock = async (at) => {
    await control("clock", { now: at });
    await page.evaluate((at) => window.sharedUi.now(at), at);
  };
  const shot = async (name) => {
    const folder = path.join(root, "tmp/shared-goals-runtime/step3-shots");
    await mkdir(folder, { recursive: true });
    const file = path.join(folder, name + ".png");
    await page.screenshot({
      path: file,
      mask: [
        page.getByLabel("Invite link", { exact: true }),
        page.locator("#shared-paste"),
      ],
    });
    shots.push(file);
  };
  const openCreate = async () => {
    await heading("Goals").waitFor();
    await page.keyboard.press("Shift+N");
    await heading("New shared goal").waitFor();
    await page.waitForFunction(
      () => document.activeElement?.textContent === "New shared goal",
    );
  };
  const next = async () => {
    await button("Next").click();
  };
  const joinLink = async (link) => {
    await button("Join with a link").first().click();
    await page.getByLabel("Invitation link", { exact: true }).fill(link);
    await button("Review invitation").click();
    await heading("Join shared goal").waitFor();
  };
  await page.goto(url);
  await page.waitForFunction(() => !!window.sharedUi);
  try {
    const invite = await command(config.owner, "issue_link", {
      group_id: config.groupId,
    });
    const start = await metrics();
    await page.evaluate(
      (link) => window.sharedUi.route(link),
      `facta://join/${invite.token}`,
    );
    await page
      .getByText("Invitation kept for this session.", { exact: false })
      .waitFor();
    check(
      (await metrics()).previews.length === start.previews.length,
      "signed-out link does not preview group data",
    );
    check(
      (await metrics()).commands.filter((c) => c.operation === "join")
        .length === 0,
      "signed-out link does not auto-join",
    );
    await actor(config.third);
    await heading("Join shared goal").waitFor();
    await button("Join Client integration").waitFor();
    check(
      (await metrics()).commands.filter((c) => c.operation === "join")
        .length === 0,
      "sign-in opens review without automatic joining",
    );
    check(
      await page.evaluate(
        () => document.activeElement?.textContent === "Join shared goal",
      ),
      "join route focuses heading after mount",
    );
    await page.evaluate(() =>
      window.sharedUi.route(`facta://join/${"_".repeat(43)}`),
    );
    await page
      .getByText("This invitation is invalid, expired or revoked.", {
        exact: false,
      })
      .waitFor();
    check(
      (await button("Join Client integration").count()) === 0,
      "replacing an open invitation removes the previous preview and join action",
    );
    await page.evaluate(
      (link) => window.sharedUi.route(link),
      `facta://join/${invite.token}`,
    );
    await button("Join Client integration").waitFor();
    await button("Join Client integration").focus();
    await page.keyboard.press("Enter");
    await heading("Client integration").waitFor();
    await page.getByText("Your eligibility starts", { exact: false }).waitFor();
    check(
      (await metrics()).commands.filter((c) => c.operation === "join")
        .length === 1,
      "explicit Gym join is the only redemption",
    );
    checks.push(
      "signed-out memory deferral, no unauthenticated preview or automatic join, explicit Gym join and route focus",
    );

    await actor(config.newUser);
    await heading("Your shared profile").waitFor();
    await page.getByLabel("Username", { exact: true }).fill("ab");
    await page.getByLabel("Display name", { exact: true }).fill("Planner");
    await button("Save profile").click();
    await page.getByText("Use 3–24 lowercase", { exact: false }).waitFor();
    check(
      !(await metrics()).commands.some(
        (c) => c.actor === config.newUser && c.operation === "set_profile",
      ),
      "invalid handle is blocked before RPC",
    );
    await page.getByLabel("Username", { exact: true }).fill("client_0");
    await button("Save profile").click();
    await page.getByText("That username is taken.", { exact: false }).waitFor();
    await page.getByLabel("Username", { exact: true }).fill("planner_user");
    await button("Save profile").click();
    await heading("Goals").waitFor();
    check(
      (await metrics()).commands.some(
        (c) =>
          c.actor === config.newUser &&
          c.operation === "set_profile" &&
          c.code === "profile_saved",
      ),
      "real profile setup succeeds after handle_taken",
    );
    checks.push(
      "profile validation, taken handle and successful authenticated setup",
    );

    await setClock("2026-10-18T09:00:00Z");
    await openCreate();
    check(
      await page.evaluate(
        () => document.activeElement?.textContent === "New shared goal",
      ),
      "wizard route focuses its title",
    );
    for (const width of [1440, 1280, 1100]) {
      await page.setViewportSize({ width, height: 920 });
      for (const theme of ["default", "midnight", "ember", "light"]) {
        await page.evaluate((theme) => window.sharedUi.theme(theme), theme);
        check(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <= innerWidth &&
              [
                ...document.querySelectorAll('.shared-card [role="radio"]'),
              ].every((el) => el.getBoundingClientRect().right <= innerWidth),
          ),
          `template fits ${theme} at ${width}`,
        );
        await shot(`template-${theme}-${width}`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 920 });
    await page.evaluate(() => window.sharedUi.theme("default"));
    await page.keyboard.press("Tab");
    check(
      await page.evaluate(() =>
        document.activeElement?.textContent?.includes("Cancel"),
      ),
      "Tab reaches the header cancel control",
    );
    await page.keyboard.press("Tab");
    check(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute("role") === "radio" &&
          getComputedStyle(document.activeElement).outlineStyle !== "none",
      ),
      "Tab reaches the selected template with visible focus",
    );
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Escape");
    await heading("Goals").waitFor();
    await openCreate();
    checks.push(
      "four themes at 1440/1280/1100; Tab, Shift+Tab, visible focus, Escape and fresh wizard reset",
    );
    await page
      .getByRole("radio", { name: /GymEveryone/ })
      .focus()
      .catch(async () => {
        await page
          .getByRole("radiogroup", { name: "Template" })
          .getByRole("radio")
          .first()
          .focus();
      });
    await page.keyboard.press("ArrowRight");
    check(
      (await page
        .getByRole("radiogroup", { name: "Template" })
        .getByRole("radio")
        .nth(1)
        .getAttribute("aria-checked")) === "true",
      "arrow keys choose Custom template",
    );
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await page.getByLabel("Name", { exact: true }).waitFor();
    await page.waitForFunction(
      () => document.activeElement?.id === "shared-name",
    );
    check(
      await page.evaluate(() => document.activeElement?.id === "shared-name"),
      "Details mount focuses name input",
    );
    await page.getByLabel("Name", { exact: true }).fill("Gym round");
    await page
      .getByLabel("Group time zone", { exact: true })
      .fill("Asia/Riyadh");
    await page
      .getByRole("button", {
        name: "One fewer day: Your days per week",
        exact: true,
      })
      .click();
    check(
      await page
        .getByRole("button", {
          name: "One fewer day: Your days per week",
          exact: true,
        })
        .isDisabled(),
      "Gym target cannot drop below two",
    );
    await page
      .getByRole("button", {
        name: "One more day: Your days per week",
        exact: true,
      })
      .click();
    await control("drop_command");
    await next();
    await button("Retry same request").waitFor();
    const pending = await page.evaluate(() => window.sharedUi.pending());
    check(
      pending.length === 1 && pending[0].op === "create_draft",
      "lost create reply retains the caller's command",
    );
    await button("Cancel Esc").click();
    await heading("Goals").waitFor();
    await button("Retry same request").click();
    await page.waitForFunction(
      () =>
        window.sharedUi.pending().length === 0 &&
        window.sharedUi
          .snapshot()
          .cache.snapshot.groups.some((g) => g.name === "Gym round"),
    );
    await button("Resume draft").waitFor();
    const retries = (await metrics()).commands.filter(
      (c) => c.commandId === pending[0].id,
    );
    check(
      retries.length === 2 && retries.every((c) => c.code === "draft_created"),
      "remounted caller retries the exact create UUID/body receipt",
    );
    check(
      await page.evaluate(
        () =>
          window.sharedUi
            .snapshot()
            .cache.snapshot.groups.filter((g) => g.name === "Gym round")
            .length === 1,
      ),
      "lost reply recovery creates one server draft",
    );
    await button("Resume draft").click();
    await heading("People").waitFor();
    await button("Create link").click();
    await page.getByLabel("Invite link", { exact: true }).waitFor();
    const gymLink = await page
      .getByLabel("Invite link", { exact: true })
      .inputValue();
    check(
      /^facta:\/\/join\/[A-Za-z0-9_-]{43}$/.test(gymLink),
      "People shows a real server-issued link",
    );
    await page
      .getByLabel("Or add by username", { exact: true })
      .fill("client_1");
    await page.getByLabel("Or add by username", { exact: true }).press("Enter");
    await page
      .getByText("Invite sent. Acceptance is pending.", { exact: true })
      .waitFor();
    await next();
    await heading("Review your goal").waitFor();
    check(
      (await page.getByText("Mon, 19 Oct 2026", { exact: true }).count()) > 0 ||
        (await page.getByText("Mon 19 Oct 2026", { exact: true }).count()) > 0,
      "Sunday review proposes Monday 19 October",
    );
    await shot("gym-review-1440");
    await setClock("2026-10-21T09:00:00Z");
    await button("Create goal").click();
    await button("Confirm updated date and create goal").waitFor();
    check(
      await page.evaluate(
        () =>
          window.sharedUi
            .snapshot()
            .cache.snapshot.groups.find((g) => g.name === "Gym round")
            .publishedAt === null,
      ),
      "expired proposal does not publish before reconfirmation",
    );
    await control("drop_command");
    await button("Confirm updated date and create goal").click();
    await button("Retry same request").waitFor();
    const publishRequest = (
      await page.evaluate(() => window.sharedUi.pending())
    )[0];
    await button("Retry same request").click();
    await page.waitForFunction(() => window.sharedUi.pending().length === 0);
    await button("Confirm updated date and create goal").click();
    await heading("Gym round").waitFor();
    check(
      await page.evaluate(
        () =>
          window.sharedUi
            .snapshot()
            .cache.snapshot.groups.find((g) => g.name === "Gym round")
            .firstRoundDate === "2026-10-26",
      ),
      "explicit confirmation freezes updated Monday 26 October",
    );
    check(
      (await metrics()).commands.filter(
        (c) => c.commandId === publishRequest.id,
      ).length === 2,
      "uncertain publication reuses the same UUID and body without a third mutation",
    );
    check(
      (await metrics()).commands.some(
        (c) =>
          c.operation === "publish" &&
          c.code === "confirmation_required" &&
          c.commandId !== publishRequest.id,
      ),
      "date reconfirmation allocates a new request UUID",
    );
    checks.push(
      "four-step Gym wizard, arrows/Enter, name focus, target bounds, real invitations, lost-reply identity and expired publication reconfirmation",
    );

    await actor(config.other);
    await page
      .getByRole("region", { name: "Pending invitation" })
      .waitFor()
      .catch(async () => {
        await page.getByLabel("Pending invitation", { exact: true }).waitFor();
      });
    await button("Decline").click();
    await page.getByText("Invitation declined.", { exact: true }).waitFor();
    check(
      (await metrics()).commands.some(
        (c) =>
          c.actor === config.other &&
          c.operation === "decline_invite" &&
          c.code === "declined",
      ),
      "Decline confirms through the real RPC",
    );
    checks.push("pending invitation and explicit decline");
    await actor(config.newUser);
    await openCreate();
    await page
      .getByRole("radiogroup", { name: "Template" })
      .getByRole("radio")
      .nth(1)
      .click();
    await next();
    await page.getByLabel("Name", { exact: true }).fill("Reading together");
    await page
      .getByRole("radio", { name: "Specific days", exact: true })
      .click();
    const beforeInvalid = (await metrics()).commands.filter(
      (c) => c.operation === "create_draft",
    ).length;
    await next();
    await page
      .getByText("Pick at least one weekday.", { exact: true })
      .waitFor();
    check(
      (await metrics()).commands.filter((c) => c.operation === "create_draft")
        .length === beforeInvalid,
      "empty Custom weekday schedule is blocked before RPC",
    );
    await page.getByRole("checkbox", { name: "Monday", exact: true }).click();
    await page
      .getByRole("checkbox", { name: "Wednesday", exact: true })
      .click();
    await next();
    await button("Create link").click();
    await page.getByLabel("Invite link", { exact: true }).waitFor();
    const customLink = await page
      .getByLabel("Invite link", { exact: true })
      .inputValue();
    await next();
    await button("Back").click();
    await button("Back").click();
    check(
      (await page.getByLabel("Name", { exact: true }).inputValue()) ===
        "Reading together" &&
        (await page
          .getByRole("checkbox", { name: "Monday", exact: true })
          .getAttribute("aria-checked")) === "true",
      "Back preserves Custom title and selected days",
    );
    await next();
    await next();
    await button("Create goal").click();
    await heading("Reading together").waitFor();
    check(
      await page.evaluate(() => {
        const g = window.sharedUi
          .snapshot()
          .cache.snapshot.groups.find((g) => g.name === "Reading together");
        return (
          g.template === "custom" &&
          g.scheduleKind === "days" &&
          g.weekdays.join() === "1,3"
        );
      }),
      "Custom specific-day schedule matches the actual database snapshot",
    );
    checks.push("Custom weekday validation, Back preservation and creation");

    await actor(config.other);
    await button("Join with a link").first().click();
    const previews = (await metrics()).previews.length;
    await page
      .getByLabel("Invitation link", { exact: true })
      .fill("https://example.com/join/unknown");
    await button("Review invitation").click();
    await page
      .getByText("Paste an exact facta://join/", { exact: false })
      .waitFor();
    check(
      (await metrics()).previews.length === previews,
      "foreign paste is rejected before any preview RPC",
    );
    await page.getByLabel("Invitation link", { exact: true }).fill(customLink);
    await button("Review invitation").click();
    await button("Join Reading together").waitFor();
    check(
      (await page
        .getByRole("button", {
          name: "One more day: Your days per week",
          exact: true,
        })
        .count()) === 0,
      "Custom join has no personal target override",
    );
    await shot("custom-join-1440");
    await button("Join Reading together").focus();
    await page.keyboard.press("Enter");
    await heading("Reading together").waitFor();
    check(
      await page.evaluate(() => {
        const s = window.sharedUi.snapshot().cache.snapshot;
        const g = s.groups.find((g) => g.name === "Reading together");
        return s.memberships.some(
          (m) =>
            m.groupId === g.id &&
            m.userId ===
              s.profiles.find((p) => p.handle === "client_1").userId &&
            m.initialGymTarget === null,
        );
      }),
      "Custom join stores no personal Gym target",
    );
    checks.push(
      "strict paste rejection, authenticated Custom preview and explicit join",
    );

    for (const schedule of ["Every day", "N per week"]) {
      await actor(config.newUser);
      await openCreate();
      await page
        .getByRole("radiogroup", { name: "Template" })
        .getByRole("radio")
        .nth(1)
        .click();
      await next();
      await page
        .getByLabel("Name", { exact: true })
        .fill(schedule === "Every day" ? "Daily together" : "Weekly together");
      await page.getByRole("radio", { name: schedule, exact: true }).click();
      if (schedule === "N per week") {
        await button("One fewer day: Days per week").click();
        await button("One fewer day: Days per week").click();
        check(
          await button("One fewer day: Days per week").isDisabled(),
          "Custom N cannot drop below one",
        );
      }
      await next();
      await next();
      await button("Create goal").click();
      await heading(
        schedule === "Every day" ? "Daily together" : "Weekly together",
      ).waitFor();
    }
    check(
      await page.evaluate(() => {
        const groups = window.sharedUi.snapshot().cache.snapshot.groups;
        return (
          groups.some(
            (g) => g.name === "Daily together" && g.scheduleKind === "every",
          ) &&
          groups.some(
            (g) =>
              g.name === "Weekly together" &&
              g.scheduleKind === "n" &&
              g.timesPerWeek === 1,
          )
        );
      }),
      "Custom Every day and N-per-week both publish with their shared schedule",
    );
    checks.push(
      "Custom Every day and N-per-week creation and lower target boundary",
    );

    await setClock("2026-10-29T09:00:00Z");
    await actor(config.third);
    await joinLink(customLink);
    await page
      .getByText("This invitation has expired.", { exact: false })
      .waitFor();
    check(
      (await button("Join Reading together").count()) === 0,
      "expired invitation exposes no Join action",
    );
    await actor(config.newUser);
    await page
      .locator(".shared-person")
      .filter({ has: page.getByText("Reading together", { exact: true }) })
      .getByRole("button", { name: "Invite people", exact: true })
      .click();
    await button("Rotate link").click();
    await page.getByLabel("Invite link", { exact: true }).waitFor();
    const rotated = await page
      .getByLabel("Invite link", { exact: true })
      .inputValue();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: new URL(url).origin,
    });
    await button("Copy").click();
    await page.getByText("Invite link copied.", { exact: true }).waitFor();
    check(
      (await page.evaluate(() => navigator.clipboard.readText())) === rotated,
      "Copy writes the actual newly issued invitation",
    );
    await button("Revoke link").click();
    await button("Create link").waitFor();
    await actor(config.third);
    await joinLink(rotated);
    await page
      .getByText("This invitation is invalid, expired or revoked.", {
        exact: false,
      })
      .waitFor();
    check(
      (await button("Join Reading together").count()) === 0,
      "revoked invitation exposes no Join action",
    );
    checks.push(
      "expired preview, explicit rotation/copy/revocation and revoked preview state",
    );

    const fullDraft = await command(config.owner, "create_draft", {
      name: "Capacity test",
      icon: "goals",
      template: "custom",
      schedule_kind: "every",
      weekdays: [],
      times_per_week: null,
      target: null,
      time_zone: "Asia/Riyadh",
      round_weekday: 1,
    });
    check(
      (
        await command(config.owner, "publish", {
          group_id: fullDraft.groupId,
          expected_revision: 1,
          first_round_date: "2026-11-02",
        })
      ).ok,
      "full-state setup publishes through the real adapter",
    );
    const fullLink = await command(config.owner, "issue_link", {
      group_id: fullDraft.groupId,
    });
    for (const handle of [
      "client_1",
      "planner_user",
      "seat_0",
      "seat_1",
      "seat_2",
      "seat_3",
      "seat_4",
    ])
      check(
        (
          await command(config.owner, "invite", {
            group_id: fullDraft.groupId,
            handle,
          })
        ).ok,
        "real invitation reserves a capacity-test seat",
      );
    await button("Back to Shared").click();
    await joinLink(`facta://join/${fullLink.token}`);
    await button("Join Capacity test").waitFor();
    await button("Join Capacity test").click();
    await page
      .getByText("This goal is full (8 people).", { exact: false })
      .waitFor();
    check(
      (await metrics()).commands.some(
        (c) =>
          c.actor === config.third &&
          c.operation === "join" &&
          c.code === "full",
      ),
      "capacity is revalidated by SQL at explicit join",
    );
    checks.push("authoritative full state with eight occupied/reserved seats");
    check(
      runtimeErrors.length === 0,
      "browser flows have no uncaught runtime errors",
    );
    return { ok: true, assertions, checks, screenshots: shots };
  } catch (error) {
    await mkdir(path.join(root, "tmp/shared-goals-runtime"), {
      recursive: true,
    });
    await page
      .screenshot({
        path: path.join(root, "tmp/shared-goals-runtime/ui-failure.png"),
        mask: [
          page.getByLabel("Invite link", { exact: true }),
          page.locator("#shared-paste"),
        ],
      })
      .catch(() => {});
    const { writeFile } = await import("node:fs/promises");
    const visible = await page
      .locator("body")
      .innerText()
      .catch(() => "Page unavailable");
    await writeFile(
      path.join(root, "tmp/shared-goals-runtime/ui-failure.txt"),
      visible.replace(
        /facta:\/\/join\/[A-Za-z0-9_-]{43}/g,
        "[redacted invitation]",
      ),
    );
    throw new Error(
      `Shared UI failed at ${last}: ${String(error.message).replace(/facta:\/\/join\/[A-Za-z0-9_-]{43}/g, "[redacted invitation]")} Runtime errors: ${runtimeErrors.join("; ")}`,
    );
  }
}
