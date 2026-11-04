pub trait StartupStore {
    fn is_enabled(&self) -> Result<bool, String>;
    fn enable(&mut self) -> Result<(), String>;
    fn disable(&mut self) -> Result<(), String>;
    fn remove_legacy_widget(&mut self) -> Result<(), String>;
}

pub fn read_enabled(store: &impl StartupStore) -> Result<bool, String> {
    store.is_enabled()
}
pub fn initialize(store: &mut impl StartupStore) -> Result<(), String> {
    store.remove_legacy_widget()
}

pub fn set_enabled(store: &mut impl StartupStore, enabled: bool) -> Result<(), String> {
    store.remove_legacy_widget()?;
    if enabled {
        store.enable()
    } else {
        store.disable()
    }
}

pub fn should_launch_widgets(from_login: bool, enabled: bool) -> bool {
    from_login && enabled
}

#[cfg(test)]
mod tests {
    use super::{initialize, read_enabled, set_enabled, should_launch_widgets, StartupStore};

    struct FakeStore {
        main: bool,
        legacy_widget: bool,
    }
    impl StartupStore for FakeStore {
        fn is_enabled(&self) -> Result<bool, String> {
            Ok(self.main)
        }
        fn enable(&mut self) -> Result<(), String> {
            self.main = true;
            Ok(())
        }
        fn disable(&mut self) -> Result<(), String> {
            self.main = false;
            Ok(())
        }
        fn remove_legacy_widget(&mut self) -> Result<(), String> {
            self.legacy_widget = false;
            Ok(())
        }
    }

    #[test]
    fn migration_failure_is_reported_without_changing_main_startup() {
        struct FailingStore {
            main: bool,
        }
        impl StartupStore for FailingStore {
            fn is_enabled(&self) -> Result<bool, String> {
                Ok(self.main)
            }
            fn enable(&mut self) -> Result<(), String> {
                self.main = true;
                Ok(())
            }
            fn disable(&mut self) -> Result<(), String> {
                self.main = false;
                Ok(())
            }
            fn remove_legacy_widget(&mut self) -> Result<(), String> {
                Err("denied".into())
            }
        }
        let mut store = FailingStore { main: true };
        assert_eq!(set_enabled(&mut store, false), Err("denied".into()));
        assert!(store.main);
    }

    #[test]
    fn turning_startup_on_requires_an_explicit_choice() {
        let mut store = FakeStore {
            main: false,
            legacy_widget: false,
        };
        assert_eq!(initialize(&mut store), Ok(()));
        assert_eq!(read_enabled(&store), Ok(false));
        assert_eq!(set_enabled(&mut store, true), Ok(()));
        assert_eq!(read_enabled(&store), Ok(true));
    }

    #[test]
    fn disabled_main_remains_disabled_during_widget_migration() {
        let mut store = FakeStore {
            main: false,
            legacy_widget: true,
        };
        assert_eq!(initialize(&mut store), Ok(()));
        assert!(!store.main);
        assert!(!store.legacy_widget);
    }
    #[test]
    fn widgets_follow_enabled_login_start_not_normal_or_disabled_launch() {
        assert!(should_launch_widgets(true, true));
        assert!(!should_launch_widgets(false, true));
        assert!(!should_launch_widgets(true, false));
    }
    #[test]
    fn turning_startup_off_stays_off_after_a_later_launch() {
        let mut store = FakeStore {
            main: true,
            legacy_widget: true,
        };
        assert_eq!(set_enabled(&mut store, false), Ok(()));
        assert_eq!(initialize(&mut store), Ok(()));
        assert_eq!(read_enabled(&store), Ok(false));
        assert!(!store.legacy_widget);
    }
    #[test]
    fn upgrading_preserves_enabled_main_and_removes_independent_widget_startup() {
        let mut store = FakeStore {
            main: true,
            legacy_widget: true,
        };
        assert_eq!(initialize(&mut store), Ok(()));
        assert!(store.main);
        assert!(!store.legacy_widget);
    }
    #[test]
    fn fresh_install_reports_startup_off() {
        let store = FakeStore {
            main: false,
            legacy_widget: false,
        };
        assert_eq!(read_enabled(&store), Ok(false));
    }
}
