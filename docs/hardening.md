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
