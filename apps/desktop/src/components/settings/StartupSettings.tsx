import { useEffect, useState } from "react";

const isDesktop = () =>
  typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

export default function StartupSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const desktop = isDesktop();

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<boolean>("get_start_with_windows"))
      .then((value) => {
        if (active) setEnabled(value);
      })
      .catch(() => {
        if (active) setError("Could not read Windows startup settings.");
      });
    return () => {
      active = false;
    };
  }, [desktop]);

  async function change(next: boolean) {
    setBusy(true);
    setEnabled(next);
    setError("");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const actual = await invoke<boolean>("set_start_with_windows", {
        enabled: next,
      });
      setEnabled(actual);
      if (actual !== next)
        setError("Windows did not apply the startup setting.");
    } catch {
      setError("Could not change Windows startup settings. Please try again.");
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        setEnabled(await invoke<boolean>("get_start_with_windows"));
      } catch {
        setEnabled(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="settings-card settings-stack"
      aria-label="Windows startup"
    >
      <label className="flex items-center justify-between gap-4">
        <span>
          <strong>Start Facta when Windows starts</strong>
          <span className="block text-sm text-subtle">
            Also starts your widgets when available.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={enabled ?? false}
          disabled={!desktop || enabled === null || busy}
          onChange={(event) => void change(event.target.checked)}
        />
      </label>
      {!desktop && <p>Available in the Windows app.</p>}
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
