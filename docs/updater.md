# Auto-updater plan (Facta and Facta Widgets)

Status: **built and merged** (main at dc7ba03). The real public key (minisign
key ID BA50095A7EBB84F3) is in both `tauri.conf.json` files. Before it was
added, `pubkey` was empty, nothing installed, and a release tag failed at the
versions job.

Reviewer answers already taken in: first check at 60 s and every 6 h,
approved; silent background download before asking, approved; macOS and Linux
end to end, deferred.

## Changes made while building

| Plan said | Built | Why |
|---|---|---|
| Restart flushes, then `install_update` waits for the widgets and installs. | Two commands: `prepare_update` (approval + widgets wait), then the page flushes, then `install_update`. | The wait can last minutes; flushing right before Facta exits keeps anything typed meanwhile. |
| `createUpdaterArtifacts: true` in both `tauri.conf.json`. | Off in the app configs; release.yml passes `--config .github/tauri-release.conf.json` that turns it on. | With it on, every local `tauri build` would need the private key. |
| Manifest keys `windows-x86_64`, `darwin-aarch64`, `linux-x86_64`. | `windows-x86_64-nsis`, `darwin-aarch64-app`, `linux-x86_64-appimage` only. | The plugin tries `{os}-{arch}-{installer}` first, then `{os}-{arch}`. Without the plain keys, an MSI or .deb install finds no entry and stays quiet instead of being handed the NSIS installer or AppImage. |
| Facta restarts after installing. | Facta passes `/R` itself and turns off the plugin's restart, which would also pass Facta's current arguments. | After a login start those include `--hidden`, so the new Facta would open hidden right after the user pressed Restart. |
| Widgets with an approval newer than themselves check "before showing any widget". | They show as normal and check at once in the background. | Not delaying widgets behind a network call; the install follows within seconds. |
| `tauri.conf.json` version points at `package.json`. | As planned; `apps/desktop/package.json` is now `1.0.0`. | |
| (Added after review.) | The release job compares every updater `.sig` key ID with the key ID of the pubkey in both `tauri.conf.json` files and fails before publishing on a mismatch or a malformed file (`scripts/updater-keys.mjs`, called from `make-update-manifests.mjs`; tests in `scripts/updater-keys.test.mjs`, run by the CI `versions` job). Signatures may use the `ED` (prehashed, what Tauri writes) or `Ed` tag; the pubkey must be `Ed`. | A `TAURI_SIGNING_PRIVATE_KEY` secret that does not match the public key would otherwise publish updates no installed app accepts. |

## In plain words

- Facta checks GitHub for a newer version a minute after it starts and then
  every 6 hours. It never slows startup, and if you are offline nothing happens.
- When a newer version exists, Facta downloads it quietly in the background. It
  does **not** install it. It shows a small bar: "Update ready, restart to
  install", with **Restart** and **Later**.
- Nothing is installed until you press Restart. Facta then saves your data (the
  same save it does on Quit), lets the widgets update first and waits until
  they have finished, then updates itself and opens again.
- If Facta started hidden at login, you see nothing until you open its window.
- Facta and Facta Widgets always come from the same release with the same
  version number. You agree once, in Facta, and both update.
- Your settings, widget positions and data are not touched by an update
  (checked against the installer's own script; see section 5).
- Updates are signed with a private key that only you hold (in GitHub's secret
  store and in your backup). The apps refuse any update not signed with it.
  **If that key is lost, installed copies can never update again**: every user
  would have to download and install a new version by hand.
- The copy you have installed today (built locally, no updater inside) cannot
  update itself. The first version that contains the updater has to be installed
  once by hand; every version after that updates on its own.

## What exists today (checked 11 Nov 2026)

| Item | Finding |
|---|---|
| Tags | None, locally or on GitHub. |
| GitHub Releases | None (`/releases` API returns an empty list). |
| Release workflow runs | Never run (`total_count: 0`). |
| `TAURI_SIGNING_PRIVATE_KEY` / `_PASSWORD` secrets | Can't be listed from here (no `gh` CLI, and listing needs the owner's login). The last recorded list (HANDOFF, 8 Nov) has only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, so they very likely **don't exist**. The owner confirms in Settings → Secrets and variables → Actions. No secret was created or changed. |
| release.yml | On `v*.*.*` tags: builds both apps for Windows x64, macOS arm64, Linux x64 with `tauri-action` (build only, no release upload), zips each OS, and `softprops/action-gh-release` publishes the zips. No `latest.json`, no per-file assets, no updater signatures. |
| ci.yml | Since 9b00cf2: one `checks` job, matrix of Windows, Ubuntu 22.04, macOS arm64. |
| Updater plugin | Not in either app. |
| Real install | NSIS, per-user: `%LOCALAPPDATA%\Facta\facta.exe` and `%LOCALAPPDATA%\Facta Widgets\facta-widgets.exe`. No admin rights needed to update. |
| Versions | `1.0.0` in both `tauri.conf.json`, both `Cargo.toml`, `apps/widgets/package.json`; `apps/desktop/package.json` and the root say `0.0.0`. |

## 1. Plugin and endpoint

- `tauri-plugin-updater = "2"` in both `src-tauri/Cargo.toml`. The check,
  download, signature check and install all run **in Rust**. The web page only
  gets small events and calls two commands; it never fetches the update itself.
  No `@tauri-apps/plugin-updater` JS package and no `updater:*` capability are
  needed in the webview.
- Config in each `tauri.conf.json`:

  ```json
  "bundle": { "createUpdaterArtifacts": true },
  "plugins": {
    "updater": {
      "pubkey": "<public key text>",
      "endpoints": ["https://github.com/Mahmoud-Alshinawy/Facta/releases/latest/download/latest-facta.json"],
      "windows": { "installMode": "passive" }
    }
  }
  ```

  Widgets uses `latest-widgets.json`. Two manifests, because the two apps share
  one release and `tauri-action`'s own `latest.json` would mix their entries.
  `/releases/latest/download/…` always points at the newest published,
  non-draft, non-prerelease release, so drafts and pre-releases are never
  offered to users.
- `passive` install mode: the NSIS installer shows only a small progress bar,
  no questions. On Windows the running app exits when the install starts
  (Tauri's documented behaviour). The installer is started in update mode
  (`/UPDATE`) and, with the restart flag (`/R`), starts the new version when it
  succeeds (`.onInstSuccess` in the template). The exact flags the plugin
  passes are confirmed in its source when it's added, and exercised in test
  7(d).

### How release.yml produces the update files

`createUpdaterArtifacts: true` makes `tauri build` sign the updater files with
`TAURI_SIGNING_PRIVATE_KEY` (already passed in from secrets) and write a `.sig`
next to each. If the secret is missing, the build fails; that is the right
outcome, since an unsigned release could never be installed by the updater.

| OS | File the updater installs | Signature | Manifest platform key |
|---|---|---|---|
| Windows x64 | NSIS `…_x64-setup.exe` | `…-setup.exe.sig` | `windows-x86_64` |
| macOS arm64 | `….app.tar.gz` | `….app.tar.gz.sig` | `darwin-aarch64` |
| Linux x64 | `….AppImage` | `….AppImage.sig` | `linux-x86_64` |

`.msi` and `.deb` still ship for manual install; they don't self-update.

Changes to release.yml (I own it for this work):

1. A `versions` job first (no matrix, see section 7); the build matrix
   `needs` it, so a mismatched tag builds nothing.
2. Keep `tauri-action` as build-only (as now). Upload the three updater files
   and their `.sig` per app as job artifacts, renamed to fixed names with no
   spaces, e.g. `Facta-1.0.1-windows-x64-setup.exe`,
   `FactaWidgets-1.0.1-windows-x64-setup.exe` (GitHub turns spaces into dots,
   which would break URLs; a signature covers the content, not the name).
3. **Linux catch:** the "Repair Linux AppImages" step changes the AppImage
   after Tauri signed it, so the old `.sig` would be wrong. Re-sign the
   repaired file with `pnpm tauri signer sign` (same secret, from env, never
   echoed) right after the repair.
4. A new step in the `release` job runs a small checked-in script
   (`scripts/make-update-manifests.mjs`) that writes `latest-facta.json` and
   `latest-widgets.json`: `version` (from the tag), `pub_date`, release notes
   link, and for each platform the `signature` (the `.sig` text) and `url`
   (`https://github.com/Mahmoud-Alshinawy/Facta/releases/download/<tag>/<file>`).
   It fails if any platform or signature is missing.
5. The release step attaches the zips (as now) **plus** the six updater files,
   six `.sig`s and two manifests.

No secret value is printed; the key only lives in the job's environment.

## 2. Keys

The owner generates the key on his own machine, so the private key and its
password never pass through any Claude session, the repo, logs or chat.

**Steps for Mahmoud (about 10 minutes):**

1. Open PowerShell in the Facta folder. First make the folder the key will go
   in (it's outside OneDrive and outside the repo, on purpose):

   ```powershell
   New-Item -ItemType Directory -Force "$env:USERPROFILE\.tauri"
   ```

2. Then create the key:

   ```powershell
   pnpm --filter facta-desktop exec tauri signer generate -w "$env:USERPROFILE\.tauri\facta-updater.key"
   ```

3. When asked, type a strong password, then type it again. **Nothing shows on
   screen while you type it, not even dots.** That's normal; just type and
   press Enter. Save that password in your password manager now, named "Facta
   updater key password".
4. Two files appear in `C:\Users\<you>\.tauri\`:
   - `facta-updater.key`: the **private** key. Secret.
   - `facta-updater.key.pub`: the **public** key. Safe to share.
5. Back up the private key: attach `facta-updater.key` to the same password
   manager entry, **and** copy it to a USB stick you keep somewhere safe. Not
   in the repo, not in OneDrive's synced folders, not in email or chat.
6. On GitHub: repo `Mahmoud-Alshinawy/Facta` → Settings → Secrets and
   variables → Actions → **New repository secret**:
   - Name `TAURI_SIGNING_PRIVATE_KEY`, value: open `facta-updater.key` in
     Notepad, select all, copy, paste. Save.
   - Name `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, value: the password. Save.
7. Tell the builder "key done". The builder reads only the `.pub` file and puts
   that text into both `tauri.conf.json` files.

**Losing the private key (or its password) means every installed copy can
never update again.** A new key can't be swapped in remotely: the old apps
only trust the old public key. Everyone would have to reinstall by hand. Keep
two backups.

## 3. When it checks and how it asks

Rust side (Facta), a small `updater.rs` module:

- First check **60 seconds** after start, on a background task, then every
  **6 hours**. Startup never waits on it.
- Any network or parse error: logged to stderr only, no UI, try again next
  interval. Offline is silent.
- If a newer version is found: download it in the background (verified against
  the public key) and keep the bytes in memory, then mark state `Ready(version)`.
  If the download fails, state stays `Idle` and the next check retries. A later
  check that finds an even newer version replaces the download.
- Commands: `update_status()` → `{ state, version }`; `install_update()`.
  Event: `update-ready`.
- Tray menu gets one extra item, shown only when ready: "Restart to update".

Web side (Facta):

- A quiet bar at the bottom of the window (same style as the existing toasts,
  not a modal): **Update ready, restart to install** · `Restart` · `Later`.
- Shown only while the window is visible. On `update-ready`, and on every
  `visibilitychange`/focus, it asks `update_status()`; if Facta started
  hidden at login (`--hidden`), nothing shows until the user opens the window.
- `Later` hides the bar until the next app start (or a newer version). The
  tray item stays.
- `Restart`: runs the same save as Quit (`plannerQuit.flush()` in
  `lib/nativeQuit.ts`), then calls `install_update`, which runs the widgets
  handshake (section 4) and then installs Facta. The bar shows "Updating the
  widgets…" while it waits. Never installs without this click.
- Settings → About gets the version number and a "Check for updates" button.

## 4. Widgets: each installs itself, Facta asks once

**Recommendation: each app installs its own update; Facta is the only one that
asks, and it waits for the widgets' install to finish before its own.**

Why: on Windows an install makes the *running* app exit, so Facta can't use
the updater to install the widgets' installer without killing itself, and the
widgets app has no main window to show a prompt in.

### Files (all in `%LOCALAPPDATA%\Facta\`, written to a `.tmp` file then renamed, so a reader never sees half a file)

| File | Written by | Meaning |
|---|---|---|
| `update-approved.json` `{ "version": "1.0.1", "at": <ms> }` | Facta, on Restart | The user agreed to this version (or anything newer). |
| `widgets-updating.json` `{ "from": "1.0.0", "to": "1.0.1", "at": <ms> }` | Widgets, just before starting their installer | A widgets install is in progress. |

### Handshake, step by step

1. **Facta, on Restart:** flush (as on Quit), write `update-approved.json`
   with the version it downloaded.
2. **Widgets** watch `update-approved.json` (checked every 2 s, and once at
   start). When it appears they compare versions with semver:
   - If the widgets' own downloaded update is **>= the approved version**,
     install it. (Not only an exact match: a release published between the two
     checks would otherwise strand the widgets.)
   - If they have nothing downloaded yet, or only something older than
     approved, they run a check now, download, and then install if it is >=
     approved. If that fails, they stay as they are and retry at the next
     6-hour check; the approval file stays until satisfied.
   - If their own version is already >= approved, they do nothing (see 6).
3. **Widgets, before installing:** save widget positions at once, bypassing
   the 500 ms debounce (call `save_current_positions` directly, as tray Quit
   and `quit_app` already do), then write `widgets-updating.json`, then call
   the plugin's install. The widgets process exits; the NSIS installer
   (passive, update mode) replaces `facta-widgets.exe` and starts the new one.
4. **Facta waits** after writing the approval, polling every 500 ms:
   - Widgets not running and no `widgets-updating.json` after 5 s → nothing to
     wait for; continue.
   - `widgets-updating.json` present → wait until it is **removed** (step 6)
     or a **3-minute** timeout. The installer itself takes a few seconds; the
     long timeout covers a slow disk or an antivirus scan.
   - Widgets running and neither file reacted within 30 s (for example the
     widgets' download failed) → continue; the widgets update on their own
     later.
   - On timeout Facta continues anyway: its installer only touches
     `%LOCALAPPDATA%\Facta\facta.exe` and `uninstall.exe`, never the widgets'
     folder, so it can't collide with a still-running widgets install.
5. **Facta installs itself.** Its installer (passive, update mode) exits Facta
   and starts the new Facta without `--hidden`.
6. **New widgets, on start:** if their version >= the version in
   `widgets-updating.json`, delete it. If their version >= the version in
   `update-approved.json`, delete that too. **Only the widgets remove the
   approval;** Facta never does, because the widgets may not have acted on it
   yet (closed when Restart was pressed, or a download slower than Facta's
   30 s wait). A satisfied approval (version <= own) is ignored by both apps,
   so one left behind is harmless. If the widgets were closed at Restart,
   they find the approval on their next start, check at once and install
   (unit test `widgets_closed_at_restart_install_the_approval_on_next_start`).

### Facta never starts the widgets during a widgets install

Facta starts the widgets in two places, both through `launch_widget_app`: at a
login start (`--hidden` with start-with-Windows on) and when the user opens
widgets from the app. `launch_widget_app` gets one guard at the top:

- If `widgets-updating.json` exists and is younger than 5 minutes, don't
  launch now; retry every 5 s until it is gone, then launch only if the widgets
  aren't already running (the installer's `/R` normally starts them, so this
  usually ends with nothing to do).
- If it is older than 5 minutes, treat the install as failed: delete the
  marker, log it, and launch normally.

This closes both failure cases: Facta can't start a half-replaced
`facta-widgets.exe`, and can't lock the file the installer is writing (which
NSIS reports as "Error opening file for writing").

### Matching versions

One tag builds and publishes both apps with the same version (release.yml
checks this). The approval file names the version the user agreed to, and the
widgets only install that or a newer signed release. The shared files carry a
`version` field already (`version: 1`); a release must not change that format
without reading the old one for at least one version.

## 5. Shared files in Facta's install folder

`%LOCALAPPDATA%\Facta\` is both Facta's per-user NSIS install folder
(`$INSTDIR`) and the folder the two apps share: `widget-state.json`,
`widget-positions.json`, the widget exports, `widget-app-path.txt`, the
startup log, and the two new update files.

What Tauri's NSIS installer does there, read from the template inside the
installed `@tauri-apps/cli` 2.11.4:

| Situation | What happens to files the installer didn't put there |
|---|---|
| **Update** (`/UPDATE`, passive) | `PageLeaveReinstall` jumps straight to "done" in update mode: the old version is **not uninstalled first**. The Install section kills a still-running `facta.exe` (passive mode does this without asking), then writes `facta.exe` and `uninstall.exe` over the old ones (Facta has no extra resources or sidecars) and updates registry entries. **Nothing else in the folder is deleted, moved or rewritten.** |
| Manual reinstall with "uninstall first" | The uninstaller deletes only the files it installed, then `RMDir "$INSTDIR"` without `/r`, which only removes an empty folder. Shared files stay, and so does the folder. |
| Manual uninstall with "delete app data" ticked | Additionally removes `%APPDATA%\app.facta.desktop` and `%LOCALAPPDATA%\app.facta.desktop` (the identifier folders), **not** `%LOCALAPPDATA%\Facta`. Update mode never does this. |

The widgets' own install folder is `%LOCALAPPDATA%\Facta Widgets\`; their
installer never writes to `%LOCALAPPDATA%\Facta\`.

So the layout is safe as it is. Moving the shared files elsewhere is not part
of this work; test 7(g) proves it on the real install.

## 6. CSP

**No change.** The updater's requests (to `github.com` and the asset host
`objects.githubusercontent.com`) are made by Rust (`reqwest`), not by the
webview, so the page's `connect-src` doesn't apply to them. Both CSPs stay
exactly as they are.

## 7. Version numbers

The updater compares the `version` in `tauri.conf.json`. Plan:

- Each `tauri.conf.json` points at its app's `package.json`
  (`"version": "../package.json"`, supported by Tauri 2), so the
  `package.json` is the single source per app. `apps/desktop/package.json`
  goes from `0.0.0` to `1.0.0` to match.
- `Cargo.toml` versions are kept equal for tidiness (they don't affect the
  updater).
- `scripts/bump-version.mjs 1.0.1` sets both `package.json`, both
  `Cargo.toml` and refreshes `Cargo.lock`. A release is: run the script, commit
  "Release 1.0.1", tag `v1.0.1`, push the tag (owner approves, as with merges).
- `scripts/check-versions.mjs [tag]` checks all of these agree (and equal the
  tag, when given). Plain Node, no install needed.
- **CI:** a separate `versions` job in `ci.yml`, `runs-on: ubuntu-latest`, no
  matrix and no `needs`, that only checks out and runs
  `node scripts/check-versions.mjs`. It sits next to Builder B's 3-OS
  `checks` job without changing it. (B's change is already on `main` at
  9b00cf2 and this branch is rebased onto it; if ci.yml moves again before
  this merges, I rebase again.)
- **Release:** the same script with the tag, as the first job (section 1).

## 8. Testing without a public release

On the real install, with a **throwaway test key**, never the real one:

1. Generate a test key pair into `tmp/updater-test/` (git-ignored; a dummy
   password). The real key is not needed for testing.
2. A test-only config overlay `tmp/updater-test/test.conf.json` (merged with
   `tauri build --config …`) sets the test public key and the endpoint
   `http://127.0.0.1:8787/latest-facta.json` (and `-widgets`), plus
   `dangerousInsecureTransportProtocol: true`. Never committed, never shipped.
3. Build both apps at **1.0.0** with the overlay; install over the real
   install (no backup, as agreed).
4. Bump to **1.0.1** locally (not committed), build both with the overlay,
   write the two manifests with the same script release.yml uses, and serve
   `tmp/updater-test/serve/` with `python -m http.server 8787 --bind 127.0.0.1`.
5. Checks:
   - (a) Server stopped: no bar, no error shown (offline case).
   - (b) Start Facta hidden (`--hidden`): no bar until the window opens.
   - (c) Bar appears; `Later` hides it, tray item remains.
   - (d) `Restart`: data saved; widgets exit, `widgets-updating.json` appears
     then disappears, widgets come back at 1.0.1; only then does Facta exit
     and come back at 1.0.1. Approval file gone afterwards.
   - (e) A tampered `.sig`: refused, nothing installed.
   - (f) **Install-ordering race:** with a 1.0.1 widgets installer made slow on
     purpose (a test-only NSIS pre-install hook that sleeps 20 s, overlay
     only), press Restart, then immediately run `facta.exe` and trigger
     "open widgets" while the widgets install runs. Expect: Facta doesn't start
     `facta-widgets.exe` until the marker is gone, no "Error opening file for
     writing", one widgets process at the end at 1.0.1. Then a second run with
     the marker left behind (installer killed): after 5 minutes Facta clears it
     and starts the widgets normally.
   - (g) **Shared files survive:** right after the apps have exited for the
     update (positions flushed), record `Get-FileHash` of `widget-state.json`,
     `widget-positions.json`, the export files and `widget-app-path.txt`; after
     both apps are back at 1.0.1, before touching anything, hash again. Expect
     byte-identical files (the startup export may be rewritten by the new
     Facta; if so, check it is valid JSON and parses with the widgets' parser).
     Also: signed in, Today data present, widgets back where they were, and
     the folder listing shows only `facta.exe` and `uninstall.exe` with new
     timestamps.
   - (h) Widgets newer than approved: approve 1.0.1 while the server already
     offers 1.0.2 to the widgets only; the widgets install 1.0.2.
   - (i) At the end exactly one `facta.exe` and one `facta-widgets.exe`, both
     from the install path.
6. Finish by installing the normal build (real public key, GitHub endpoint) of
   the branch, so the real install isn't left pointing at localhost.

A draft GitHub release can't be used (`/releases/latest` ignores drafts), and
a public pre-release would be visible to everyone, so the local server is the
test. The first real end-to-end check is the first real release after the
owner's key is in place: v1.0.1 installed by hand, then v1.0.2 updating it.

## Build order after approval

1. Owner creates the key and secrets (section 2); builder adds the public key.
2. Rust updater module + commands in Facta; bar, tray item, Settings → About.
3. Widgets updater, approval watch, position flush, `widgets-updating.json`.
4. The `launch_widget_app` guard and Facta's wait.
5. Version single-source, `bump-version.mjs`, `check-versions.mjs`, the CI
   `versions` job.
6. release.yml: versions job, renamed updater files, Linux re-sign, manifests.
7. Local test (section 8) on the real install; then stop for review.

Steps 2 and 4 touch `apps/desktop/src-tauri/src/lib.rs` (plugin registration,
two commands, the guard; most code in a new `updater.rs`). Builder B may edit
`lib.rs` too; whichever merges second rebases.

## Section 8 results (11 Nov 2026, real install, throwaway test key)

Test builds: both apps 1.0.0, 1.0.1, a widgets 1.0.1 whose installer sleeps
20 s (test-only NSIS hook), and widgets 1.0.2, all signed with a key in
`tmp/updater-test/` (git-ignored). Served from `127.0.0.1:8787`. Times are
from a watcher that recorded the two files and running versions every 250 ms.

| Check | Result |
|---|---|
| (a) Offline | **Pass.** Server off: each app logged one "error sending request", nothing on screen. |
| (b) Hidden start | **Pass.** Started `--hidden`: "1.0.1 downloaded and ready" at 14:25:28, nothing shown. Opening the window showed the bar: "Update ready, restart to install · 1.0.1 · Restart · Later". |
| (c) Later | **Pass** for the bar: hidden by Later, back after the next start. The tray item could not be seen (the taskbar is outside what the builder may screenshot): **owner hand-check**. |
| (d) Restart | **Pass.** 14:27:44 approval → 14:27:45 widgets marker → 14:27:47 old widgets gone, installer running → 14:27:50 widgets 1.0.1 up, both files removed → 14:27:52 Facta exits → 14:27:54 Facta 1.0.1, visible, signed in, Synced. |
| (e) Tampered signature | **Pass.** Signatures swapped: Facta downloaded the file, refused it, stayed 1.0.0, no bar; About said "Could not check for updates…". |
| (f) Race | **Pass.** Slow widgets install 14:30:41–14:31:05 (23 s); "Launch widget app" pressed 4 times during it; no widgets process until the installer's own start; no NSIS error; one widgets 1.0.1; Facta updated after (14:31:14). Stale marker: written to go stale ~30 s later; Launch pressed; Facta logged "marker is stale; treating that install as failed", removed it and started the widgets at 14:32:25. |
| (g) Shared files | **Pass.** `widget-state.json`, `widget-positions.json`, `widget-app-path.txt` byte-identical (SHA-256) across the update; `widgets.json` changed only because Facta re-exports it at start (same size, read by the widgets). Folder: only `facta.exe` and `uninstall.exe` replaced. Widgets in the same places. |
| (h) Widgets newer than approved | **Pass.** Facta offered 1.0.1, widgets 1.0.2: approval 1.0.1, widgets installed 1.0.2, files cleared, Facta 1.0.1. |
| (i) One of each | **Pass.** After installing the normal branch build (GitHub endpoint, empty key): one `facta.exe` and one `facta-widgets.exe`, both 1.0.0 from the install path; first check logged "Could not fetch a valid release JSON" (no release yet), nothing on screen. |

Known small points: the About message says "Check your connection" for any
failed check, including a bad signature; if the page failed between
`prepare_update` and `install_update`, Restart stays disabled until Facta
restarts.
