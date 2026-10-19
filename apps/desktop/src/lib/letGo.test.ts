import { describe, expect, it } from "vitest";
import { LetGoStore } from "@/lib/letGo";

/** A fake toast that hands its callbacks to the test, and a manual scheduler. */
function harness() {
  const store = new LetGoStore();
  const deleted: string[] = [];
  const toasts: { onUndo: () => void; onClosed: () => void }[] = [];
  const timers: (() => void)[] = [];
  const letGo = (id: string) =>
    store.letGo(id, {
      deleteGoal: (x) => deleted.push(x),
      toast: { show: (cb) => toasts.push(cb) },
      schedule: (fn) => timers.push(fn),
    });
  const runTimers = () => { while (timers.length) timers.shift()!(); };
  return { store, deleted, toasts, letGo, runTimers };
}

describe("LetGoStore", () => {
  it("hides the goal while the toast is up and deletes after it closes", () => {
    const h = harness();
    h.letGo("g");
    expect(h.store.getHidden().has("g")).toBe(true);
    h.toasts[0].onClosed();
    expect(h.deleted).toEqual([]); // still within the grace period
    h.runTimers();
    expect(h.deleted).toEqual(["g"]);
    expect(h.store.getHidden().has("g")).toBe(false);
  });

  it("Undo keeps the goal and shows it again at once", () => {
    const h = harness();
    h.letGo("g");
    h.toasts[0].onUndo();
    expect(h.store.getHidden().has("g")).toBe(false);
    h.toasts[0].onClosed();
    h.runTimers();
    expect(h.deleted).toEqual([]);
  });

  it("keeps the goal when the toast reports 'closed' BEFORE the Undo handler runs", () => {
    // What WebView2 did with a real click: dismiss first, then the action.
    const h = harness();
    h.letGo("g");
    h.toasts[0].onClosed();
    h.toasts[0].onUndo();
    h.runTimers();
    expect(h.deleted).toEqual([]);
    expect(h.store.stateOf("g")).toBeUndefined();
  });

  it("closed callbacks firing twice delete only once", () => {
    const h = harness();
    h.letGo("g");
    h.toasts[0].onClosed();
    h.toasts[0].onClosed();
    h.runTimers();
    expect(h.deleted).toEqual(["g"]);
  });

  it("a stale callback from an earlier toast can't delete during a new undo window", () => {
    const h = harness();
    h.letGo("g");
    h.toasts[0].onUndo(); // kept
    h.letGo("g"); // let it go again: a new toast
    h.toasts[0].onClosed(); // the first toast closes late
    h.runTimers();
    expect(h.deleted).toEqual([]);
    expect(h.store.getHidden().has("g")).toBe(true);
    h.toasts[1].onUndo();
    h.toasts[1].onClosed();
    h.runTimers();
    expect(h.deleted).toEqual([]);
  });

  it("letting go twice while pending shows one toast", () => {
    const h = harness();
    h.letGo("g");
    h.letGo("g");
    expect(h.toasts).toHaveLength(1);
  });
});
