# Hardening

## Content security policy

The desktop and widget configurations now use `script-src 'self'`: both
`'unsafe-eval'` and `'unsafe-inline'` were removed from scripts. The style
policy is unchanged. A text search of the production JavaScript for `eval(`
and `new Function(` found no matches; this search alone does not prove that
all dynamic evaluation paths are absent.

### Checks on 2026-11-04

The baseline was `aa7f69a` on `origin/main`, before the policy change. The
same checks were run again after the change:

| Check | Baseline | Changed policy |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Passed | Passed |
| TypeScript, desktop / widgets / calendar | Passed / passed / passed | Passed / passed / passed |
| Desktop Vitest | 39 files, 375 tests passed | 39 files, 375 tests passed |
| Calendar Vitest | 12 files, 184 tests passed | 12 files, 184 tests passed |
| Desktop production build (`PORT=1420 BASE_PATH=/`) | Passed | Passed |
| Widget production build | Passed | Passed |
| Desktop / widget `cargo check --offline` | Passed / passed | Passed / passed |
| Widget `cargo test --offline` | Passed, 0 tests | Passed, 0 tests |

The desktop build reported Vite's large-chunk warning. The widget Rust test
command currently defines no tests; a successful run is not evidence of native
widget behavior.

Using Edge and Playwright, the production builds were served locally with the
new policies as HTTP response headers. The desktop used a synthetic local
session; widget native calls returned sample data. External requests were
blocked. Today, Calendar, Goals, Notes, Diary, and Settings opened, as did the
Tasks, Progress, Events, Calendar, Day, Notes, and Diary widgets. The final run
reported no console errors or CSP violations. This checks initial screen
rendering, not every interaction. It does not exercise Tauri's injected scripts,
native integrations, or a real signed-in session.

No installer was run and no installed Facta instance or Windows startup entry
was changed. A native installed-app smoke test remains for after integration.

### Owner's later hand-check

After shared goals and this change have been reviewed and merged, and Builder A
has installed the integrated build:

1. Open Facta and visit Today, Calendar, Goals, Notes, Diary, and Settings. Check
   that each opens and its usual controls work, including creating and editing
   a note and a diary entry.
2. Open each available widget: Tasks, Progress, Events, Calendar, Day, Notes,
   and Diary. Check that it displays and its usual controls work.
3. If anything is blank or stops working, tell the reviewer which screen or
   widget and what you were doing. Do not install this separate worktree build
   alongside the running installed app.

### CSP follow-up: remote sources and development mode

The widget frontend was searched for URL literals, `fetch`, `WebSocket`,
`XMLHttpRequest`, `EventSource`, and `sendBeacon`; no remote host was found.
Its `connect-src` now permits only self and Supabase HTTP/WebSocket hosts, and
its fonts only self and data URLs. The unused Google Fonts hosts were removed
from the desktop style and font policies. Both policies now include
`base-uri 'self'` and `form-action 'none'`.

On Windows with the configured Vite `devUrl`, Tauri 2.11.2 navigates directly
to that HTTP URL, rather than serving its HTML through the Tauri asset
protocol. The [webview source](https://github.com/tauri-apps/tauri/blob/tauri-v2.11.2/crates/tauri/src/manager/webview.rs#L43)
sets the dev-server proxy only for mobile and
[selects the app URL](https://github.com/tauri-apps/tauri/blob/tauri-v2.11.2/crates/tauri/src/manager/webview.rs#L443-L460).
The [manager](https://github.com/tauri-apps/tauri/blob/tauri-v2.11.2/crates/tauri/src/manager/mod.rs#L353-L380)
selects the configured `devUrl` in development and chooses `devCsp` (falling
back to `csp`) when Tauri serves an asset. Its
[asset handling](https://github.com/tauri-apps/tauri/blob/tauri-v2.11.2/crates/tauri/src/manager/mod.rs#L435-L452)
applies the policy there. Thus neither configuration policy is injected into
Vite's direct Windows HTTP response; no `devCsp` was added. A policy sent by
the dev server itself would still apply. This conclusion comes from source
inspection, not running the app or changing system registration.

The local Edge/Playwright check was repeated with the tightened production
policies: all six desktop sections and all seven widget types rendered, with
zero console errors or CSP violations. The production builds were made in
PowerShell with `BASE_PATH=/`, avoiding Git Bash path conversion. The same
fixture and native-integration limitations described above apply.

After the follow-up commit, the required checks passed: locked dependency
installation; TypeScript for all three packages; desktop Vitest (39 files,
375 tests) and calendar Vitest (12 files, 184 tests); both production builds;
both offline Cargo checks; and widget Cargo test (0 tests). The desktop build
still reports its large-chunk warning.

## Start with Windows

The main app no longer enables startup during launch. The Settings switch reads
and changes the existing Facta Windows startup entry, so a new installation is
off, an already-enabled entry stays enabled on upgrade, and opening the app
never turns an off setting back on. Windows Task Manager's startup override is
included in the plugin's status. The former independent `Facta Widgets` Run
entry is removed during migration; if it points to a valid widget executable,
its path is saved in local app data so a custom install can still be found.
The companion no longer enables itself. When Facta starts with `--hidden` and
its startup setting is enabled, it starts the installed companion if needed.
Migration errors are logged and exposed in Settings; no failed operation is
reported as a successful toggle.

The desktop now directly references `winreg` 0.10.1, which was already in the
lockfile as a transitive dependency of the autostart plugin. This permits the
old widget entry and the main entry to be removed idempotently and lets real
registry errors be distinguished from a missing value. The only lockfile
change is adding the existing package to the desktop dependency list.

The startup decision was developed test-first. Seven Rust unit tests use an
in-memory substitute, covering fresh and existing settings, explicit on/off,
reopening, widget login decisions, and migration failure. A local production
browser check with simulated native calls verified the toggle's on/off state,
reopening Settings, and recovery from a failed update; no console errors or
CSP violations occurred. These tests did not access the real registry or run
either app. The Windows integration and actual login behavior remain untested.

### Owner's later Windows checks

Only after both changes have been reviewed and merged, and Builder A has
installed **both** integrated apps:

1. If Facta was already set to start with Windows before the upgrade, open
   Settings and confirm **Start Facta when Windows starts** is on. A setting
   disabled in Windows Task Manager should show as off.
2. Turn the switch off, quit Facta and the widget app from their tray icons,
   and restart Windows. Confirm neither app starts at login. Open Facta and
   confirm the switch is still off.
3. Turn the switch on and restart Windows. Confirm Facta starts in the
   background and configured widgets appear. Open Settings and confirm the
   switch is still on.
4. If a separate clean Windows account or test computer is available, install
   the integrated apps there and confirm the switch is off before opting in.
5. Restore whichever setting you prefer. Tell the reviewer about any mismatch,
   error message, missing widget, or duplicated widget.

### Startup commit checks

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed |
| TypeScript, desktop / widgets / calendar | Passed / passed / passed |
| Desktop Vitest | 39 files, 375 tests passed |
| Calendar Vitest | 12 files, 184 tests passed |
| Desktop and widget production builds | Passed / passed |
| Desktop and widget `cargo check --offline` | Passed / passed |
| Widget `cargo test --offline` | Passed, 0 tests |
| Desktop `cargo test --offline ... startup::tests` | 7 passed, 1 unrelated test filtered out |
| Simulated browser toggle and error recovery | Passed, no console errors or CSP violations |

The desktop production build reported its existing large-chunk warning. No
installer, built application, or real Windows startup operation was run.
