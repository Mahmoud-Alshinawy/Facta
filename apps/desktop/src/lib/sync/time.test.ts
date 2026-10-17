import { describe, expect, it } from "vitest";
import { compareTimestamps, normalizeTime, toMillis } from "@/lib/sync/time";

describe("normalizeTime", () => {
  it.each([
    ["09:05", "09:05"],
    ["9:05", "09:05"],
    ["09:05:00", "09:05"],
    ["23:59:59.999999", "23:59"],
    ["00:00:00", "00:00"],
  ])("%s -> %s", (input, out) => {
    expect(normalizeTime(input)).toBe(out);
  });

  it.each(["", "24:00", "12:60", "noon", "09-05"])("rejects %j", (input) => {
    expect(normalizeTime(input)).toBeNull();
  });

  it("maps null and undefined to null", () => {
    expect(normalizeTime(null)).toBeNull();
    expect(normalizeTime(undefined)).toBeNull();
  });
});

describe("timestamps", () => {
  it("compares numerically across formats, not as strings", () => {
    // As strings, ".5Z" sorts after ".123456+00:00", but it is 377ms later only
    // when parsed; and a +03:00 offset is earlier than its digits suggest.
    expect(compareTimestamps("2026-10-16T12:00:00.5Z", "2026-10-16T12:00:00.123456+00:00")).toBe(1);
    expect(compareTimestamps("2026-10-16T14:00:00+03:00", "2026-10-16T12:00:00Z")).toBe(-1);
    expect(compareTimestamps("2026-10-16T15:00:00+03:00", "2026-10-16T12:00:00.000Z")).toBe(0);
  });

  it("parses microsecond timestamps as their millisecond prefix", () => {
    expect(toMillis("2026-10-16T12:00:00.123456+00:00")).toBe(Date.parse("2026-10-16T12:00:00.123+00:00"));
    expect(toMillis("2026-10-16T12:00:00.9999999Z")).toBe(Date.parse("2026-10-16T12:00:00.999Z"));
    expect(toMillis("2026-10-16T12:00:00.5Z")).toBe(Date.parse("2026-10-16T12:00:00.500Z"));
  });

  it("treats missing or invalid as oldest", () => {
    expect(toMillis(undefined)).toBe(Number.NEGATIVE_INFINITY);
    expect(toMillis("garbage")).toBe(Number.NEGATIVE_INFINITY);
    expect(compareTimestamps("2026-01-01T00:00:00Z", undefined)).toBe(1);
  });
});
