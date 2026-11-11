import { createRoot } from "react-dom/client";
import App from "./App";
import DeepLinkBridge from "./components/DeepLinkBridge";
import UpdateBar from "./components/UpdateBar";
import { Toaster } from "sonner";
import { AuthProvider } from "@/hooks/useAuth";
import { SyncProvider } from "@/hooks/useSync";
import { GoalsProvider } from "@/hooks/useGoals";
import { EventsProvider } from "@/hooks/useEvents";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { installNativeQuit } from "@/lib/nativeQuit";
// Latin font files are self-hosted; other scripts fall back to system fonts.
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
// Existing notes can explicitly select Geist or Geist Mono.
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist/latin-700.css";
import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist-mono/latin-500.css";
import "./index.css";

function renderApp() {
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <AuthProvider>
        <DeepLinkBridge />
        <Toaster richColors position="bottom-right" />
        <UpdateBar />
        <SyncProvider>
          <GoalsProvider>
            <EventsProvider>
              <App />
            </EventsProvider>
          </GoalsProvider>
        </SyncProvider>
      </AuthProvider>
    </ErrorBoundary>,
  );
}

void installNativeQuit()
  .catch((error) => console.error("[Facta] Quit listener failed", error))
  .then(renderApp);
