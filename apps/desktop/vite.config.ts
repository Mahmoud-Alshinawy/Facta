import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Remove crossorigin attributes from generated HTML.
// Tauri serves assets from tauri://localhost/ which doesn't send CORS headers,
// so the crossorigin attribute causes script loading to fail silently.
function stripCrossorigin() {
  return {
    name: "strip-crossorigin",
    enforce: "post" as const,
    transformIndexHtml(html: string) {
      return html.replace(/(<(?:script|link)[^>]*?) crossorigin/g, "$1");
    },
  };
}

// Load root .env file so PORT and BASE_PATH can be defined there
const envDir = path.resolve(import.meta.dirname, "..", "..");
const loadedEnv = loadEnv("development", envDir, "");
// Only apply .env values if the env var is not already set (allows overrides)
Object.keys(loadedEnv).forEach((key) => {
  if (process.env[key] === undefined) {
    process.env[key] = loadedEnv[key];
  }
});

// Tauri sets these env vars during its dev/build lifecycle.
const isTauri =
  process.env.TAURI_ENV_PLATFORM !== undefined ||
  process.env.TAURI_DEV_HOST !== undefined;

const rawPort = process.env.PORT;
if (!isTauri && !rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}
const port = rawPort ? Number(rawPort) : 5173;
if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Tauri serves the bundled frontend from its application protocol root.
// Keep packaged builds independent of any CI BASE_PATH value.
const basePath = isTauri ? "/" : process.env.BASE_PATH ?? "/";
if (!isTauri && !process.env.BASE_PATH) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  envDir,
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    stripCrossorigin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    modulePreload: false,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // cargo writes locked .dll/.exe files under src-tauri/target while Tauri
    // dev builds; watching them crashes Vite with EBUSY on Windows.
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
