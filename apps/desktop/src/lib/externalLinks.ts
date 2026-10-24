/** Shared by every note-link action; never pass arbitrary URI schemes to the OS. */
export function externalNoteUrl(value: string): string | null {
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return null;
  try {
    const url = new URL(value.trim());
    return ["http:", "https:", "mailto:"].includes(url.protocol)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export async function openExternalNoteLink(value: string): Promise<void> {
  const url = externalNoteUrl(value);
  if (!url) throw new Error("Use an https, http or mailto link.");
  if ("__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_note_link", { url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
