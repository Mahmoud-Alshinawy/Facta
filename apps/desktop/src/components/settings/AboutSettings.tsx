import { useEffect, useState } from "react";
import type { UpdateStatus } from "@/lib/updates";

const isDesktop = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Settings → About: the version and a manual "Check for updates". */
export default function AboutSettings() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const desktop = isDesktop();

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<UpdateStatus>("update_status"))
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [desktop]);

  async function check() {
    setChecking(true);
    setMessage("");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const next = await invoke<UpdateStatus>("check_for_updates");
      setStatus(next);
      setMessage(
        next.state === "idle"
          ? "Facta is up to date."
          : `Version ${next.version} is ready. Restart to install it.`,
      );
    } catch {
      setMessage("Could not check for updates. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="settings-card settings-stack" aria-label="About Facta">
      <div className="flex items-center justify-between gap-4">
        <div>
          <strong>Facta</strong>
          <span className="block text-sm text-subtle">
            {status ? `Version ${status.current}` : desktop ? "Version …" : "Web preview"}
          </span>
        </div>
        <button
          type="button"
          className="b b-sec"
          disabled={!desktop || checking}
          onClick={() => void check()}
        >
          {checking ? "Checking…" : "Check for updates"}
        </button>
      </div>
      <p className="text-sm text-subtle">
        Facta checks for updates in the background and asks before installing.
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
