use super::clamp_to_monitors;

#[test]
fn widget_position_uses_fallback_screen_when_no_monitors_are_available() {
    assert_eq!(
        clamp_to_monitors(2000.0, 1200.0, 280.0, 360.0, &[]),
        (1870.0, 1030.0)
    );
}

#[test]
fn poisoned_widget_state_recovers_existing_data_for_later_updates() {
    use std::collections::HashSet;
    use std::sync::{Arc, Mutex};
    let state = Arc::new(Mutex::new(HashSet::from(["existing"])));
    let worker_state = Arc::clone(&state);
    let _ = std::thread::spawn(move || {
        let _guard = worker_state.lock().unwrap();
        panic!("simulate a failed state update");
    })
    .join();

    let mut recovered = super::lock_widget_state(&state, "widget state");
    assert!(recovered.contains("existing"));
    recovered.insert("new");
    drop(recovered);
    let recovered_again = super::lock_widget_state(&state, "widget state");
    assert!(recovered_again.contains("existing"));
    assert!(recovered_again.contains("new"));
}

#[test]
fn widget_runtime_error_is_reported_without_panicking() {
    let mut messages = Vec::new();
    super::report_widget_run(Err::<(), _>("runtime unavailable"), |message| {
        messages.push(message.to_string())
    });
    assert_eq!(
        messages,
        vec!["Could not run Facta Widgets: runtime unavailable"]
    );
}

#[test]
fn healthy_widget_state_remains_available() {
    let state = std::sync::Mutex::new(vec!["existing"]);
    let guard = super::lock_widget_state(&state, "widget state");
    assert_eq!(guard.as_slice(), &["existing"]);
}
