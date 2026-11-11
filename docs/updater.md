# Auto-updater plan (Facta and Facta Widgets)

Status: **plan only, for review.** No code yet. Branch `feat/updater`, from
`main` at 65fb735.

## In plain words

- Facta checks GitHub for a newer version a little after it starts and then
  every 6 hours. It never slows startup, and if you are offline nothing happens.
- When a newer version exists, Facta downloads it quietly in the background. It
  does **not** install it. It shows a small bar: "Update ready, restart to
  install", with **Restart** and **Later**.
- Nothing is installed until you press Restart. Facta then saves your data (the
  same save it does on Quit), updates the widgets and itself, and opens again.
- If Facta started hidden at login, you see nothing until you open its window.
- Facta and Facta Widgets always come from the same release with the same
  version number. You agree once, in Facta, and both update.
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
| `TAURI_SIGNING_PRIVATE_KEY` / `_PASSWORD` secrets | Can't be listed from here (no `gh` CLI, and listing needs the owner's login). The last recorded list (HANDOFF, 8 Nov) has only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, so they very likely **don't exist**. The owner confirms in Settings → Secrets and variables → Actions. I did not create or change any secret. |
| release.yml | On `v*.*.*` tags: builds both apps for Windows x64, macOS arm64, Linux x64 with `tauri-action` (build only, no release upload), zips each OS, and `softprops/action-gh-release` publishes the zips. No `latest.json`, no per-file assets, no updater signatures. |
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
  (Tauri's documented behaviour); the installer then starts the new version.

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

1. Keep `tauri-action` as build-only (as now). Upload the three updater files
   and their `.sig` per app as job artifacts, renamed to fixed names with no
   spaces, e.g. `Facta-1.0.1-windows-x64-setup.exe`,
   `FactaWidgets-1.0.1-windows-x64-setup.exe` (GitHub turns spaces into dots,
   which would break URLs; a signature covers the content, not the name).
2. **Linux catch:** the "Repair Linux AppImages" step changes the AppImage
   after Tauri signed it, so the old `.sig` would be wrong. Re-sign the
   repaired file with `pnpm tauri signer sign` (same secret, from env, never
   echoed) right after the repair.
3. A new step in the `release` job runs a small checked-in script
   (`scripts/make-update-manifests.mjs`) that writes `latest-facta.json` and
   `latest-widgets.json`: `version` (from the tag), `pub_date`, release notes
   link, and for each platform the `signature` (the `.sig` text) and `url`
   (`https://github.com/Mahmoud-Alshinawy/Facta/releases/download/<tag>/<file>`).
   It fails if any platform or signature is missing.
4. The release step attaches the zips (as now) **plus** the six updater files,
   six `.sig`s and two manifests.
5. A first step fails the run if the tag doesn't equal the version in all
   version files (see section 6).

No secret value is printed; the key only lives in the job's environment.

## 2. Keys

The owner generates the key on his own machine, so the private key and its
password never pass through any Claude session, the repo, logs or chat.

**Steps for Mahmoud (about 10 minutes):**

1. Open PowerShell in the Facta folder and run:

   ```powershell
   pnpm --filter facta-desktop exec tauri signer generate -w "$env:USERPROFILE\.tauri\facta-updater.key"
   ```

2. When asked, type a strong password twice. Save that password in your
   password manager now, named "Facta updater key password".
3. Two files appear in `C:\Users\<you>\.tauri\` (outside OneDrive and outside
   the repo, on purpose):
   - `facta-updater.key`: the **private** key. Secret.
   - `facta-updater.key.pub`: the **public** key. Safe to share.
4. Back up the private key: attach `facta-updater.key` to the same password
   manager entry, **and** copy it to a USB stick you keep somewhere safe. Not
   in the repo, not in OneDrive's synced folders, not in email or chat.
5. On GitHub: repo `Mahmoud-Alshinawy/Facta` → Settings → Secrets and
   variables → Actions → **New repository secret**:
   - Name `TAURI_SIGNING_PRIVATE_KEY`, value: open `facta-updater.key` in
     Notepad, select all, copy, paste. Save.
   - Name `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, value: the password. Save.
6. Tell the builder "key done". The builder reads only the `.pub` file and puts
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
  If the download fails, state stays `Idle` and the next check retries.
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
  `lib/nativeQuit.ts`), then calls `install_update`. Never installs without
  this click.
- Settings → About gets the version number and a "Check for updates" button.

## 4. Widgets: recommendation

**Each app installs its own update; Facta is the only one that asks.**

Why: on Windows an install makes the *running* app exit, so Facta can't use
the updater to install the widgets' installer without killing itself, and the
widgets app has no main window to show a prompt in. Letting each app replace
itself keeps the installs simple; one prompt in Facta keeps it one decision.

How:

- Widgets gets the same plugin, its own `latest-widgets.json`, the same public
  key, and the same check schedule, but **never shows a prompt**.
- When the user presses Restart in Facta, Facta writes a small approval file
  in the folder the two apps already share (`%LOCALAPPDATA%\Facta\`):
  `update-approved.json` = `{ "version": "1.0.1" }`. (The widgets'
  single-instance guard is a mutex, so there's no argv channel; this file is.)
- Widgets looks for that file every few seconds (it already polls this folder
  for Facta's exports). If its downloaded update matches the approved version,
  it installs (exits, installs, reopens). On its next start, if an approval
  file names a version newer than itself, it checks and installs at once,
  before showing any widget.
- Facta waits up to ~10 s for the widgets to exit (or proceeds at once if
  they're not running), then installs itself.
- If the widgets' update failed or wasn't downloaded yet, the widgets keep
  running the old version and install on their next check. The shared files
  carry a `version` field already (`version: 1`); a release must not change
  that format without supporting the old one for one version.

Matching versions: one tag builds and publishes both apps with the same version
(release.yml checks this). The approval file names that version, so the
widgets never install anything the user didn't agree to in Facta.

## 5. CSP

**No change.** The updater's requests (to `github.com` and the asset host
`objects.githubusercontent.com`) are made by Rust (`reqwest`), not by the
webview, so the page's `connect-src` doesn't apply to them. Both CSPs stay
exactly as they are. If review prefers the JS updater API instead, the
download is still made in Rust, so the answer is the same.

## 6. Version numbers

The updater compares the `version` in `tauri.conf.json`. Today it's repeated
in five places. Plan:

- Each `tauri.conf.json` points at its app's `package.json`
  (`"version": "../package.json"`, supported by Tauri 2), so the
  `package.json` is the single source per app. `apps/desktop/package.json`
  goes from `0.0.0` to `1.0.0` to match.
- `Cargo.toml` versions are kept equal for tidiness (they don't affect the
  updater).
- `scripts/bump-version.mjs 1.0.1` sets both `package.json`, both
  `Cargo.toml` and refreshes `Cargo.lock`. A release is: run the script, commit
  "Release 1.0.1", tag `v1.0.1`, push the tag (owner approves, as with merges).
- release.yml and CI fail if the tag or any of these files disagree.

## 7. Testing without a public release

On the real install, with a **throwaway test key**, never the real one:

1. Generate a test key pair into `tmp/updater-test/` (git-ignored, no
   password needed beyond a dummy one). The real key is not needed for testing.
2. A test-only config overlay `tmp/updater-test/test.conf.json` (merged with
   `tauri build --config …`) sets the test public key and the endpoint
   `http://127.0.0.1:8787/latest-facta.json` (and `-widgets`), plus
   `dangerousInsecureTransportProtocol: true`. Never committed, never shipped.
3. Build both apps at **1.0.0** with the overlay; install over the real
   install (no backup, as agreed).
4. Bump to **1.0.1** locally (not committed), build both with the overlay,
   write the two manifests with the same script release.yml uses, and serve
   `tmp/updater-test/serve/` with `python -m http.server 8787 --bind 127.0.0.1`.
5. Checks: (a) server stopped → no prompt, no errors shown (offline case);
   (b) start Facta hidden (`--hidden`) → no bar until the window opens;
   (c) bar appears → `Later` hides it, tray item remains; (d) `Restart` → data
   saved, widgets exit and come back at 1.0.1, Facta comes back at 1.0.1;
   (e) a tampered `.sig` → refused, nothing installed; (f) at the end exactly
   one `facta.exe` and one `facta-widgets.exe`, both from the install path.
6. Finish by installing the normal build (real public key, GitHub endpoint) of
   the branch, so the real install isn't left pointing at localhost.

A draft GitHub release can't be used (`/releases/latest` ignores drafts), and
a public pre-release would be visible to everyone, so the local server is the
test. The first real end-to-end check is the first real release after the
owner's key is in place: v1.0.1 installed by hand, then v1.0.2 updating it.

## Build order after approval

1. Owner creates the key and secrets (section 2); builder adds the public key.
2. Rust updater module + commands in Facta; bar, tray item, Settings → About.
3. Widgets updater + approval-file handshake.
4. Version single-source + `bump-version.mjs`.
5. release.yml: renamed updater files, Linux re-sign, manifests, version check.
6. Local test (section 7) on the real install; then stop for review.

Step 2 touches `apps/desktop/src-tauri/src/lib.rs` (plugin registration and
two commands, most code in a new `updater.rs`). Builder B may edit `lib.rs`
too; whichever merges second rebases.

## Open questions for review

- Check interval 6 h and first check at 60 s: fine?
- Silent background download before asking (~10 MB per app): fine, or ask
  before downloading?
- macOS and Linux get the updater files too; whether they work end to end
  (unsigned macOS app, AppImage only) is tested later with Builder B, not in
  this branch.
