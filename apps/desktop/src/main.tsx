import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "@/hooks/useAuth";
import { GoalsProvider } from "@/hooks/useGoals";
import { EventsProvider } from "@/hooks/useEvents";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <AuthProvider>
      <GoalsProvider>
        <EventsProvider>
          <App />
        </EventsProvider>
      </GoalsProvider>
    </AuthProvider>
  </ErrorBoundary>,
);
