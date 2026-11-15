# Facta

Facta is a desktop planner built with Tauri 2, React and Rust. Facta Widgets is
a separate companion app that keeps selected planner information on the desktop.

- Plan your day with goals, recurring goals and calendar events.
- Use shared goals to track progress with other people.
- View the calendar by month, week, day or agenda.
- Write notes and diary entries.
- Show goals, events, calendars, notes and diary entries in desktop widgets.
- Keep data on the device and optionally sync it through Supabase.
- Download signed updates in the background and install them when you choose Restart.

## Platforms

| Platform            | Validation                                                  |
| ------------------- | ----------------------------------------------------------- |
| Windows x64         | Tested on Windows and checked in CI                         |
| macOS Apple Silicon | Built and checked in CI; not tested on a real Mac           |
| Linux x64           | Built and checked in CI; not tested on a real Linux machine |

## Install

Download the package for your system from
[GitHub Releases](https://github.com/Mahmoud-Alshinawy/Facta/releases).
Install both Facta and Facta Widgets if you want desktop widgets.

Automatic updates support the Windows `.exe` installer, the macOS app and the
Linux AppImage. Keep the planner and widgets on the same version.

## Build from source

### Prerequisites

- Node.js 22 and pnpm 11, matching CI.
- The current stable Rust toolchain with Cargo.
- The [Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/)
  for your operating system:

| System              | Dependencies                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Windows             | Microsoft C++ Build Tools with Desktop development with C++, a Windows SDK, and Microsoft Edge WebView2                                    |
| macOS Apple Silicon | Xcode Command Line Tools or Xcode, and native ARM64 Rust                                                                                   |
| Ubuntu 22.04        | A C/C++ toolchain, `pkg-config`, OpenSSL development files, WebKitGTK 4.1, GTK 3, AppIndicator 3, librsvg, `patchelf` and `squashfs-tools` |

On Ubuntu, the repository's CI installs `libwebkit2gtk-4.1-dev`,
`libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libgtk-3-dev` and
`squashfs-tools`. A fresh development machine also needs the build tools and
other dependencies listed in the Tauri guide.

### Set up the checkout

Clone the repository, open its root directory, and restore the dependencies:

```sh
git clone https://github.com/Mahmoud-Alshinawy/Facta.git
cd Facta
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env` in the repository root. Add `PORT` and `BASE_PATH`.
The following values are placeholders; replace the Supabase values with those
from your own project:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_publishable_key
PORT=5173
BASE_PATH=/
```

Leave both Supabase values empty for local-only use. Use a publishable client
key, never a service-role or secret key. The frontend reads these settings at
build time, so changing the Supabase project requires rebuilding.

`PORT` and `BASE_PATH` are required for the desktop frontend commands. Port
`5173` also matches the desktop Tauri development URL; widgets use port `5174`.

### Development

Run either native app from the repository root, in separate terminals:

```sh
pnpm --dir apps/desktop tauri:dev
pnpm --dir apps/widgets tauri dev
```

For a browser preview of the frontend:

```sh
pnpm --dir apps/desktop dev
pnpm --dir apps/widgets dev
```

Native window controls, widgets integration and the updater require Tauri.

### Builds

Build both frontends:

```sh
pnpm --dir apps/desktop build
pnpm --dir apps/widgets build
```

Build the native apps and their packages:

```sh
pnpm --dir apps/desktop tauri:build
pnpm --dir apps/widgets tauri build
```

Packages are written under each app's `src-tauri/target/release/bundle/`.
On Apple Silicon, use native ARM64 Rust; the desktop shortcut
`pnpm --dir apps/desktop tauri:build:mac` explicitly selects
`aarch64-apple-darwin`. The widgets command accepts the same `--target` value.

## Checks

Run these from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --dir apps/desktop exec tsc --noEmit
pnpm --dir apps/widgets exec tsc --noEmit
pnpm --dir packages/calendar exec tsc --noEmit
pnpm --dir apps/desktop exec vitest run
pnpm --dir packages/calendar exec vitest run
pnpm --dir apps/desktop build
pnpm --dir apps/widgets build
cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo check --locked --manifest-path apps/widgets/src-tauri/Cargo.toml
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --locked --manifest-path apps/widgets/src-tauri/Cargo.toml
node scripts/check-versions.mjs
node --test scripts/updater-keys.test.mjs
```

`pnpm typecheck` is a shortcut for the workspace TypeScript checks. CI runs on
every branch push across Windows, Linux and Apple Silicon macOS.
Additional browser and database acceptance tools live in `scripts/`; they need
their own disposable test fixtures.

## Repository layout

| Path                  | Contents                                                 |
| --------------------- | -------------------------------------------------------- |
| `apps/desktop`        | Planner interface and its Tauri backend                  |
| `apps/widgets`        | Companion widgets and their Tauri backend                |
| `packages/calendar`   | Shared calendar settings, time handling and layout logic |
| `supabase/migrations` | Database schema and access-control migrations            |
| `scripts`             | Version and release tools, and acceptance-test runners   |

## Supabase

Bring your own Supabase project to enable sign-in and cloud sync. People sharing
goals must use the same project. Local-only use does not need a Supabase account.

Apply the files in `supabase/migrations` to your own project in timestamp order
before enabling sync. For email sign-in links, allow `facta://auth/callback` in
the project's authentication redirect URLs. These setup steps are separate
from building the app.

## Releases and updates

A version tag such as `v1.0.1` builds both apps and publishes packages with
signed update artifacts. The release workflow checks that both apps have the
same version and that the update signatures match the public key they trust.

Facta checks for updates and downloads them in the background. When an update
is ready, choose Restart to install it. One approval covers both the planner
and widgets; Facta lets the widgets update before installing its own update.

## License

Copyright (c) 2026 Mahmoud Alshinawy. Facta is free software, released under the GNU General Public License version 3 or (at your option) any later version. See LICENSE.
