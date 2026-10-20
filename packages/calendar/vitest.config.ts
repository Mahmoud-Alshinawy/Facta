import { defineConfig } from "vitest/config";

// Date maths runs in two pinned zones: Riyadh (UTC+3, no DST) and New York
// (DST), so week starts and month grids are checked across clock changes.
export default defineConfig({
  test: {
    environment: "node",
    projects: [
      { extends: true, test: { name: "riyadh", include: ["src/**/*.test.ts"], env: { TZ: "Asia/Riyadh" } } },
      { extends: true, test: { name: "new-york", include: ["src/**/*.test.ts"], env: { TZ: "America/New_York" } } },
    ],
  },
});
