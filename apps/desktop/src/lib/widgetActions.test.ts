import { it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDbStore } from "./sync/indexedDbStore";
import { PlannerSync } from "./sync/engine";
import { memoryStore } from "./sync/storage";
import { applyWidgetAction, widgetReceipts } from "./widgetActions";
import { makeNote } from "@/test/contentFixtures";
import { USER, OTHER_USER, makeGoal } from "@/test/harness";
import { widgetNote } from "./widgetJournal";
import { noteBodyText } from "./noteBody";
const now = new Date("2026-10-23T12:00:00+03:00");
const engine = (store = memoryStore()) => {
  const e = new PlannerSync({
    userId: USER,
    store,
    remotes: null,
    currentUserId: () => USER,
  });
  e.load();
  return e;
};
const action = (patch: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  user_id: USER,
  ...patch,
});
it("creates a quick note through the real collection/queue and deduplicates redelivery after engine restart", async () => {
  const e = engine(),
    a = action({ type: "quick_note", text: "First thought" });
  expect(await applyWidgetAction(e, a, now)).toEqual({ id: a.id });
  const loaded = engine(e.localStore as ReturnType<typeof memoryStore>);
  await applyWidgetAction(loaded, a, now);
  expect(loaded.notes.getSnapshot()).toHaveLength(1);
  expect(loaded.getStatus().pending).toBe(1);
  expect(widgetReceipts(loaded)).toHaveLength(1);
  e.dispose();
  loaded.dispose();
});
it("updates note text/colour without dropping metadata or unseen body text", async () => {
  const e = engine(),
    note = e.notes.upsert(
      makeNote({
        pinnedToWidget: true,
        tags: ["keep"],
        body: [
          {
            id: "p",
            type: "paragraph",
            content: [{ type: "text", text: "old " + "x".repeat(1000) }],
          },
        ],
      }),
    ),
    base = widgetNote(note);
  await applyWidgetAction(
    e,
    action({
      type: "edit_note",
      note_id: note.id,
      base,
      patch: { preview: base.preview.replace("old", "new"), color: "c" },
    }),
    now,
  );
  expect(e.notes.get(note.id)).toMatchObject({
    tags: ["keep"],
    color: "c",
    pinnedToWidget: true,
  });
  expect(noteBodyText(e.notes.get(note.id)!.body)).toBe(
    "new " + "x".repeat(1000),
  );
  e.dispose();
});
it("rejects stale or trashed note edits and retains the current note", async () => {
  const e = engine(),
    note = e.notes.upsert(makeNote({ title: "Old" })),
    base = widgetNote(note);
  e.notes.upsert({ ...note, title: "Desktop edit" });
  const result = await applyWidgetAction(
    e,
    action({
      type: "edit_note",
      note_id: note.id,
      base,
      patch: { title: "Widget edit" },
    }),
    now,
  );
  expect(result?.error).toContain("draft is kept");
  expect(e.notes.get(note.id)?.title).toBe("Desktop edit");
  e.notes.upsert({ ...e.notes.get(note.id)!, trashedAt: now.toISOString() });
  expect(
    (
      await applyWidgetAction(
        e,
        action({
          type: "edit_note",
          note_id: note.id,
          base,
          patch: { color: "b" },
        }),
        now,
      )
    )?.error,
  ).toContain("removed");
  e.dispose();
});
it("saves new Diary lines with mood 3, preserves existing mood/body/tags and rejects stale same-date changes", async () => {
  const e = engine();
  await applyWidgetAction(
    e,
    action({
      type: "diary_line",
      date: "2026-10-23",
      line: "First line",
      baseLine: null,
    }),
    now,
  );
  const first = e.diaryEntries.getSnapshot()[0];
  expect(first.mood).toBe(3);
  e.diaryEntries.upsert({
    ...first,
    mood: 5,
    body: "Keep body",
    tags: ["keep"],
  });
  await applyWidgetAction(
    e,
    action({
      type: "diary_line",
      date: first.date,
      line: "Edited line",
      baseLine: first.oneLine,
    }),
    now,
  );
  expect(e.diaryEntries.getSnapshot()).toHaveLength(1);
  expect(e.diaryEntries.get(first.id)).toMatchObject({
    mood: 5,
    body: "Keep body",
    tags: ["keep"],
    oneLine: "Edited line",
  });
  expect(
    (
      await applyWidgetAction(
        e,
        action({
          type: "diary_line",
          date: first.date,
          line: "Stale",
          baseLine: first.oneLine,
        }),
        now,
      )
    )?.error,
  ).toContain("changed");
  // Queued yesterday is still yesterday when the desktop opens after midnight.
  await applyWidgetAction(
    e,
    action({
      type: "diary_line",
      date: "2026-10-22",
      line: "Yesterday",
      baseLine: null,
    }),
    now,
  );
  expect(e.diaryEntries.getSnapshot().map((d) => d.date)).toEqual([
    first.date,
    "2026-10-22",
  ]);
  e.dispose();
});
it("validates lengths, dates, colours and owning account before local writes", async () => {
  const e = engine(),
    a = action({
      type: "quick_note",
      text: "Other account",
      user_id: OTHER_USER,
    });
  expect(await applyWidgetAction(e, a, now)).toBeNull();
  expect(widgetReceipts(e)).toEqual([]);
  for (const patch of [
    { type: "diary_line", date: "2026-10-24", line: "Future", baseLine: null },
    {
      type: "diary_line",
      date: "2026-10-23",
      line: "🌿".repeat(121),
      baseLine: null,
    },
    { type: "quick_note", text: " " },
  ])
    expect(
      (await applyWidgetAction(e, action(patch), now))?.error,
    ).toBeTruthy();
  expect(e.notes.getSnapshot()).toEqual([]);
  expect(e.diaryEntries.getSnapshot()).toEqual([]);
  e.dispose();
});
it("commits collection + queue + receipt in IndexedDB before acknowledging, including restart deduplication", async () => {
  const factory = new IDBFactory(),
    legacy = { getItem: () => null, removeItem: () => {} },
    store = await IndexedDbStore.create(USER, { factory, legacy });
  const e = new PlannerSync({
    userId: USER,
    store,
    remotes: null,
    currentUserId: () => USER,
  });
  e.load();
  const goal = e.goals.upsert(makeGoal({ date: "2026-10-23" }));
  const a = action({ type: "toggle_goal", goal_id: goal.id });
  await applyWidgetAction(e, a, now);
  e.dispose();
  await store.close();
  const loadedStore = await IndexedDbStore.create(USER, { factory, legacy });
  const loaded = new PlannerSync({
    userId: USER,
    store: loadedStore,
    remotes: null,
    currentUserId: () => USER,
  });
  loaded.load();
  await applyWidgetAction(loaded, a, now);
  expect(loaded.goals.get(goal.id)?.completed).toBe(true);
  expect(widgetReceipts(loaded).map((r) => r.id)).toContain(a.id);
  loaded.dispose();
  await loadedStore.close();
});
it("does not acknowledge an action when the real IndexedDB transaction fails", async () => {
  const store = await IndexedDbStore.create(USER, {
    factory: new IDBFactory(),
    legacy: { getItem: () => null, removeItem: () => {} },
  });
  const e = new PlannerSync({
    userId: USER,
    store,
    remotes: null,
    currentUserId: () => USER,
  });
  e.load();
  await store.close();
  const a = action({ type: "quick_note", text: "Retain this" });
  await expect(applyWidgetAction(e, a, now)).rejects.toThrow();
  expect(e.notes.getSnapshot()[0].title).toBe("Retain this");
  expect(e.getStatus().storageError).toBe(true);
  e.dispose();
});

it("accepts the previously acknowledged text prefix while another autosave is being typed, preserving the unseen tail", async () => {
  const e = engine(),
    note = e.notes.upsert(
      makeNote({
        body: [
          {
            id: "p",
            type: "paragraph",
            content: [{ type: "text", text: "x".repeat(1000) + "TAIL" }],
          },
        ],
      }),
    );
  const original = widgetNote(note),
    first = "New " + "y".repeat(1200);
  await applyWidgetAction(
    e,
    action({
      type: "edit_note",
      note_id: note.id,
      base: original,
      patch: { preview: first },
    }),
    now,
  );
  await applyWidgetAction(
    e,
    action({
      type: "edit_note",
      note_id: note.id,
      base: { ...original, preview: first },
      patch: { preview: first + " more" },
    }),
    now,
  );
  expect(noteBodyText(e.notes.get(note.id)!.body)).toBe(
    first + " more" + "x".repeat(200) + "TAIL",
  );
  e.dispose();
});
