// read_shared_data is polymorphic-safe: returns null when the file on disk is
// not strictly newer than the last snapshot applied here, so late/out-of-order
// reads can never revert widget state (e.g. resurrect deleted tasks).

/** Shape of widgets.json as written by the planner's export_data_for_widgets. */
export interface SharedData {
  goals?: unknown[];
  events?: unknown[];
  config?: { widgets?: unknown[] };
  exported_at_ms?: number;
}

let lastSeenMs = 0;

export async function readSharedDataFresh(): Promise<SharedData | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const data = await invoke<SharedData>("read_shared_data");
    const ms = Number(data?.exported_at_ms ?? 0);
    if (ms <= lastSeenMs) {
      return null;
    }
    lastSeenMs = ms;
    return data;
  } catch (e) {
    console.warn("[Widget] read_shared_data failed:", e);
    return null;
  }
}
