import { useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { chooseTheme } from "@/lib/theme";
import CalendarSettings from "../CalendarSettings";
import WidgetManager from "../WidgetManager";
import ThemeCards from "./ThemeCards";
import InlineConfirm from "./InlineConfirm";

const TABS = ["Widgets", "Appearance", "Account"] as const;
export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Widgets");
  const [confirmOut, setConfirmOut] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const tabList = useRef<HTMLDivElement>(null),
    outButton = useRef<HTMLButtonElement>(null);
  const theme = useTheme(),
    { user, signOut } = useAuth();
  function cancelOut() {
    setConfirmOut(false);
    requestAnimationFrame(() => outButton.current?.focus());
  }
  async function doSignOut() {
    setBusy(true);
    setError("");
    try {
      await signOut();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not sign out. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-page">
      <header className="settings-header">
        <h1>Settings</h1>
        <div
          ref={tabList}
          role="tablist"
          aria-label="Settings sections"
          onKeyDown={(e) => {
            const direction =
              e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!direction && e.key !== "Home" && e.key !== "End") return;
            e.preventDefault();
            const index =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? TABS.length - 1
                  : (TABS.indexOf(tab) + direction + TABS.length) % TABS.length;
            setTab(TABS[index]);
            setConfirmOut(false);
            tabList.current
              ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
              [index]?.focus();
          }}
        >
          {TABS.map((name) => (
            <button
              type="button"
              key={name}
              id={`settings-${name}`}
              role="tab"
              aria-selected={name === tab}
              aria-controls="settings-panel"
              tabIndex={tab === name ? 0 : -1}
              onClick={() => {
                setTab(name);
                setConfirmOut(false);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </header>
      <div
        className="settings-content"
        id="settings-panel"
        role="tabpanel"
        aria-labelledby={`settings-${tab}`}
        tabIndex={0}
      >
        <div className="settings-content-inner">
          {tab === "Widgets" && <WidgetManager />}
          {tab === "Appearance" && (
            <>
              <section
                className="settings-card settings-stack"
                aria-labelledby="settings-theme"
              >
                <div>
                  <h2 id="settings-theme">Theme</h2>
                  <p>Changes the whole app. Widgets keep their own theme.</p>
                </div>
                <ThemeCards value={theme} onChange={chooseTheme} />
              </section>
              <CalendarSettings />
            </>
          )}
          {tab === "Account" && (
            <section
              className="settings-card account-card"
              aria-labelledby="settings-account"
            >
              <span
                className="settings-symbol account-symbol"
                aria-hidden="true"
              >
                <UserRound size={24} />
              </span>
              <div className="settings-grow">
                <h2 id="settings-account">Account</h2>
                <p className="mono">{user?.email}</p>
              </div>
              {confirmOut ? (
                <InlineConfirm
                  question="Sign out of Facta?"
                  keep="Stay"
                  commit="Sign out"
                  onCancel={cancelOut}
                  onConfirm={() => void doSignOut()}
                  busy={busy}
                />
              ) : (
                <button
                  ref={outButton}
                  type="button"
                  className="b b-del"
                  onClick={() => setConfirmOut(true)}
                >
                  <LogOut size={16} aria-hidden="true" />
                  Sign out
                </button>
              )}
              {error && (
                <p className="settings-error" role="alert">
                  {error}
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
