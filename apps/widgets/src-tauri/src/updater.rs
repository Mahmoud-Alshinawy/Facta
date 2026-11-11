//! Facta Widgets' updater (docs/updater.md, section 4). The widgets never ask:
//! they check and download like Facta, and install only after the user
//! pressed Restart in Facta, which writes `update-approved.json`.

use crate::update_handshake as handshake;
use semver::Version;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

const FIRST_CHECK: Duration = Duration::from_secs(60);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
const APPROVAL_POLL: Duration = Duration::from_secs(2);

pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || run(app));
}

fn run(app: AppHandle) {
    let own = app.package_info().version.clone();
    let Some(dir) = handshake::shared_dir() else {
        crate::log("updater: no local app data folder; updates are off");
        return;
    };

    // A marker left from before this process started is finished with: either
    // this is the new version, or that install failed and the old one runs.
    if let Some(marker) = handshake::read_updating(&dir) {
        if handshake::marker_done_for(&own, &marker) {
            crate::log(&format!("updater: now running {own}; widgets update finished"));
        } else {
            crate::log(&format!("updater: update to {} did not finish; still {own}", marker.to));
        }
    }
    if handshake::updating_exists(&dir) {
        let _ = handshake::remove_updating(&dir);
    }
    if handshake::read_approval(&dir).is_some_and(|a| handshake::approval_satisfied(&own, &a)) {
        let _ = handshake::remove_approval(&dir);
    }

    let mut ready: Option<(Update, Vec<u8>)> = None;
    let mut next_check = Instant::now() + FIRST_CHECK;
    let mut checked_for: Option<Version> = None;
    loop {
        let approval = handshake::read_approval(&dir);
        let downloaded = ready.as_ref().and_then(|(u, _)| Version::parse(&u.version).ok());
        match handshake::widgets_step(&own, approval.as_ref(), downloaded.as_ref(), checked_for.as_ref()) {
            handshake::WidgetsStep::Install => {
                if let Some((update, bytes)) = ready.take() {
                    install(&app, &own, &dir, update, bytes);
                }
            }
            handshake::WidgetsStep::CheckNow => {
                // Once per approved version; otherwise wait for the 6-hour check.
                checked_for = approval.map(|a| a.version);
                next_check = Instant::now();
            }
            handshake::WidgetsStep::Nothing => {}
        }
        if Instant::now() >= next_check {
            next_check = Instant::now() + CHECK_EVERY;
            match check_and_download(&app, ready.as_ref()) {
                Ok(Some(found)) => ready = Some(found),
                Ok(None) => {}
                Err(error) => crate::log(&format!("updater: {error}")),
            }
            continue;
        }
        std::thread::sleep(APPROVAL_POLL);
    }
}

/// Returns a newly downloaded update, or None if there is nothing newer than
/// what is already downloaded.
fn check_and_download(app: &AppHandle, ready: Option<&(Update, Vec<u8>)>) -> Result<Option<(Update, Vec<u8>)>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = tauri::async_runtime::block_on(updater.check()).map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    if ready.is_some_and(|(r, _)| r.version == update.version) {
        return Ok(None);
    }
    let bytes = tauri::async_runtime::block_on(update.download(|_, _| {}, || {})).map_err(|e| e.to_string())?;
    crate::log(&format!("updater: {} downloaded and ready", update.version));
    Ok(Some((update, bytes)))
}

fn install(app: &AppHandle, own: &Version, dir: &std::path::Path, update: Update, bytes: Vec<u8>) {
    let Ok(target) = Version::parse(&update.version) else { return };
    // Save positions now: the debounced save may still be waiting.
    let state = app.state::<crate::WidgetState>();
    crate::save_current_positions(app, &state);
    if let Err(error) = handshake::write_updating(dir, own, &target, handshake::now_ms()) {
        crate::log(&format!("updater: could not write the install marker: {error}"));
        return;
    }
    crate::log(&format!("updater: installing {target}"));
    // On Windows this starts the installer and exits the process; the
    // installer starts the new widgets, which remove the marker.
    match update.install(&bytes) {
        Ok(()) => app.restart(),
        Err(error) => {
            crate::log(&format!("updater: install failed: {error}"));
            let _ = handshake::remove_updating(dir);
        }
    }
}
