// Real GoTrue/Kong/PostgREST acceptance against an explicitly disposable stack.
// No .env, linked project or remote URL is read. Never print credentials/tokens.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const area = path.join(root, "tmp/supabase-acceptance");
const settings = JSON.parse(
  await readFile(path.join(area, "status.json"), "utf8"),
);
if (settings.API_URL !== "http://127.0.0.1:56421")
  throw Error("Expected the dedicated disposable loopback Supabase API");
const require = createRequire(path.join(root, "apps/desktop/package.json"));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);
const outDir = path.join(area, "test-build");
await build({
  root,
  configFile: false,
  envDir: path.join(area, "empty-env"),
  envPrefix: "FACTA_TEST_UNUSED_",
  resolve: { alias: { "@": path.join(root, "apps/desktop/src") } },
  ssr: { noExternal: true },
  build: {
    ssr: path.join(root, "apps/desktop/src/test/sharedSupabaseAcceptance.ts"),
    outDir,
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: "acceptance.mjs" } },
  },
});
const { runSupabaseAcceptance, runNativeBackgroundAcceptance } = await import(
  pathToFileURL(path.join(outDir, "acceptance.mjs")).href
);
const native = process.argv.includes("--native-background");
// Same suite with the new-style public key in place of the legacy anon JWT.
const publishable = process.argv.includes("--publishable-key");
if (publishable) {
  if (!settings.PUBLISHABLE_KEY?.startsWith("sb_publishable_"))
    throw Error("Disposable stack has no publishable key");
  settings.ANON_KEY = settings.PUBLISHABLE_KEY;
}
const result = native
  ? await runNativeBackgroundAcceptance(
      settings,
      JSON.parse(await readFile(path.join(area, "native-users.json"), "utf8")),
      path.join(root, "tmp/shared-native-auth/data/Facta/widgets.json"),
    )
  : await runSupabaseAcceptance(settings);
await mkdir(area, { recursive: true });
await writeFile(
  path.join(
    area,
    native
      ? "native-background-result.json"
      : publishable
        ? "http-publishable-result.json"
        : "http-result.json",
  ),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
