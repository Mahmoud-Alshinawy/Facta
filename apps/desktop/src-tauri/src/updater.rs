//! Facta's auto-updater (docs/updater.md, sections 3 and 4).
//!
//! Checks 60 s after start and every 6 h, downloads a newer signed release in
//! the background, and only installs after the user presses Restart. Errors
//! (offline, no release yet, no matching platform) are logged and otherwise
//! silent.

use crate::update_handshake as handshake;
use semver::Version;
use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

const FIRST_CHECK: Duration = Duration::from_secs(60);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
const WAIT_POLL: Duration = Duration::from_millis(500);
const RUNNING_POLL: Duration = Duration::from_secs(1);

#[derive(Default)]
pub struct UpdaterState {
    inner: Mutex<Inner>,
    checking: tokio::sync::Mutex<()>,
}

#[derive(Default)]
struct Inner {
    ready: Option<(Update, Vec<u8>)>,
    installing: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// "idle" | "ready" | "installing"
    state: &'static str,
    version: Option<String>,
    current: String,
}

fn status(app: &AppHandle) -> UpdateStatus {
    let current = app.package_info().version.to_string();
    let state = app.state::<UpdaterState>();
    let inner = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    let version = inner.ready.as_ref().map(|(u, _)| u.version.clone());
    UpdateStatus {
        state: if inner.installing {
            "installing"
        } else if version.is_some() {
            "ready"
        } else {
            "idle"
        },
        version,
        current,
    }
}

fn log(message: &str) {
    eprintln!("[Facta] updater: {message}");
}

/// Start-up housekeeping and the background check loop.
pub fn start(app: &AppHandle) {
    // Facta never removes update-approved.json: the widgets may not have acted
    // on it yet (closed at Restart, or a slow download), and only they know
    // when it is satisfied. A satisfied approval is ignored by both apps.
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            if let Err(error) = check_and_download(&handle).await {
                log(&error);
            }
            tokio::time::sleep(CHECK_EVERY).await;
        }
    });
}

/// Returns Ok(true) when an update is ready (new or already downloaded).
async fn check_and_download(app: &AppHandle) -> Result<bool, String> {
    let state = app.state::<UpdaterState>();
    let _guard = state.checking.lock().await;
    let updater = app
        .updater_builder()
        // The plugin would restart Facta with its current arguments, which
        // after a login start include --hidden. Restart without them: the
        // user just pressed Restart and expects to see Facta.
        .restart_after_install(false)
        .installer_arg("/R")
        .build()
        .map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(state.inner.lock().map(|i| i.ready.is_some()).unwrap_or(false));
    };
    {
        let inner = state.inner.lock().map_err(|_| "updater lock failed")?;
        if inner.installing {
            return Ok(true);
        }
        if inner.ready.as_ref().is_some_and(|(ready, _)| ready.version == update.version) {
            return Ok(true);
        }
    }
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    let version = update.version.clone();
    {
        let mut inner = state.inner.lock().map_err(|_| "updater lock failed")?;
        if inner.installing {
            return Ok(true);
        }
        inner.ready = Some((update, bytes));
    }
    log(&format!("{version} downloaded and ready"));
    let _ = app.emit("update-ready", version);
    crate::refresh_tray_menu(app);
    Ok(true)
}

#[tauri::command]
pub fn update_status(app: AppHandle) -> UpdateStatus {
    status(&app)
}

/// Settings → "Check for updates".
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateStatus, String> {
    check_and_download(&app).await?;
    Ok(status(&app))
}

/// Step one of Restart: approve the version, let the widgets update first and
/// wait for them (docs/updater.md, section 4). The page then saves local data
/// (as on Quit) and calls `install_update`, so nothing typed during the wait
/// is lost.
#[tauri::command]
pub async fn prepare_update(app: AppHandle) -> Result<(), String> {
    let state = app.state::<UpdaterState>();
    let version = {
        let mut inner = state.inner.lock().map_err(|_| "updater lock failed")?;
        if inner.installing {
            return Err("An update is already being installed.".into());
        }
        let version = inner
            .ready
            .as_ref()
            .map(|(u, _)| u.version.clone())
            .ok_or("No update is ready.")?;
        inner.installing = true;
        version
    };
    let _ = app.emit("update-installing", ());
    crate::refresh_tray_menu(&app);

    if let Err(error) = wait_for_widgets(&version).await {
        log(&error);
    }
    Ok(())
}

/// Step two of Restart: install Facta. On Windows the process exits here and
/// the installer starts the new version.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let state = app.state::<UpdaterState>();
    let ready = {
        let mut inner = state.inner.lock().map_err(|_| "updater lock failed")?;
        if !inner.installing {
            return Err("Prepare the update first.".into());
        }
        inner.ready.take()
    };
    let Some((update, bytes)) = ready else {
        reset_installing(&app);
        return Err("No update is ready.".into());
    };
    log(&format!("installing {}", update.version));
    // On Windows this starts the installer and exits the process.
    let result = update.install(&bytes);
    // Reached on failure, or on macOS/Linux after installing.
    match result {
        Ok(()) => {
            app.restart();
        }
        Err(error) => {
            let message = format!("Could not install the update: {error}");
            log(&message);
            if let Ok(mut inner) = state.inner.lock() {
                inner.ready = Some((update, bytes));
            }
            reset_installing(&app);
            Err(message)
        }
    }
}

fn reset_installing(app: &AppHandle) {
    if let Ok(mut inner) = app.state::<UpdaterState>().inner.lock() {
        inner.installing = false;
    }
    crate::refresh_tray_menu(app);
}

async fn wait_for_widgets(version: &str) -> Result<(), String> {
    let dir = handshake::shared_dir().ok_or("Could not find local app data")?;
    let version = Version::parse(version).map_err(|e| e.to_string())?;
    handshake::write_approval(&dir, &version, handshake::now_ms())
        .map_err(|e| format!("Could not write the update approval: {e}"))?;
    let started = std::time::Instant::now();
    let mut marker_seen = false;
    // Each running check spawns tasklist: do it about once a second, while
    // the marker file is read every 500 ms.
    let mut running = false;
    let mut running_checked: Option<std::time::Instant> = None;
    loop {
        let marker_now = handshake::updating_exists(&dir);
        marker_seen |= marker_now;
        if running_checked.map_or(true, |at| at.elapsed() >= RUNNING_POLL) {
            running = crate::widget_app_running().await.unwrap_or(false);
            running_checked = Some(std::time::Instant::now());
        }
        let elapsed = started.elapsed().as_millis() as i64;
        match handshake::facta_wait_step(elapsed, running, marker_now, marker_seen) {
            handshake::WaitStep::Wait => tokio::time::sleep(WAIT_POLL).await,
            handshake::WaitStep::WidgetsDone => {
                log("widgets finished updating");
                return Ok(());
            }
            handshake::WaitStep::Proceed => {
                if marker_now {
                    log("widgets install still running after the timeout; continuing");
                }
                return Ok(());
            }
        }
    }
}

pub fn is_ready(app: &AppHandle) -> bool {
    let state = app.state::<UpdaterState>();
    let inner = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    inner.ready.is_some() && !inner.installing
}
