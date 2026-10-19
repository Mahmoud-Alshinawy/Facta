// "Let it go" for an overdue goal: hide it behind an Undo toast and delete it
// only after the toast has closed and Undo wasn't pressed.
//
// Deletes are final on the server, so the order of toast callbacks must not
// matter. In WebView2 a real click on Undo was seen to close the toast (and
// run its dismiss callback) before the Undo handler ran. So the outcome isn't
// a flag inside the callbacks: Undo records "kept" in this store, and the
// delete path waits a short grace period and then checks the store.

export type LetGoState = "pending" | "kept";

export interface LetGoToast {
  /** Shows the toast. Must call onUndo when Undo is pressed and onClosed when it closes for any reason. */
  show(opts: { onUndo: () => void; onClosed: () => void }): void;
}

export interface LetGoOptions {
  deleteGoal: (id: string) => void;
  toast: LetGoToast;
  /** How long after the toast closes to wait for a late Undo. */
  graceMs?: number;
  schedule?: (fn: () => void, ms: number) => void;
}

export const LET_GO_GRACE_MS = 600;

interface Entry {
  state: LetGoState;
  /** Which "Let it go" this entry belongs to; stale toast callbacks are ignored. */
  attempt: number;
}

export class LetGoStore {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private hiddenSnapshot: ReadonlySet<string> = new Set();
  private attempts = 0;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };

  /** Goals hidden right now (pending, not kept). */
  getHidden = (): ReadonlySet<string> => this.hiddenSnapshot;

  stateOf(id: string): LetGoState | undefined {
    return this.entries.get(id)?.state;
  }

  letGo(id: string, opts: LetGoOptions): void {
    if (this.entries.get(id)?.state === "pending") return; // already waiting
    const schedule = opts.schedule ?? ((fn, ms) => { setTimeout(fn, ms); });
    const attempt = ++this.attempts;
    const mine = () => this.entries.get(id)?.attempt === attempt;
    this.set(id, { state: "pending", attempt });
    opts.toast.show({
      onUndo: () => {
        // Kept, whatever the toast does next.
        if (mine()) this.set(id, { state: "kept", attempt });
      },
      onClosed: () => {
        schedule(() => {
          if (!mine()) return;
          const state = this.entries.get(id)?.state;
          this.set(id, undefined);
          if (state === "pending") opts.deleteGoal(id);
        }, opts.graceMs ?? LET_GO_GRACE_MS);
      },
    });
  }

  private set(id: string, entry: Entry | undefined): void {
    if (entry) this.entries.set(id, entry);
    else this.entries.delete(id);
    this.hiddenSnapshot = new Set([...this.entries].filter(([, e]) => e.state === "pending").map(([k]) => k));
    for (const l of this.listeners) l();
  }
}
