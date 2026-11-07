// Creates disposable native source copies; never overlays production sources,
// reads installed data, registers facta://, or loads application .env files.
import { cp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = process.argv[2];
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(fixture ?? ""))
  throw Error("Loopback required");
const realAuth = process.argv.includes("--real-auth");
if (
  realAuth &&
  (fixture !== "http://127.0.0.1:56421" ||
    process.argv.includes("--foreground-companion"))
)
  throw Error(
    "Real Auth checks require the dedicated local stack and normal widget stacking",
  );
const areaName = realAuth ? "shared-native-auth" : "shared-step6";
const scheme = realAuth ? "facta-acceptance" : "facta-step6";
const area = path.join(root, "tmp", areaName);
const local = realAuth
  ? JSON.parse(
      await readFile(
        path.join(root, "tmp/supabase-acceptance/status.json"),
        "utf8",
      ),
    )
  : null;
if (local && local.API_URL !== fixture) throw Error("Disposable URL mismatch");
await mkdir(area, { recursive: true });
const require = createRequire(path.join(root, "apps/desktop/package.json"));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);
const tailwind = (
  await import(pathToFileURL(require.resolve("@tailwindcss/vite")).href)
).default;
await writeFile(
  path.join(area, "desktop.html"),
  `<!doctype html><html><body><div id="root"></div><script type="module" src="/apps/desktop/src/${realAuth ? "main" : "test/sharedAcceptance"}.tsx"></script></body></html>`,
);
await build({
  root,
  configFile: false,
  envDir: path.join(root, "tmp/shared-client-empty-env"),
  envPrefix: "FACTA_TEST_UNUSED_",
  ...(realAuth
    ? {
        define: {
          "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(fixture),
          "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
            local.ANON_KEY,
          ),
          "import.meta.env.VITE_AUTH_REDIRECT_URL": JSON.stringify(
            `${scheme}://auth/callback`,
          ),
        },
      }
    : {}),
  resolve: {
    alias: {
      ...(!realAuth
        ? {
            "@/hooks/useAuth": path.join(
              root,
              "apps/desktop/src/test/sharedAcceptanceBridge.tsx",
            ),
          }
        : {}),
      "@": path.join(root, "apps/desktop/src"),
      react: path.dirname(require.resolve("react/package.json")),
      "react-dom": path.dirname(require.resolve("react-dom/package.json")),
    },
    dedupe: ["react", "react-dom"],
  },
  esbuild: { jsx: "automatic" },
  plugins: [
    tailwind(),
    {
      name: "isolated-link-scheme",
      transform(code, id) {
        if (id.endsWith("/components/DeepLinkBridge.tsx"))
          return code.replace(
            "parseFactaLink(raw)",
            `parseFactaLink(raw.replace(/^${scheme}:/, "facta:"))`,
          );
      },
    },
  ],
  build: {
    outDir: path.join(area, "desktop-dist"),
    emptyOutDir: true,
    rollupOptions: { input: path.join(area, "desktop.html") },
  },
});
for (const kind of ["desktop", "widgets"]) {
  const source = path.join(root, `apps/${kind}/src-tauri`),
    dest = path.join(area, kind, "src-tauri");
  await mkdir(dest, { recursive: true });
  for (const name of [
    "Cargo.toml",
    "Cargo.lock",
    "build.rs",
    "src",
    "icons",
    "capabilities",
  ])
    await cp(path.join(source, name), path.join(dest, name), {
      recursive: true,
    });
  const manifest = await readFile(path.join(dest, "Cargo.toml"), "utf8");
  await writeFile(
    path.join(dest, "Cargo.toml"),
    manifest.replace(
      /^name = ".*"/m,
      `name = "facta-${realAuth ? "acceptance" : "step6"}-${kind}"`,
    ),
  );
  const lock = await readFile(path.join(dest, "Cargo.lock"), "utf8");
  await writeFile(
    path.join(dest, "Cargo.lock"),
    lock.replace(
      `name = "${kind === "desktop" ? "facta" : "facta-widgets"}"`,
      `name = "facta-${realAuth ? "acceptance" : "step6"}-${kind}"`,
    ),
  );
  const config = JSON.parse(
    await readFile(path.join(source, "tauri.conf.json"), "utf8"),
  );
  config.identifier = `app.facta.${realAuth ? "acceptance" : "step6"}.${kind}`;
  config.productName = `Facta ${realAuth ? "Acceptance" : "Step6"} ${kind}`;
  // Absolute Windows drive paths can decode as URL schemes in FrontendDist.
  config.build.frontendDist = path
    .relative(
      dest,
      kind === "desktop"
        ? path.join(area, "desktop-dist")
        : path.join(root, "apps/widgets/dist"),
    )
    .replaceAll("\\", "/");
  delete config.build.devUrl;
  config.bundle.active = false;
  config.app.security.csp =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:* ipc: http://ipc.localhost; img-src 'self' data: blob:; font-src 'self' data:";
  if (kind === "desktop") {
    config.plugins["deep-link"].desktop.schemes = [scheme];
    config.app.windows[0].url = `tmp/${areaName}/desktop.html${realAuth ? "" : `?fixture=${fixture}`}`;
    config.app.windows[0].title = `Facta ${realAuth ? "Auth" : "Step6"} isolated`;
    config.app.windows[0].dataDirectory = path.join(area, "webview-desktop");
  }
  await writeFile(
    path.join(dest, "tauri.conf.json"),
    JSON.stringify(config, null, 2),
  );
  for (const name of await readdir(path.join(dest, "src"))) {
    if (!name.endsWith(".rs")) continue;
    const file = path.join(dest, "src", name);
    let text = await readFile(file, "utf8");
    text = text.replaceAll(
      "dirs::data_local_dir()",
      `Some(std::path::PathBuf::from(${JSON.stringify(path.join(area, "data").replaceAll("\\", "/"))}))`,
    );
    // Querying rather than enabling prevents even test autostart registration.
    text = text.replaceAll(
      ".autolaunch().enable()",
      ".autolaunch().is_enabled().map(|_| ())",
    );
    text = text.replaceAll(
      'tauri::include_image!("../public/',
      `tauri::include_image!("${root.replaceAll("\\", "/")}/apps/desktop/public/`,
    );
    text = text.replaceAll(
      'tauri::include_image!("../../desktop/public/',
      `tauri::include_image!("${root.replaceAll("\\", "/")}/apps/desktop/public/`,
    );
    if (kind === "widgets") {
      text = text.replaceAll("facta://", `${scheme}://`);
      if (process.argv.includes("--foreground-companion"))
        text = text.replace(".always_on_bottom(true)", ".always_on_top(true)");
      text = text.replace(
        ".skip_taskbar(true)",
        `.data_directory(std::path::PathBuf::from(${JSON.stringify(path.join(area, "webview-widgets").replaceAll("\\", "/"))})).skip_taskbar(true)`,
      );
    } else if (name === "lib.rs") {
      if (!realAuth)
        text = text.replace(
          "fn request_quit(",
          "#[tauri::command]\nfn acceptance_quit(app: tauri::AppHandle) { request_quit(&app, 0); }\n\nfn request_quit(",
        );
      if (!realAuth)
        text = text.replace(
          "finish_quit,",
          "acceptance_quit,\n            finish_quit,",
        );
      // Test copies never resolve/launch the installed companion.
      const start = text.indexOf("fn launch_widget_app("),
        end = text.indexOf("\n#[tauri::command]", start);
      if (start < 0 || end < 0) throw Error("launch isolation seam moved");
      text =
        text.slice(0, start) +
        'fn launch_widget_app(_app: tauri::AppHandle) -> Result<(), String> { Err("Use the isolated companion executable".into()) }\n' +
        text.slice(end);
    }
    await writeFile(file, text);
  }
}
console.log(
  `Prepared isolated sources and WebView profiles under tmp/${areaName}; ${realAuth ? "production AuthProvider/SyncProvider, local real Auth; separate test scheme and data paths" : "synthetic identity"}. Build each with tauri/custom-protocol and copy to unique executable names.`,
);
