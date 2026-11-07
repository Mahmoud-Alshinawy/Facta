import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSql = (path: string) =>
  readFileSync(
    new URL(`../../../../../supabase/${path}`, import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
const script = readSql("tests/notes_diary.sql");

// A source comparison, not SQL execution. The standalone SQL editor script
// intentionally embeds migrations so it needs no filesystem includes.
describe("standalone SQL test migration copies", () => {
  it.each([
    [
      "20261016120000_goals_events.sql",
      "-- BEGIN embedded base migration (outer transaction removed)",
      "-- END embedded base migration",
    ],
    [
      "20261022140000_notes_diary.sql",
      "-- BEGIN embedded branch migration",
      "-- END embedded branch migration",
    ],
    [
      "20261022140000_notes_diary.sql",
      "-- BEGIN embedded migration rerun: must preserve the fixture rows",
      "-- END embedded migration rerun",
    ],
  ])("keeps %s synchronized at %s", (file, start, end) => {
    const body = readSql(`migrations/${file}`)
      .replace(/^(?:begin|commit);[ \t]*\n?/gm, "")
      .trim();
    const startIndex = script.indexOf(start);
    expect(startIndex).toBeGreaterThanOrEqual(0);
    const endIndex = script.indexOf(end, startIndex + start.length);
    expect(endIndex).toBeGreaterThan(startIndex);
    expect(script.slice(startIndex + start.length, endIndex).trim()).toBe(body);
  });

  it.each([
    ["-- BEGIN shared migration", "-- END shared migration"],
    ["-- BEGIN shared migration rerun", "-- END shared migration rerun"],
  ])("keeps shared goals synchronized at %s", (start, end) => {
    const shared = readSql("tests/shared_goals.sql");
    const body = readSql("migrations/20261024160000_shared_goals.sql")
      .replace(/^(?:begin|commit);[ \t]*\n?/gm, "")
      .trim();
    const startIndex = shared.indexOf(start);
    expect(startIndex).toBeGreaterThanOrEqual(0);
    const endIndex = shared.indexOf(end, startIndex + start.length);
    expect(endIndex).toBeGreaterThan(startIndex);
    expect(shared.slice(startIndex + start.length, endIndex).trim()).toBe(body);
  });

  it("keeps shared SQL assertions synchronized", () => {
    expect(readSql("tests/shared_goals.sql")).toContain(
      readSql("tests/shared_goals.assertions.sql").trim(),
    );
  });
});
