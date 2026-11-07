#[test]
fn desktop_build_failure_is_reported_without_panicking() {
    let mut messages = Vec::new();
    let app = super::finish_app_build(Err::<(), _>("runtime unavailable"), |message| {
        messages.push(message.to_string())
    });
    assert!(app.is_none());
    assert_eq!(messages, vec!["Could not start Facta: runtime unavailable"]);
}

#[test]
fn startup_log_unavailable_path_returns_error_without_panicking() {
    let invalid = std::path::Path::new("invalid\0directory");
    let result = std::panic::catch_unwind(|| super::append_startup_log(invalid, "failure"));
    assert!(matches!(result, Ok(Err(_))));
}

#[test]
fn successful_desktop_build_continues_without_reporting_error() {
    let mut reported = false;
    let app = super::finish_app_build(Ok::<_, &str>(42), |_| reported = true);
    assert_eq!(app, Some(42));
    assert!(!reported);
}
