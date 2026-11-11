/** Mirrors `UpdateStatus` in src-tauri/src/updater.rs. */
export type UpdateStatus = {
  state: "idle" | "ready" | "installing";
  version: string | null;
  current: string;
};

/**
 * The bar shows only while Facta's window is on screen, so a login start that
 * stays hidden in the tray shows nothing until the window is opened. "Later"
 * hides it for that version until the next app start; a newer version shows
 * it again.
 */
export function shouldShowUpdateBar(
  status: UpdateStatus | null,
  dismissedVersion: string | null,
  windowVisible: boolean,
): boolean {
  if (!status || !windowVisible) return false;
  if (status.state === "installing") return true;
  return (
    status.state === "ready" &&
    !!status.version &&
    status.version !== dismissedVersion
  );
}

export function updateBarText(
  status: UpdateStatus,
  phase: "idle" | "widgets" | "installing",
): string {
  if (phase === "widgets") return "Updating the widgets…";
  if (phase === "installing" || status.state === "installing")
    return "Installing the update…";
  return "Update ready, restart to install";
}
