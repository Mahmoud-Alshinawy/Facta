import { expect, it } from "vitest";
import { PlannerSync } from "./sync/engine";
import { memoryStore } from "./sync/storage";
import { makeNote } from "@/test/contentFixtures";
import { USER } from "@/test/harness";
import { widgetNote } from "./widgetJournal";
import { applyWidgetAction, widgetReceipts } from "./widgetActions";
import { noteBodyText } from "./noteBody";
import {
  readStickyDraft,
  sameStickyFields,
  stickySaveAction,
  type StickySave,
} from "../../../widgets/src/lib/stickyDraft";

it("replays a recovered Sticky edit with its original receipt after both apps restart", async () => {
  const store = memoryStore();
  const create = () => {
    const engine = new PlannerSync({
      userId: USER,
      store,
      remotes: null,
      currentUserId: () => USER,
    });
    engine.load();
    return engine;
  };
  const first = create();
  const note = first.notes.upsert(
    makeNote({
      title: "Before",
      body: [
        {
          id: "p",
          type: "paragraph",
          content: [{ type: "text", text: "abcdef" }],
        },
      ],
    }),
  );
  const base = widgetNote(note);
  const attempt: StickySave = {
    id: crypto.randomUUID(),
    base,
    values: { title: "After", preview: "abc", color: "c" },
  };
  // Typing can continue beyond the snapshot which is already in the native file.
  const recovery = JSON.stringify({
    ...attempt.values,
    title: "After typing more",
    base,
    attempt,
  });
  const action = {
    ...stickySaveAction(note.id, attempt),
    id: attempt.id,
    user_id: USER,
  };
  await applyWidgetAction(first, action);
  first.dispose();
  const restarted = create();
  const saved = restarted.notes.get(note.id)!;
  const recovered = readStickyDraft(recovery, widgetNote(saved));
  expect(recovered.title).toBe("After typing more");
  expect(recovered.attempt?.id).toBe(action.id);
  expect(
    await applyWidgetAction(restarted, {
      ...stickySaveAction(note.id, recovered.attempt!),
      id: recovered.attempt!.id,
      user_id: USER,
    }),
  ).toEqual({ id: action.id });
  expect(widgetReceipts(restarted)).toHaveLength(1);
  expect(noteBodyText(restarted.notes.get(note.id)!.body)).toBe("abc");
  expect(restarted.notes.get(note.id)?.title).toBe("After");
  expect(sameStickyFields(recovered, recovered.attempt!.values)).toBe(false);
  // The newer typing saves against the acknowledged fields with a fresh identity.
  const next: StickySave = {
    id: crypto.randomUUID(),
    base: recovered.attempt!.values,
    values: recovered,
  };
  expect(
    await applyWidgetAction(restarted, {
      ...stickySaveAction(note.id, next),
      id: next.id,
      user_id: USER,
    }),
  ).toEqual({ id: next.id });
  expect(restarted.notes.get(note.id)?.title).toBe("After typing more");
  expect(noteBodyText(restarted.notes.get(note.id)!.body)).toBe("abc");
  restarted.dispose();
});

it("accepts old recovery drafts but ignores malformed or another note's saved attempt", () => {
  const note = widgetNote(makeNote());
  const draft = { ...note, base: note };
  expect(readStickyDraft(JSON.stringify(draft), note).attempt).toBeNull();
  for (const raw of [
    "broken",
    JSON.stringify({ ...draft, base: { ...note, id: "other" } }),
    JSON.stringify({ ...draft, attempt: { id: "invalid" } }),
  ])
    expect(readStickyDraft(raw, note)).toEqual({
      title: note.title,
      preview: note.preview,
      color: note.color,
      base: note,
      attempt: null,
    });
});
