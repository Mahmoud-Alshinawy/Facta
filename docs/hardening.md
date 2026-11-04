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
