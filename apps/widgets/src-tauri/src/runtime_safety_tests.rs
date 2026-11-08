use super::clamp_to_monitors;

#[test]
fn widget_position_uses_fallback_screen_when_no_monitors_are_available() {
    assert_eq!(
        clamp_to_monitors(2000.0, 1200.0, 280.0, 360.0, &[]),
        (1640.0, 720.0)
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

#[test]
fn widget_positions_stay_inside_the_selected_work_area() {
    let monitors = [(0, 0, 1920, 1080, 1.0), (1920, 0, 1920, 1080, 1.0)];
    assert_eq!(clamp_to_monitors(-240.0, -250.0, 280.0, 360.0, &monitors), (0.0, 0.0));
    assert_eq!(clamp_to_monitors(3800.0, 1050.0, 280.0, 360.0, &monitors), (3560.0, 720.0));
    assert_eq!(clamp_to_monitors(0.0, 500.0, 3000.0, 2000.0, &monitors), (0.0, 0.0));
}

#[test]
fn move_bursts_are_coalesced_and_flushed_before_the_worker_exits() {
    let (sender, receiver) = std::sync::mpsc::channel();
    sender.send(()).unwrap();
    sender.send(()).unwrap();
    sender.send(()).unwrap();
    drop(sender);
    let mut saves = 0;
    super::save_after_position_events(receiver, std::time::Duration::from_millis(10), || false, || saves += 1);
    assert_eq!(saves, 1);
}

#[test]
fn position_save_waits_for_the_pointer_to_be_released() {
    use std::sync::{atomic::{AtomicBool, Ordering}, Arc, mpsc};
    use std::time::Duration;
    let (sender, receiver) = mpsc::channel();
    let (checked_tx, checked_rx) = mpsc::channel();
    let (saved_tx, saved_rx) = mpsc::channel();
    let held = Arc::new(AtomicBool::new(true));
    let worker_held = Arc::clone(&held);
    let worker = std::thread::spawn(move || {
        super::save_after_position_events(receiver, Duration::from_millis(10), || {
            let down = worker_held.load(Ordering::SeqCst);
            if down { let _ = checked_tx.send(()); }
            down
        }, || { let _ = saved_tx.send(()); });
    });
    sender.send(()).unwrap();
    checked_rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(saved_rx.try_recv().is_err());
    held.store(false, Ordering::SeqCst);
    saved_rx.recv_timeout(Duration::from_secs(2)).unwrap();
    drop(sender);
    worker.join().unwrap();
}
