import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "@/hooks/useAuth";
import { SyncProvider } from "@/hooks/useSync";
import { GoalsProvider } from "@/hooks/useGoals";
import { EventsProvider } from "@/hooks/useEvents";
import { ErrorBoundary } from "@/components/ErrorBoundary";
// Latin only: Geist has no Arabic, so other scripts fall back to system fonts anyway.
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist/latin-700.css";
import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist-mono/latin-500.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <AuthProvider>
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
