import { describe, expect, it } from "vitest";
import {
  parseWidgetConfig,
  widgetConfigJson,
  cleanWidgetSharedSelections,
} from "./widgetConfig";

describe("widget configuration compatibility", () => {
  it("scopes Progress selection to its account and removes only inaccessible selection fields", () => {
    const user = "11111111-1111-4111-8111-111111111111",
      group = "33333333-3333-4333-8333-333333333333";
    const raw = {
      custom: "kept",
      widgets: [
        {
          id: "p",
          type: "progress",
          theme: "ember",
          sharedGroupId: group,
          sharedUserId: user,
          extra: "kept",
        },
        { id: "t", type: "tasks", extra: 1 },
      ],
    };
    expect(parseWidgetConfig(raw)[0]).toMatchObject({
      sharedGroupId: group,
      sharedUserId: user,
    });
    expect(cleanWidgetSharedSelections(raw, user, new Set([group]))).toEqual(
      raw,
    );
    const cleared = cleanWidgetSharedSelections(raw, user, new Set());
    expect(cleared).toEqual({
      custom: "kept",
      widgets: [
        { id: "p", type: "progress", theme: "ember", extra: "kept" },
        { id: "t", type: "tasks", extra: 1 },
      ],
    });
    expect(cleanWidgetSharedSelections(raw, null)).toEqual(cleared);
    expect(cleanWidgetSharedSelections(raw, group)).toEqual(cleared);
    expect(
      cleanWidgetSharedSelections(
        { widgets: [{ ...raw.widgets[0], type: "tasks" }] },
        null,
      ),
    ).toEqual({
      widgets: [{ id: "p", type: "tasks", theme: "ember", extra: "kept" }],
    });
  });
  it("preserves every field the native companion consumes", () => {
    const widgets = [
      {
        id: "w-123",
        type: "dayview" as const,
        enabled: false,
        translucent: false,
        theme: "light" as const,
      },
    ];
    expect(JSON.parse(widgetConfigJson(widgets))).toEqual({ widgets });
    expect(parseWidgetConfig(JSON.parse(widgetConfigJson(widgets)))).toEqual(
      widgets,
    );
  });
  it("keeps legacy defaults rather than silently changing existing widgets", () => {
    expect(
      parseWidgetConfig({ widgets: [{ id: "old", type: "tasks" }] }),
    ).toEqual([
      {
        id: "old",
        type: "tasks",
        enabled: true,
        translucent: true,
        theme: "midnight",
      },
    ]);
  });
  it("accepts the five branch-1 types and all four themes", () => {
    const widgets = ["tasks", "progress", "events", "calendar", "dayview"].map(
      (type, i) => ({
        id: `w-${i}`,
        type,
        theme: ["default", "midnight", "ember", "light"][i % 4],
      }),
    );
    expect(parseWidgetConfig({ widgets })).toHaveLength(5);
  });
  it("rejects unknown future types, malformed records and duplicate window ids", () => {
    expect(
      parseWidgetConfig({
        widgets: [
          null,
          1,
          { id: "future", type: "future" },
          { id: "lock", type: "lock" },
          { id: "", type: "tasks" },
          { id: "same", type: "tasks" },
          { id: "same", type: "events" },
        ],
      }),
    ).toHaveLength(1);
    expect(parseWidgetConfig(null)).toEqual([]);
    expect(parseWidgetConfig({ widgets: "bad" })).toEqual([]);
  });
});

it("round-trips Sticky/Stack and Diary while defaulting old Notes configurations", () => {
  const widgets = parseWidgetConfig({
    widgets: [
      { id: "s", type: "notes", noteStyle: "stack" },
      { id: "p", type: "notes" },
      { id: "d", type: "diary" },
    ],
  });
  expect(widgets.map((w) => w.noteStyle)).toEqual([
    "stack",
    "sticky",
    undefined,
  ]);
  expect(parseWidgetConfig(JSON.parse(widgetConfigJson(widgets)))).toEqual(
    widgets,
  );
});
