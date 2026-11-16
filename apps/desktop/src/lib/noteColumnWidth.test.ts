import { afterEach, expect, it, vi } from "vitest";
import {
  clampNoteColumnWidth,
  noteColumnWidthBounds,
  noteColumnWidthForKey,
  readNoteColumnWidth,
  saveNoteColumnWidth,
} from "./noteColumnWidth";

afterEach(() => vi.unstubAllGlobals());

it("fits the writing column inside a narrow pane with an outer gutter", () => {
  expect(clampNoteColumnWidth(720, 450)).toBe(426);
});

it("resets the writing width to the default with Home", () => {
  expect(noteColumnWidthForKey(900, "Home", 1200)).toBe(720);
});

it("remembers one width independently of the selected note", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  saveNoteColumnWidth(816, storage);
  expect(readNoteColumnWidth(storage)).toBe(816);
});

it("clamps explicit widths to the normal minimum and available maximum", () => {
  expect(clampNoteColumnWidth(200, 1200)).toBe(480);
  expect(clampNoteColumnWidth(1600, 1200)).toBe(1176);
  expect(clampNoteColumnWidth(720, 1200)).toBe(720);
  expect(noteColumnWidthBounds(450)).toEqual({ min: 426, max: 426 });
});

it("changes width with arrow keys without exceeding the pane", () => {
  expect(noteColumnWidthForKey(720, "ArrowLeft", 1200)).toBe(696);
  expect(noteColumnWidthForKey(720, "ArrowRight", 1200)).toBe(744);
  expect(noteColumnWidthForKey(480, "ArrowLeft", 1200)).toBe(480);
  expect(noteColumnWidthForKey(960, "ArrowRight", 1000)).toBe(976);
  expect(noteColumnWidthForKey(720, "Enter", 1200)).toBeNull();
});

it("keeps the preferred width when a temporarily narrow pane clamps it", () => {
  const storage = { getItem: () => "816" };
  const preferred = readNoteColumnWidth(storage);
  expect(clampNoteColumnWidth(preferred, 450)).toBe(426);
  expect(readNoteColumnWidth(storage)).toBe(816);
  expect(clampNoteColumnWidth(preferred, 1200)).toBe(816);
});

it.each([null, "", "0", "-1", "NaN", "Infinity", "not a width"])(
  "uses the default for an absent or invalid stored width (%s)",
  (raw) => {
    expect(readNoteColumnWidth({ getItem: () => raw })).toBe(720);
  },
);

it("uses the default and keeps working when storage methods throw", () => {
  const storage = {
    getItem: () => {
      throw new Error("Storage is blocked");
    },
    setItem: () => {
      throw new Error("Storage is blocked");
    },
  };
  expect(readNoteColumnWidth(storage)).toBe(720);
  expect(() => saveNoteColumnWidth(816, storage)).not.toThrow();
});

it("handles a blocked localStorage property getter", () => {
  vi.stubGlobal("window", {
    get localStorage() {
      throw new Error("SecurityError");
    },
  });
  expect(readNoteColumnWidth()).toBe(720);
  expect(() => saveNoteColumnWidth(816)).not.toThrow();
});
