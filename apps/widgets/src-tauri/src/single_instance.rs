use std::io;
#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{CloseHandle, GetLastError, SetLastError, ERROR_ALREADY_EXISTS, HANDLE},
    System::Threading::CreateMutexW,
};

pub(super) enum GuardDecision<T> {
    Start(Option<T>),
    Duplicate,
}

pub(super) fn decide_guard<T, E>(
    result: Result<Option<T>, E>,
    report: impl FnOnce(E),
) -> GuardDecision<T> {
    match result {
        Ok(Some(guard)) => GuardDecision::Start(Some(guard)),
        Ok(None) => GuardDecision::Duplicate,
        Err(error) => {
            report(error);
            GuardDecision::Start(None)
        }
    }
}

#[cfg(windows)]
pub(super) struct InstanceGuard(HANDLE);

#[cfg(not(windows))]
pub(super) struct InstanceGuard {
    // Closing the file releases the OS lock, including after a crash. Never
    // unlink a live lock file: that would let another process lock a new inode.
    _file: std::fs::File,
}

#[cfg(windows)]
impl Drop for InstanceGuard {
    fn drop(&mut self) {
        // SAFETY: The guard exclusively owns this valid mutex handle.
        unsafe {
            CloseHandle(self.0);
        }
    }
}

#[cfg(windows)]
pub(super) fn acquire(name: &str) -> io::Result<Option<InstanceGuard>> {
    let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY: The name is a null-terminated UTF-16 string and the default
    // security attributes require no borrowed state. We do not own the mutex;
    // the handle's lifetime alone keeps the named object alive.
    let handle = unsafe {
        SetLastError(0);
        CreateMutexW(std::ptr::null(), 0, wide.as_ptr())
    };
    if handle.is_null() {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: Read immediately after CreateMutexW, before another system call.
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        // SAFETY: This newly opened handle is no longer needed.
        unsafe {
            CloseHandle(handle);
        }
        Ok(None)
    } else {
        Ok(Some(InstanceGuard(handle)))
    }
}

#[cfg(not(windows))]
pub(super) fn acquire(path: &std::path::Path) -> io::Result<Option<InstanceGuard>> {
    use fs2::FileExt;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)?;
    match file.try_lock_exclusive() {
        Ok(()) => Ok(Some(InstanceGuard { _file: file })),
        Err(error) if error.kind() == io::ErrorKind::WouldBlock => Ok(None),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    use super::acquire;

    #[cfg(not(windows))]
    fn acquire(name: &str) -> std::io::Result<Option<super::InstanceGuard>> {
        // Use only the test temp directory, never the owner's widget data.
        let path = std::env::temp_dir().join(name.replace('\\', "_"));
        super::acquire(&path)
    }

    #[test]
    fn guard_creation_failure_logs_and_allows_widget_start() {
        let mut logged = None;
        let decision =
            super::decide_guard::<(), _>(Err("guard unavailable"), |error| logged = Some(error));
        assert!(matches!(decision, super::GuardDecision::Start(None)));
        assert_eq!(logged, Some("guard unavailable"));
        assert!(matches!(
            super::decide_guard::<_, &str>(Ok(Some(42)), |_| {}),
            super::GuardDecision::Start(Some(42))
        ));
        assert!(matches!(
            super::decide_guard::<(), &str>(Ok(None), |_| {}),
            super::GuardDecision::Duplicate
        ));
    }

    #[test]
    fn child_process_reports_existing_instance() {
        let Ok(name) = std::env::var("FACTA_TEST_MUTEX_NAME") else {
            return;
        };
        assert!(acquire(&name)
            .expect("child check should not fail")
            .is_none());
    }

    #[test]
    fn second_process_is_blocked_while_first_is_alive() {
        let name = format!("Local\\FactaWidgets-process-test-{}", std::process::id());
        let _guard = acquire(&name)
            .expect("first process should not fail")
            .expect("first process should own the name");
        let result = std::process::Command::new(std::env::current_exe().expect("test executable"))
            .args([
                "--exact",
                "single_instance::tests::child_process_reports_existing_instance",
            ])
            .env("FACTA_TEST_MUTEX_NAME", name)
            .output()
            .expect("child test should run");
        let output = String::from_utf8_lossy(&result.stdout);
        assert!(
            result.status.success() && output.contains("1 passed"),
            "child test did not pass: {output}"
        );
    }

    #[test]
    fn simultaneous_launches_admit_only_one_instance() {
        use std::sync::{Arc, Barrier};
        let name = format!("Local\\FactaWidgets-race-test-{}", std::process::id());
        let start = Arc::new(Barrier::new(12));
        let finish = Arc::new(Barrier::new(12));
        let threads: Vec<_> = (0..12)
            .map(|_| {
                let name = name.clone();
                let start = Arc::clone(&start);
                let finish = Arc::clone(&finish);
                std::thread::spawn(move || {
                    start.wait();
                    let guard = acquire(&name).expect("guard should be available");
                    let admitted = guard.is_some();
                    finish.wait();
                    admitted
                })
            })
            .collect();
        let admitted = threads
            .into_iter()
            .map(|thread| thread.join().expect("test thread failed"))
            .filter(|admitted| *admitted)
            .count();
        assert_eq!(admitted, 1);
    }

    #[test]
    fn second_launch_is_blocked_until_first_instance_exits() {
        let name = format!("Local\\FactaWidgets-test-{}", std::process::id());
        let first = acquire(&name)
            .expect("first launch should not fail")
            .expect("first launch should own the name");
        assert!(acquire(&name)
            .expect("second launch should not fail")
            .is_none());
        drop(first);
        assert!(acquire(&name)
            .expect("later launch should not fail")
            .is_some());
    }
}
