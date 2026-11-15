import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

function stripCrossorigin() {
  return {
    name: "strip-crossorigin",
    enforce: "post" as const,
    transformIndexHtml(html: string) {
      return html.replace(/(<(?:script|link)[^>]*?) crossorigin/g, "$1");
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stripCrossorigin()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    modulePreload: false,
  },
  clearScreen: false,
  server: {
    port: 5174,
    strictPort: true,
    // Cargo's locked build files can crash Vite's Windows file watcher.
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
