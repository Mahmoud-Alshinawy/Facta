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
Migration runs once during each setup and failures are logged. Startup reads
and changes do not depend on migration succeeding.

The desktop now directly references `winreg` 0.10.1, which was already in the
lockfile as a transitive dependency of the autostart plugin. This permits the
old widget entry to be removed idempotently and lets real registry errors be
distinguished from a missing value. The main entry is disabled by the plugin. The only lockfile
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

### Startup review follow-up

Legacy widget migration now runs only during app setup. A failure is logged
and does not block reading or changing the main startup setting, or the main
app's decision to launch widgets at login. If migration fails, the old widget
entry can still start widgets independently until a later setup removes it.

The widget process holds a Windows named-mutex handle from before Tauri setup
until exit, preventing simultaneous launches from creating duplicate trays.
The available Tauri single-instance plugin's Windows implementation can let a
second launch continue if the first has created its mutex but has not yet
created the plugin's helper window; the handle-only guard closes that gap.
`windows-sys` 0.59 was already in the widget lockfile transitively and is now
referenced directly for this guard. The widget app's unused Rust and JavaScript
autostart dependencies were removed. The main startup entry is disabled by
the autostart plugin; an absent entry is treated as success without parsing a
localized error string. The Settings toggle uses the existing `.sw` switch
style and remains keyboard accessible.

The fake-store regression test first reproduced the migration error blocking a
change, then passed after the fix. Widget tests use unique temporary mutex
names and cover an immediate second attempt, 12 simultaneous attempts, and a
separate test process. These tests did not start Facta or touch the registry.
A local browser check verified the styled switch, keyboard use, simulated
on/off, reopening Settings, and error recovery with no console errors or CSP
violations.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed |
| TypeScript, desktop / widgets / calendar | Passed / passed / passed |
| Desktop Vitest | 39 files, 375 tests passed |
| Calendar Vitest | 12 files, 184 tests passed |
| Desktop and widget production builds | Passed / passed |
| Desktop and widget `cargo check --offline` | Passed / passed |
| Desktop `cargo test --offline` | 8 passed |
| Widget `cargo test --offline` | 4 passed, including a child-process fixture |

The desktop build continues to report its large-chunk warning. Neither app nor
an installer was run, and the real Windows startup entries were not changed.
After review and integrated installation, the owner should check the first
Windows login after upgrade for one widget tray icon and one copy of each
configured widget, then carry out the on/off restart checks above.

## Rust panic hardening and widget guard fallback

The following runtime panic points were changed:

- `clamp_to_monitors`: if passed no monitor information, log the condition and
  use the same 1920×1080 default work area already used by monitor discovery.
- `close_widget`: the two lock operations are now one operation. A later
  follow-up recovers the last data from a poisoned closed-widget lock and logs
  the recovery before recording the close.
- `save_current_positions`: recover and log a poisoned position lock so the
  available position data can still be saved.
- `spawn_or_update_widgets`: recover and log poisoned closed-widget or position
  state rather than panic or skip every subsequent update.
- Desktop app build: report a Tauri build error and return instead of panicking.
  It attempts to append the error to `%LOCALAPPDATA%\Facta\startup-error.log`;
  if the log cannot be written, it reports that on standard error as well.
- Widget app run: report a Tauri run error to the widget log and standard error
  rather than panicking.
- The widget single-instance guard now logs and starts without a guard if the
  guard cannot be created. A confirmed duplicate still exits. In the failure
  case, duplicates are possible until the underlying Windows error is fixed.

Three production `unwrap` calls remain after audit: the queued-action
acknowledgement is reached only when `ack` is `Some`, and the two widget path
parents follow fixed `join("Facta").join(filename)` calls, so both paths have
parents by construction. Other remaining `unwrap`/`expect` calls are in tests.
Fallback methods such as `unwrap_or` do not panic and were outside this audit.

Tests simulate an empty monitor list, a poisoned state lock, widget and desktop
runtime failures, an invalid log path, and guard creation failure. Tests do not
launch the apps, write to the real application data, or touch startup entries.
Widget logging is redirected to standard error in tests to keep them isolated.

| Check | Result |
| --- | --- |
| TypeScript, desktop / widgets / calendar | Passed / passed / passed |
| Desktop Vitest | 39 files, 375 tests passed |
| Calendar Vitest | 12 files, 184 tests passed |
| Desktop and widget production builds | Passed / passed |
| Desktop and widget `cargo check --offline` | Passed / passed |
| Desktop `cargo test --offline` | 11 passed |
| Widget `cargo test --offline` | 9 passed |
| `pnpm install --frozen-lockfile` | Not run: automatic approval review rejected installation under the no-install instruction; existing dependencies were used for the checks above |

The desktop build still reports the existing large-chunk warning. Neither app,
an installer, nor an actual login was run. The login-CSRF change was pending at
this point and is covered by the subsequent follow-up below; no live Supabase
project was used.

After review, merge, and installation by Builder A, open Facta and the widget
app, close and reopen a widget, move it, quit both apps, and reopen them to
check normal operation and position saving. If either app fails to open, tell
the reviewer; the startup logs listed above may help identify the cause.

## Rebase, login callback security, and widget lock recovery

`feat/hardening` was rebased without conflicts onto `origin/main` at `0baaf2f`.
The rebased head was `630236a3328abe1b7cba75bf36edd212def19a21`, and was pushed
with `--force-with-lease`. At that point, desktop Vitest passed 471 tests,
calendar Vitest passed 212, desktop Rust passed 13, and widget Rust passed 14.
All three TypeScript checks, both production builds, and both offline Cargo
checks also passed. After the owner clarified that installing locked project
dependencies in the worktree is permitted, `pnpm install --frozen-lockfile`
passed; no Facta app or installer was run.

The app's Supabase client now uses PKCE. `parseFactaLink` rejects callbacks
containing access or refresh tokens, including links that mix them with a code
or error; authorization-code callbacks still reach `exchangeCodeForSession`.
The SDK's automatic URL detection is disabled because `DeepLinkBridge` already
processes browser callbacks: otherwise the SDK can consume the same one-time
code before the bridge exchanges it. An offline regression test reproduced that
double-exchange path before the change. Further tests use fake HTTP responses to
verify the signup challenge, the locally stored verifier requirement, and that
the expected unconfirmed-password response does not discard the verifier.
No live Supabase service or test database was contacted.

A poisoned widget state lock now logs and returns its last data instead of
failing permanently. The regression test checks that existing data remains
available and a later update survives another lock attempt. This applies to
closed-widget and position state.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed |
| TypeScript, desktop / widgets / calendar | Passed / passed / passed |
| Desktop Vitest | 51 files, 479 tests passed |
| Calendar Vitest | 16 files, 212 tests passed |
| Desktop and widget production builds | Passed / passed |
| Desktop and widget `cargo check --offline` | Passed / passed |
| Desktop `cargo test --offline` | 13 passed |
| Widget `cargo test --offline` | 14 passed |

The desktop build still reports the large-chunk warning. The actual installed
app, email flow, and live services were not exercised during this work.

### Owner's later signup check

After review, merge, and installation by Builder A:

1. On the same computer where Facta is installed, sign up with an email address
   that can receive mail.
2. Open the confirmation email on that computer and follow its link back to
   Facta. Confirm the app opens signed in to the intended account.
3. Quit and reopen Facta and confirm the same account remains signed in. If the
   link fails or a different account appears, tell the reviewer what happened.

PKCE requires the confirmation to use the local verifier created when signup
started. Open the link on the same installation; links issued by the previous
implicit flow are no longer accepted, so start a fresh signup if necessary.
