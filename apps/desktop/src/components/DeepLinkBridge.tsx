import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { appLinks, parseFactaLink } from "@/lib/sharedGoals/deepLinks";
/** Lives above the storage gate, so sign-in/opening IndexedDB cannot drop an
 * incoming invitation. No URL/body is logged or persisted. */
export default function DeepLinkBridge() {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading) appLinks.bindAccount(user?.id ?? null);
  }, [loading, user?.id]);
  useEffect(() => {
    let cancelled = false,
      unsub: (() => void) | undefined;
    const process = async (raw: string) => {
      const link = parseFactaLink(raw);
      if (!link || cancelled) return;
      if (link.kind === "auth" || link.kind === "auth-code") {
        const result =
          link.kind === "auth"
            ? await supabase.auth.setSession({
                access_token: link.accessToken,
                refresh_token: link.refreshToken,
              })
            : await supabase.auth.exchangeCodeForSession(link.code);
        if (result.error && !cancelled)
          toast.error("Sign-in could not be completed. Try signing in again.");
      } else if (link.kind === "auth-error")
        toast.error("Sign-in could not be completed. Try signing in again.");
      else appLinks.receive(link);
      if ((window as any).__TAURI_INTERNALS__)
        void import("@tauri-apps/api/window")
          .then(({ getCurrentWindow }) => {
            const w = getCurrentWindow();
            void w.show();
            void w.setFocus();
          })
          .catch(() => {});
    };
    const browserCallback = `facta://auth/callback${window.location.search}${window.location.hash}`;
    const callback = parseFactaLink(browserCallback);
    if (
      callback &&
      ["auth", "auth-code", "auth-error"].includes(callback.kind)
    ) {
      window.history.replaceState({}, document.title, window.location.pathname);
      void process(browserCallback);
    }
    if ((window as any).__TAURI_INTERNALS__)
      void (async () => {
        try {
          const { onOpenUrl, getCurrent } =
            await import("@tauri-apps/plugin-deep-link");
          const off = await onOpenUrl((urls) => {
            for (const raw of urls) void process(raw);
          });
          if (cancelled) {
            off();
            return;
          }
          unsub = off;
          for (const raw of (await getCurrent()) ?? []) void process(raw);
        } catch {
          /* Plugin absent in browser previews. */
        }
      })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);
  return null;
}
