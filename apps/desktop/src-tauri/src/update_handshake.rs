//! Update handshake files shared by Facta and Facta Widgets (docs/updater.md,
//! section 4). Facta includes this as a module; the widgets crate includes the
//! same file with `#[path]`, so both apps read and write one format.
//!
//! Files live in `%LOCALAPPDATA%\Facta\` and are written to a temporary file
//! and renamed, so a reader never sees half a file.

use semver::Version;
use serde_json::json;
use std::path::{Path, PathBuf};

pub const APPROVED_FILE: &str = "update-approved.json";
pub const UPDATING_FILE: &str = "widgets-updating.json";
/// A widgets install older than this is treated as failed.
pub const MARKER_STALE_MS: i64 = 5 * 60 * 1000;
/// Facta waits at most this long for a widgets install it saw start.
pub const INSTALL_TIMEOUT_MS: i64 = 3 * 60 * 1000;
/// Widgets not running and no install started: nothing to wait for.
pub const NOT_RUNNING_GRACE_MS: i64 = 5 * 1000;
/// Widgets running but no install started: they update on their own later.
pub const NO_REACTION_MS: i64 = 30 * 1000;

pub fn shared_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|dir| dir.join("Facta"))
}

#[derive(Debug, Clone, PartialEq)]
pub struct Approval {
    pub version: Version,
    pub at_ms: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Updating {
    pub from: Version,
    pub to: Version,
    pub at_ms: i64,
}

fn version_field(value: &serde_json::Value, key: &str) -> Option<Version> {
    Version::parse(value.get(key)?.as_str()?).ok()
}

pub fn parse_approval(raw: &str) -> Option<Approval> {
    let value: serde_json::Value = serde_json::from_str(raw).ok()?;
    Some(Approval {
        version: version_field(&value, "version")?,
        at_ms: value.get("at")?.as_i64()?,
    })
}

pub fn parse_updating(raw: &str) -> Option<Updating> {
    let value: serde_json::Value = serde_json::from_str(raw).ok()?;
    Some(Updating {
        from: version_field(&value, "from")?,
        to: version_field(&value, "to")?,
        at_ms: value.get("at")?.as_i64()?,
    })
}

pub fn write_atomic(path: &Path, contents: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    std::fs::write(&tmp, contents)?;
    // On Windows, std's rename replaces an existing target.
    std::fs::rename(&tmp, path)
}

fn remove_if_present(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

pub fn read_approval(dir: &Path) -> Option<Approval> {
    parse_approval(&std::fs::read_to_string(dir.join(APPROVED_FILE)).ok()?)
}

pub fn write_approval(dir: &Path, version: &Version, now_ms: i64) -> std::io::Result<()> {
    let body = json!({ "version": version.to_string(), "at": now_ms });
    write_atomic(&dir.join(APPROVED_FILE), &body.to_string())
}

pub fn remove_approval(dir: &Path) -> std::io::Result<()> {
    remove_if_present(&dir.join(APPROVED_FILE))
}

pub fn read_updating(dir: &Path) -> Option<Updating> {
    parse_updating(&std::fs::read_to_string(dir.join(UPDATING_FILE)).ok()?)
}

/// True when the marker file exists, even if it can't be parsed (an unreadable
/// marker still means "someone is installing").
pub fn updating_exists(dir: &Path) -> bool {
    dir.join(UPDATING_FILE).exists()
}

pub fn write_updating(dir: &Path, from: &Version, to: &Version, now_ms: i64) -> std::io::Result<()> {
    let body = json!({ "from": from.to_string(), "to": to.to_string(), "at": now_ms });
    write_atomic(&dir.join(UPDATING_FILE), &body.to_string())
}

pub fn remove_updating(dir: &Path) -> std::io::Result<()> {
    remove_if_present(&dir.join(UPDATING_FILE))
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Widgets: install the downloaded update only if it is newer than what runs
/// now and at least the version the user approved (newer is fine: a release
/// published between Facta's check and the widgets' check must not strand
/// the widgets).
pub fn widgets_should_install(own: &Version, downloaded: Option<&Version>, approved: &Version) -> bool {
    downloaded.is_some_and(|d| d > own && d >= approved)
}

/// An approval is done with once the running app is at least that version.
pub fn approval_satisfied(own: &Version, approval: &Approval) -> bool {
    own >= &approval.version
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MarkerState {
    Absent,
    Fresh,
    Stale,
}

/// `exists` is whether the file is there; `marker` its parsed content. An
/// unreadable marker is Fresh until the file itself is old (by `file_age_ms`).
pub fn marker_state(exists: bool, marker: Option<&Updating>, file_age_ms: Option<i64>, now_ms: i64) -> MarkerState {
    if !exists {
        return MarkerState::Absent;
    }
    let age = match marker {
        Some(marker) => now_ms - marker.at_ms,
        None => file_age_ms.unwrap_or(0),
    };
    // A clock that jumped backwards gives a negative age; treat a far-future
    // stamp as stale too, so a bad clock can't block widget launches forever.
    if age > MARKER_STALE_MS || age < -MARKER_STALE_MS {
        MarkerState::Stale
    } else {
        MarkerState::Fresh
    }
}

/// A new widgets process clears the marker once its own install is done.
pub fn marker_done_for(own: &Version, marker: &Updating) -> bool {
    own >= &marker.to
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum WaitStep {
    Wait,
    /// Widgets' install finished (marker seen, then gone).
    WidgetsDone,
    /// Nothing to wait for or gave up; Facta installs itself now.
    Proceed,
}

/// Facta's wait after writing the approval (docs/updater.md section 4, step 4).
pub fn facta_wait_step(elapsed_ms: i64, widgets_running: bool, marker_now: bool, marker_seen: bool) -> WaitStep {
    if marker_now {
        return if elapsed_ms >= INSTALL_TIMEOUT_MS { WaitStep::Proceed } else { WaitStep::Wait };
    }
    if marker_seen {
        return WaitStep::WidgetsDone;
    }
    if !widgets_running && elapsed_ms >= NOT_RUNNING_GRACE_MS {
        return WaitStep::Proceed;
    }
    if elapsed_ms >= NO_REACTION_MS {
        return WaitStep::Proceed;
    }
    WaitStep::Wait
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(s: &str) -> Version {
        Version::parse(s).unwrap()
    }

    #[test]
    fn widgets_install_newer_or_equal_to_approved_only() {
        let own = v("1.0.0");
        assert!(widgets_should_install(&own, Some(&v("1.0.1")), &v("1.0.1")));
        assert!(widgets_should_install(&own, Some(&v("1.0.2")), &v("1.0.1")));
        assert!(!widgets_should_install(&own, Some(&v("1.0.0")), &v("1.0.1")));
        assert!(!widgets_should_install(&own, None, &v("1.0.1")));
        // Never "update" to the version already running.
        assert!(!widgets_should_install(&v("1.0.2"), Some(&v("1.0.2")), &v("1.0.1")));
    }

    #[test]
    fn approval_is_satisfied_at_or_above_its_version() {
        let approval = Approval { version: v("1.0.1"), at_ms: 0 };
        assert!(!approval_satisfied(&v("1.0.0"), &approval));
        assert!(approval_satisfied(&v("1.0.1"), &approval));
        assert!(approval_satisfied(&v("1.0.2"), &approval));
    }

    #[test]
    fn marker_freshness_uses_stamp_then_file_age() {
        let now = 10 * MARKER_STALE_MS;
        let fresh = Updating { from: v("1.0.0"), to: v("1.0.1"), at_ms: now - 1000 };
        let old = Updating { at_ms: now - MARKER_STALE_MS - 1, ..fresh.clone() };
        let future = Updating { at_ms: now + MARKER_STALE_MS + 1, ..fresh.clone() };
        assert_eq!(marker_state(false, None, None, now), MarkerState::Absent);
        assert_eq!(marker_state(true, Some(&fresh), None, now), MarkerState::Fresh);
        assert_eq!(marker_state(true, Some(&old), None, now), MarkerState::Stale);
        assert_eq!(marker_state(true, Some(&future), None, now), MarkerState::Stale);
        assert_eq!(marker_state(true, None, Some(1000), now), MarkerState::Fresh);
        assert_eq!(marker_state(true, None, Some(MARKER_STALE_MS + 1), now), MarkerState::Stale);
    }

    #[test]
    fn marker_is_done_once_running_the_target_version() {
        let marker = Updating { from: v("1.0.0"), to: v("1.0.1"), at_ms: 0 };
        assert!(!marker_done_for(&v("1.0.0"), &marker));
        assert!(marker_done_for(&v("1.0.1"), &marker));
    }

    #[test]
    fn facta_waits_for_a_started_install_until_timeout() {
        assert_eq!(facta_wait_step(1000, false, true, true), WaitStep::Wait);
        assert_eq!(facta_wait_step(INSTALL_TIMEOUT_MS - 1, false, true, true), WaitStep::Wait);
        assert_eq!(facta_wait_step(INSTALL_TIMEOUT_MS, false, true, true), WaitStep::Proceed);
        assert_eq!(facta_wait_step(2000, true, false, true), WaitStep::WidgetsDone);
    }

    #[test]
    fn facta_does_not_wait_long_when_nothing_happens() {
        assert_eq!(facta_wait_step(1000, false, false, false), WaitStep::Wait);
        assert_eq!(facta_wait_step(NOT_RUNNING_GRACE_MS, false, false, false), WaitStep::Proceed);
        assert_eq!(facta_wait_step(NOT_RUNNING_GRACE_MS, true, false, false), WaitStep::Wait);
        assert_eq!(facta_wait_step(NO_REACTION_MS, true, false, false), WaitStep::Proceed);
    }

    #[test]
    fn files_round_trip_and_ignore_garbage() {
        let dir = std::env::temp_dir().join(format!("facta-handshake-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(read_approval(&dir), None);
        write_approval(&dir, &v("1.0.1"), 42).unwrap();
        assert_eq!(read_approval(&dir), Some(Approval { version: v("1.0.1"), at_ms: 42 }));
        write_updating(&dir, &v("1.0.0"), &v("1.0.1"), 7).unwrap();
        assert!(updating_exists(&dir));
        assert_eq!(read_updating(&dir).unwrap().to, v("1.0.1"));
        assert!(!dir.join(format!("{UPDATING_FILE}.tmp")).exists());
        std::fs::write(dir.join(APPROVED_FILE), "{not json").unwrap();
        assert_eq!(read_approval(&dir), None);
        assert_eq!(parse_approval(r#"{"version":"v1","at":1}"#), None);
        remove_approval(&dir).unwrap();
        remove_approval(&dir).unwrap();
        remove_updating(&dir).unwrap();
        assert!(!updating_exists(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
