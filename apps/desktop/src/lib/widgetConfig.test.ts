import { describe, expect, it } from "vitest";
import { parseWidgetConfig, widgetConfigJson } from "./widgetConfig";

describe("widget configuration compatibility", () => {
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
          { id: "notes", type: "notes" },
          { id: "diary", type: "diary" },
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
