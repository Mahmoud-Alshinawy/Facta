import { afterEach, describe, expect, it } from "vitest";
import { makeNote, makeDiary, CONTENT_TIME as T } from "@/test/contentFixtures";
import { setup, USER } from "@/test/harness";
import {
  noteFromRow,
  noteToRow,
  diaryFromRow,
  diaryToRow,
  eventToRow,
  eventFromRow,
  type NoteRow,
  type DiaryRow,
} from "./mappers";
import { mergePulled } from "./merge";
import { decideSyncToast } from "./toastPolicy";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
});
const context = () => {
  const h = setup();
  cleanup.push(() => h.engine.dispose());
  return h;
};
const noteRow = (note = makeNote(), deleted: string | null = null): NoteRow =>
  ({ ...noteToRow(note, USER, T, deleted), created_at: T }) as NoteRow;
const diaryRow = (
  entry = makeDiary(),
  updated = T,
  deleted: string | null = null,
): DiaryRow =>
  ({ ...diaryToRow(entry, USER, updated, deleted), created_at: T }) as DiaryRow;

describe("notes and diary mappers", () => {
  it("allows null and 50-character fonts, rejecting 51 Unicode characters", () => {
    expect(noteRow(makeNote()).font).toBeNull();
    expect(noteRow(makeNote({ font: "🙂".repeat(50) })).font).toBe(
      "🙂".repeat(50),
    );
    expect(() => noteRow(makeNote({ font: "🙂".repeat(51) }))).toThrow("50");
    expect(() => noteFromRow({ ...noteRow(), font: "x".repeat(51) })).toThrow(
      "50",
    );
  });
  it("caps derived links at 500 unique note IDs, before writing any local state", () => {
    const content = Array.from({ length: 501 }, () => ({
      type: "noteLink" as const,
      noteId: crypto.randomUUID(),
      label: "Reference",
    }));
    const body = [{ id: "references", type: "paragraph" as const, content }];
    const valid = makeNote({
      body: [{ ...body[0], content: content.slice(0, 500) }],
    });
    expect(noteRow(valid).links).toHaveLength(500);
    expect(() => noteRow(makeNote({ body }))).toThrow("500");
    const h = context();
    expect(() => h.engine.notes.upsert(makeNote({ body }))).toThrow("500");
    expect(h.engine.notes.getSnapshot()).toEqual([]);
    expect(h.engine.getStatus().pending).toBe(0);
    // Repeated references count once; stale metadata never supplies stored links.
    expect(
      noteRow(
        makeNote({
          body: [{ ...body[0], content: Array(501).fill(content[0]) }],
          links: content.map((link) => link.noteId),
        }),
      ).links,
    ).toEqual([content[0].noteId]);
  });
  it("round-trips every note field and derives UUID links instead of trusting metadata", () => {
    const linked = crypto.randomUUID();
    const note = makeNote({
      title: "  Plan  ",
      pinned: true,
      pinnedToWidget: true,
      color: "c",
      tags: ["uni"],
      font: "Source Serif 4",
      align: "justify",
      trashedAt: T,
      body: [
        {
          id: "heading",
          type: "heading",
          level: 2,
          content: [
            {
              type: "text",
              text: "Read ",
              marks: [{ type: "bold" }, { type: "italic" }],
            },
            { type: "noteLink", noteId: linked, label: "Reference" },
          ],
        },
      ],
      links: ["stale"],
      updatedAt: T,
    });
    expect(noteFromRow(noteRow(note))).toEqual({
      ...note,
      title: "Plan",
      links: [linked],
    });
    expect(
      noteToRow(makeNote({ title: "   " }), USER, T, null).title,
    ).toBeNull();
    expect(noteRow(note)).toMatchObject({ trashed_at: T, deleted_at: null });
  });
  it("round-trips diary fields and counts Unicode characters rather than UTF-16 units", () => {
    const entry = makeDiary({
      oneLine: "🙂".repeat(120),
      mood: 5,
      tags: ["home"],
      body: "More detail",
      updatedAt: T,
    });
    expect(diaryFromRow(diaryRow(entry))).toEqual(entry);
    expect(() =>
      diaryToRow({ ...entry, oneLine: "🙂".repeat(121) }, USER, T, null),
    ).toThrow("120");
    expect(() =>
      diaryToRow({ ...entry, date: "2026-02-30" }, USER, T, null),
    ).toThrow("date");
    expect(() =>
      diaryToRow({ ...entry, mood: 6 as never }, USER, T, null),
    ).toThrow("mood");
  });
  it("round-trips inclusive event end dates and preserves old same-day records", () => {
    const event = {
      id: crypto.randomUUID(),
      title: "Trip",
      date: "2026-10-22",
      endDate: "2026-10-25",
      startTime: "10:00",
      endTime: "12:00",
      color: "blue" as const,
    };
    const row = { ...eventToRow(event, USER, T, null), created_at: T };
    expect(row.end_date).toBe("2026-10-25");
    expect(eventFromRow(row as never).endDate).toBe("2026-10-25");
    expect(
      eventFromRow({ ...row, end_date: null } as never).endDate,
    ).toBeUndefined();
    expect(eventToRow({...event,endDate:undefined},USER,T,null).end_date).toBeNull();
    expect(()=>eventToRow({...event,endDate:"2026-10-21"},USER,T,null)).toThrow("End date");
    expect(()=>eventToRow({...event,endDate:"2026-02-30"},USER,T,null)).toThrow("End date");
  });
});

describe("note collection and merge rules", () => {
  it("syncs Trash as a restorable edit, while a permanent tombstone always wins", async () => {
    const h = context();
    const note = h.engine.notes.upsert(makeNote());
    await h.engine.syncNow();
    h.clock.advance(1000);
    h.engine.notes.upsert({ ...note, trashedAt: T });
    await h.engine.syncNow();
    expect(h.server.notes.rows.get(note.id)).toMatchObject({
      trashed_at: T,
      deleted_at: null,
    });
    h.clock.advance(1000);
    h.engine.notes.upsert({ ...h.engine.notes.get(note.id)!, trashedAt: null });
    await h.engine.syncNow();
    expect(h.engine.notes.get(note.id)?.trashedAt).toBeNull();
    h.engine.notes.remove(note.id);
    await h.engine.syncNow();
    expect(h.server.notes.rows.get(note.id)?.deleted_at).not.toBeNull();
    expect(h.engine.notes.get(note.id)).toBeUndefined();
  });
  it("rejects invalid bodies before changing the cache or queue", () => {
    const h = context();
    expect(() =>
      h.engine.notes.upsert(makeNote({ body: {} as never })),
    ).toThrow("array");
    expect(h.engine.notes.getSnapshot()).toEqual([]);
    expect(h.engine.getStatus().pending).toBe(0);
  });
  it("keeps a held local edit, accepts a server tie, and never resurrects a tombstone", () => {
    const local = makeNote({ updatedAt: T, title: "Local" });
    const remote = noteRow({ ...local, title: "Server" });
    const options = {
      isHeld: () => false,
      fromRow: noteFromRow,
      localOnly: [],
    };
    expect(mergePulled([local], [remote], options).records[0].title).toBe(
      "Server",
    );
    expect(
      mergePulled([local], [remote], { ...options, isHeld: () => true })
        .records[0].title,
    ).toBe("Local");
    expect(
      mergePulled([local], [{ ...remote, deleted_at: T }], {
        ...options,
        isHeld: () => true,
      }).records,
    ).toEqual([]);
  });
});

describe("same-date diary reconciliation in the real client collection", () => {
  it("gives a replacement a later edit time than its queued date tombstone", () => {
    const h = context();
    const original = h.engine.diaryEntries.upsert(makeDiary());
    h.engine.diaryEntries.remove(original.id);
    const deleted = Object.values(h.queueData().pending.diary_entries)[0] as {
      updated_at: string;
    };
    const replacement = h.engine.diaryEntries.upsert(
      makeDiary({ oneLine: "Written again" }),
    );
    expect(replacement.id).not.toBe(original.id);
    expect(Date.parse(replacement.updatedAt!)).toBeGreaterThan(
      Date.parse(deleted.updated_at),
    );
  });
  it("keeps one local occurrence per date and prevents moving an entry's date", () => {
    const h = context(),
      first = h.engine.diaryEntries.upsert(makeDiary());
    const second = h.engine.diaryEntries.upsert(
      makeDiary({ oneLine: "Revised", mood: 4 }),
    );
    expect(second.id).toBe(first.id);
    expect(h.engine.diaryEntries.getSnapshot()).toHaveLength(1);
    expect(() =>
      h.engine.diaryEntries.upsert({ ...second, date: "2026-10-23" }),
    ).toThrow("cannot change");
  });
  it("adopts the canonical server ID and all winning fields, settling the submitted duplicate UUID", async () => {
    const h = context();
    const local = h.engine.diaryEntries.upsert(
      makeDiary({ oneLine: "Device B" }),
    );
    const canonical = diaryRow(
      makeDiary({
        oneLine: "Device A",
        mood: 5,
        body: "Winning body",
        tags: ["a"],
      }),
    );
    h.server.remotes.diary_entries.upsert = async () => ({
      ok: true,
      data: [canonical],
    });
    await h.engine.flush();
    expect(h.engine.diaryEntries.getSnapshot()).toEqual([
      diaryFromRow(canonical),
    ]);
    expect(h.engine.diaryEntries.get(local.id)?.id).toBe(canonical.id);
    expect(h.engine.getStatus().pending).toBe(0);
    expect(h.serverWon).toContain("diary_entries:changed");
  });
  it("preserves a newer edit made while a duplicate UUID is being reconciled, including across restart", async () => {
    const h = context();
    const local = h.engine.diaryEntries.upsert(makeDiary());
    let release!: () => void, arrived!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const canonical = diaryRow(
      makeDiary({ oneLine: "Server before edit" }),
      local.updatedAt,
    );
    h.server.remotes.diary_entries.upsert = async () => {
      arrived();
      await waiting;
      return { ok: true, data: [canonical] };
    };
    const flushing = h.engine.flush();
    await started;
    h.clock.advance(1000);
    h.engine.diaryEntries.upsert({
      ...local,
      oneLine: "Newer local edit",
      mood: 4,
      tags: ["new"],
    });
    release();
    await flushing;
    expect(h.engine.diaryEntries.getSnapshot()[0]).toMatchObject({
      id: canonical.id,
      oneLine: "Newer local edit",
      mood: 4,
    });
    expect(h.queueData().pending.diary_entries[canonical.id].one_line).toBe(
      "Newer local edit",
    );
    expect(h.queueData().pending.diary_entries[local.id]).toBeUndefined();
    h.engine.dispose();
    const restarted = setup({ store: h.store });
    cleanup.push(() => restarted.engine.dispose());
    expect(restarted.engine.diaryEntries.getSnapshot()[0]).toMatchObject({
      id: canonical.id,
      oneLine: "Newer local edit",
    });
    expect(restarted.engine.getStatus().pending).toBe(1);
  });
  it("drops queued edits when the canonical day was permanently deleted", async () => {
    const h = context();
    h.engine.diaryEntries.upsert(makeDiary());
    const tombstone = diaryRow(makeDiary(), T, T);
    h.server.remotes.diary_entries.upsert = async () => ({
      ok: true,
      data: [tombstone],
    });
    await h.engine.flush();
    expect(h.engine.diaryEntries.getSnapshot()).toEqual([]);
    expect(h.engine.getStatus().pending).toBe(0);
  });
});

it("uses a persistent storage-error toast rather than claiming edits are saved", () => {
  const decision = decideSyncToast(null, {
    state: "error",
    failed: 2,
    pending: 1,
    lastError: "Device storage is full; edits are in memory",
    lastSyncedAt: null,
    storageError: true,
  });
  expect(decision.show?.id).toBe("sync-storage");
  expect(
    decideSyncToast(decision.shown, {
      state: "local-only",
      failed: 0,
      pending: 1,
      lastError: null,
      lastSyncedAt: null,
    }).clear,
  ).toBe(true);
});
