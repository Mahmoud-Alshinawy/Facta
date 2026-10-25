// Real Chromium IndexedDB + SDK requests + a disposable PostgreSQL SQL bridge.
// The bridge does not implement Supabase Auth/JWT verification or PostgREST.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.FACTA_PLAYWRIGHT_MODULE ?? "playwright",
);
const { createServer, build, preview } = await import(
  pathToFileURL(
    path.join(root, "apps/desktop/node_modules/vite/dist/node/index.js"),
  ).href
);
const pgPort = process.argv[2];
const ui = process.argv.includes("--ui");
const desktopRequire = createRequire(
  path.join(root, "apps/desktop/package.json"),
);
const uiPlugins = ui
  ? [
      (
        await import(
          pathToFileURL(desktopRequire.resolve("@tailwindcss/vite")).href
        )
      ).default(),
    ]
  : [];
if (!/^\d+$/.test(pgPort ?? ""))
  throw new Error("Pass a disposable loopback PostgreSQL port");
const child = spawn(
  process.env.FACTA_TEST_PYTHON ?? "python",
  [
    path.join(root, "scripts/shared-client-fixture.py"),
    "--postgres-port",
    pgPort,
  ],
  {
    cwd: root,
    env: process.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
const ready = await new Promise((resolve, reject) => {
  const reader = createInterface({ input: child.stdout });
  const timer = setTimeout(
    () => reject(new Error("Disposable SQL bridge startup timed out")),
    30_000,
  );
  reader.once("line", (line) => {
    clearTimeout(timer);
    try {
      resolve(JSON.parse(line));
    } catch {
      reject(new Error("Invalid fixture startup"));
    }
  });
  child.once("exit", (code) => {
    clearTimeout(timer);
    if (code) reject(new Error("Disposable SQL bridge failed: " + stderr));
  });
});
let vite, browser;
try {
  const envDir = path.join(root, "tmp/shared-client-empty-env");
  await mkdir(envDir, { recursive: true });
  const config = {
    configFile: false,
    root,
    envDir,
    envPrefix: "FACTA_TEST_UNUSED_",
    resolve: { alias: { "@": path.join(root, "apps/desktop/src") } },
    esbuild: { jsx: "automatic" },
    server: {
      host: "127.0.0.1",
      hmr: false,
      port: 0,
      fs: { strict: true },
      watch: { ignored: ["**/src-tauri/**", "**/tmp/**", "**/dist/**"] },
    },
    plugins: [
      ...uiPlugins,
      {
        name: "shared-client-fixture",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const route = new URL(req.url, "http://127.0.0.1").pathname;
            if (!["/__shared_integration", "/__shared_ui"].includes(route))
              return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              `<!doctype html><html><head><title>Disposable shared checks</title></head><body>${route === "/__shared_ui" ? '<div id="root"></div>' : ""}<script type="module" src="/apps/desktop/src/test/${route === "/__shared_ui" ? "sharedUiIntegration.tsx" : "sharedIntegration.ts"}"></script></body></html>`,
            );
          });
        },
      },
    ],
  };
  let address;
  if (ui) {
    const input = path.join(root, "tmp/shared-goals-runtime/ui-test.html");
    const outDir = path.join(root, "tmp/shared-goals-runtime/ui-build");
    if (!outDir.startsWith(root + path.sep))
      throw new Error("Test build must stay in workspace");
    await writeFile(
      input,
      '<!doctype html><html><head><title>Shared flow tests</title></head><body><div id="root"></div><script type="module" src="/apps/desktop/src/test/sharedUiIntegration.tsx"></script></body></html>',
    );
    await build({
      ...config,
      build: { outDir, emptyOutDir: true, rollupOptions: { input } },
    });
    const server = await preview({
      configFile: false,
      root,
      envDir,
      envPrefix: "FACTA_TEST_UNUSED_",
      build: { outDir },
      preview: { host: "127.0.0.1", port: 0 },
    });
    address = server.httpServer.address();
    vite = {
      close: () =>
        new Promise((resolve, reject) =>
          server.httpServer.close((error) =>
            error ? reject(error) : resolve(),
          ),
        ),
    };
  } else {
    vite = await createServer(config);
    await vite.listen();
    address = vite.httpServer.address();
  }
  const url = `http://127.0.0.1:${address.port}/__shared_integration`;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.FACTA_CHROMIUM_EXECUTABLE || undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 920 },
    timezoneId: "Asia/Riyadh",
  });
  const external = [];
  await context.route("**/*", (route) => {
    const request = new URL(route.request().url());
    if (!["127.0.0.1", "localhost", "[::1]"].includes(request.hostname)) {
      external.push(request.origin);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  if (ui) {
    const { runSharedUiTests } = await import("./shared-ui-tests.mjs");
    const { runDraftRecoveryTests } =
      await import("./shared-draft-recovery-tests.mjs");
    const uiOptions = {
      page,
      context,
      url: `http://127.0.0.1:${address.port}/tmp/shared-goals-runtime/ui-test.html?fixture=${encodeURIComponent(ready.url)}`,
      fixture: ready.url,
      root,
    };
    const focused = process.argv.includes("--draft-recovery");
    const original = focused ? null : await runSharedUiTests(uiOptions);
    const recovery = await runDraftRecoveryTests(uiOptions);
    const result = original
      ? {
          ...original,
          assertions: original.assertions + recovery.assertions,
          checks: [...original.checks, ...recovery.checks],
          recoveryAssertions: recovery.assertions,
        }
      : recovery;
    if (external.length) throw new Error("Unexpected external UI request");
    const report = {
      ...result,
      browser: await browser.version(),
      database: ready.database,
      externalRequests: external.length,
      auth: "synthetic identity bridge; full Supabase Auth/JWT/PostgREST unverified",
    };
    await writeFile(
      path.join(
        root,
        `tmp/shared-goals-runtime/${focused ? "draft-recovery-result" : "ui-result"}.json`,
      ),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report, null, 2));
  } else {
    await page.goto(url);
    await page.waitForFunction(
      () => typeof window.runSharedIntegration === "function",
    );
    const results = [];
    let checkpoint;
    for (const phase of [1, 2, 3]) {
      let result;
      try {
        result = await page.evaluate(
          (args) => window.runSharedIntegration(args),
          { fixtureUrl: ready.url, phase, checkpoint },
        );
      } catch (error) {
        const lastCheck = await page
          .evaluate(() => window.sharedIntegrationCheckpoint ?? "phase start")
          .catch(() => "page unavailable");
        throw new Error(`Phase ${phase} stopped at: ${lastCheck}`, {
          cause: error,
        });
      }
      results.push({
        phase,
        assertions: result.assertions,
        checks: result.checks,
      });
      checkpoint = result.checkpoint;
      if (phase < 3) {
        await page.reload();
        await page.waitForFunction(
          () => typeof window.runSharedIntegration === "function",
        );
      }
    }
    if (external.length)
      throw new Error("Unexpected non-loopback browser request");
    const report = {
      ok: true,
      browser: await browser.version(),
      storage: "native Chromium IndexedDB with two page reloads",
      database: ready.database,
      transport:
        "real Supabase SDK over loopback SQL bridge; not PostgREST/Auth/JWT verification",
      externalRequests: external.length,
      phases: results,
    };
    await mkdir(path.join(root, "tmp/shared-goals-runtime"), {
      recursive: true,
    });
    await writeFile(
      path.join(root, "tmp/shared-goals-runtime/client-result.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report, null, 2));
  }
} finally {
  await browser?.close();
  await vite?.close();
  await fetch(`${ready.url}/test/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "stop" }),
  }).catch(() => {});
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once("exit", resolve);
  });
}
