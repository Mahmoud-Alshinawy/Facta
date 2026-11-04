use crate::startup::StartupStore;
use tauri_plugin_autostart::ManagerExt;
use winreg::{
    enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE},
    RegKey,
};

const RUN_KEY: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
const WIDGET_ENTRY: &str = "Facta Widgets";
const MAIN_ENTRY: &str = "Facta";

pub struct WindowsStartup<'a>(pub &'a tauri::AppHandle);

fn run_key() -> Result<RegKey, String> {
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(RUN_KEY, KEY_READ | KEY_SET_VALUE)
        .map_err(|e| format!("Could not open Windows startup settings: {e}"))
}

fn remove_value(key: &RegKey, name: &str) -> Result<(), String> {
    match key.delete_value(name) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Could not update Windows startup settings: {error}"
        )),
    }
}

fn cache_widget_path(value: &str) -> Result<(), String> {
    // The old widget plugin wrote its executable path with no startup arguments.
    let path = std::path::Path::new(value.trim().trim_matches('"'));
    if !path.is_absolute()
        || !path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("facta-widgets.exe"))
        || !path.is_file()
    {
        return Ok(());
    }
    let dir = dirs::data_local_dir()
        .ok_or("Could not find local app data")?
        .join("Facta");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not save widget location: {e}"))?;
    std::fs::write(
        dir.join("widget-app-path.txt"),
        path.to_string_lossy().as_bytes(),
    )
    .map_err(|e| format!("Could not save widget location: {e}"))
}

impl StartupStore for WindowsStartup<'_> {
    fn is_enabled(&self) -> Result<bool, String> {
        self.0.autolaunch().is_enabled().map_err(|e| e.to_string())
    }
    fn enable(&mut self) -> Result<(), String> {
        self.0.autolaunch().enable().map_err(|e| e.to_string())
    }
    fn disable(&mut self) -> Result<(), String> {
        remove_value(&run_key()?, MAIN_ENTRY)
    }
    fn remove_legacy_widget(&mut self) -> Result<(), String> {
        let key = run_key()?;
        match key.get_value::<String, _>(WIDGET_ENTRY) {
            Ok(value) => cache_widget_path(&value)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => {
                return Err(format!(
                    "Could not read the old widget startup setting: {error}"
                ))
            }
        }
        remove_value(&key, WIDGET_ENTRY)
    }
}
