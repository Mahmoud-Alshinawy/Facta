import path from "node:path";
import { defineConfig } from "vitest/config";

// Tests run in fixed time zones. Riyadh is UTC+3, so local midnight is 21:00
// UTC the day before: code that slips into UTC dates (toISOString().slice(0, 10))
// fails the midnight tests. The date tests also run in New York to cover
// daylight-saving changes (23- and 25-hour days).
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: { name: "riyadh", include: ["src/**/*.test.ts"], env: { TZ: "Asia/Riyadh" } },
      },
      {
        extends: true,
        test: { name: "new-york", include: ["src/lib/goalDates.test.ts", "src/lib/goalStats.test.ts"], env: { TZ: "America/New_York" } },
      },
    ],
  },
});
