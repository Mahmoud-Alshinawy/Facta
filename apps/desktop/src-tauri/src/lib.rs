use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Emitter;
use tauri::Manager;
use tauri::RunEvent;
use std::env;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};

#[derive(Default)]
struct QuitState {
    requested: AtomicBool,
    allowed: AtomicBool,
    code: AtomicI32,
}

fn request_quit(app: &tauri::AppHandle, code: i32) {
    let state = app.state::<QuitState>();
    if state.requested.swap(true, Ordering::SeqCst) { return; }
    state.code.store(code, Ordering::SeqCst);
    let _ = app.emit("facta-request-quit", ());
    // A hung/hidden webview must not make Quit hang forever. JS has two seconds
    // to await IndexedDB; this native deadline also works when JS timers stall.
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(2200));
        finish_quit(handle);
    });
}

#[tauri::command]
fn finish_quit(app: tauri::AppHandle) {
    let state = app.state::<QuitState>();
    if !state.requested.load(Ordering::SeqCst) { return; }
    state.allowed.store(true, Ordering::SeqCst);
    app.exit(state.code.load(Ordering::SeqCst));
}

#[tauri::command]
fn quit_listener_ready(app: tauri::AppHandle) {
    if app.state::<QuitState>().requested.load(Ordering::SeqCst) {
        let _ = app.emit("facta-request-quit", ());
    }
}

struct WidgetActionDelivery(Mutex<Option<String>>);

fn external_note_url(value: &str) -> Result<String, String> {
    if value.chars().any(char::is_control) { return Err("Use an https, http or mailto link".into()); }
    let url = tauri::Url::parse(value.trim()).map_err(|_| "Invalid note link")?;
    if !matches!(url.scheme(), "http" | "https" | "mailto") { return Err("Use an https, http or mailto link".into()); }
    Ok(url.to_string())
}

#[tauri::command]
fn open_note_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    // Re-check in Rust immediately before passing a target to the OS opener.
    app.opener().open_url(external_note_url(&url)?, None::<&str>).map_err(|error| error.to_string())
}

#[cfg(test)]
mod note_link_tests {
    use super::external_note_url;
    #[test]
    fn note_links_allow_only_web_and_mail() {
        for url in ["https://example.com/", "http://example.com/", "mailto:a@example.com"] { assert!(external_note_url(url).is_ok()); }
        for url in ["javascript:alert(1)", "file:///C:/private", "facta://focus", "https://", "https://example.com\n", ""] { assert!(external_note_url(url).is_err()); }
    }
}

#[tauri::command]
fn set_widget_action_delivery(consumer_id: String, ready: bool, state: tauri::State<'_, WidgetActionDelivery>) -> Result<(), String> {
    let mut consumer = state.0.lock().map_err(|_| "Widget consumer lock failed")?;
    if ready {
        *consumer = Some(consumer_id);
    } else if consumer.as_ref() == Some(&consumer_id) {
        // A previous account's teardown must not pause a newer consumer.
        *consumer = None;
    }
    Ok(())
}

fn tray_icon(theme: tauri::Theme) -> tauri::image::Image<'static> {
    match theme {
        tauri::Theme::Light => tauri::include_image!("../public/tray-black.png"),
        _ => tauri::include_image!("../public/tray-white.png"),
    }
}

// Windows can use a different theme for apps and the taskbar.
fn tray_theme(_fallback: impl FnOnce() -> tauri::Theme) -> tauri::Theme {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::c_void;
        #[link(name = "advapi32")]
        extern "system" {
            fn RegGetValueW(
                key: *mut c_void,
                subkey: *const u16,
                value: *const u16,
                flags: u32,
                value_type: *mut u32,
                data: *mut c_void,
                size: *mut u32,
            ) -> i32;
        }
        let key: Vec<u16> = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"
            .encode_utf16().chain(Some(0)).collect();
        let name: Vec<u16> = "SystemUsesLightTheme".encode_utf16().chain(Some(0)).collect();
        let mut light: u32 = 0;
        let mut size = std::mem::size_of_val(&light) as u32;
        // HKCU is a predefined pseudo-handle; both strings are NUL-terminated,
        // and RRF_RT_REG_DWORD restricts the write to the four-byte buffer.
        let status = unsafe {
            RegGetValueW(
                -2147483647isize as *mut c_void,
                key.as_ptr(), name.as_ptr(), 0x00000010,
                std::ptr::null_mut(), &mut light as *mut u32 as *mut c_void,
                &mut size,
            )
        };
        if status == 0 && light == 1 { tauri::Theme::Light } else { tauri::Theme::Dark }
    }
    #[cfg(not(target_os = "windows"))]
    { _fallback() }
}

// ─── Commands ─────────────────────────────────────────────────────────────

#[tauri::command]
fn export_data_for_widgets(
    goals_json: String,
    events_json: String,
    config_json: String,
    journal_json: String,
    action_results_json: String,
    user_id: Option<String>,
    shared_goals_json: String,
) -> Result<(), String> {
    static EXPORT_LOCK: Mutex<()> = Mutex::new(());
    let _guard=EXPORT_LOCK.lock().map_err(|_| "Widget export lock failed")?;
    let shared_goals=widget_shared::parse(&shared_goals_json,user_id.as_deref())?;
    let local_app_data = dirs::data_local_dir()
        .ok_or_else(|| {
            eprintln!("[WidgetExport] failed: could not find local app data directory");
            "Could not find local app data directory"
        })?;
    let dir = local_app_data.join("Facta");
    if let Err(e) = std::fs::create_dir_all(&dir) {
        eprintln!("[WidgetExport] create_dir_all({:?}) failed: {}", dir, e);
        return Err(e.to_string());
    }
    let path = dir.join("widgets.json");
    let previous_ms=std::fs::read_to_string(&path).ok().and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok()).and_then(|v|v["exported_at_ms"].as_i64()).unwrap_or(0);
    let exported_ms=widget_shared::next_export_ms(chrono::Utc::now().timestamp_millis(),previous_ms);

    let config: serde_json::Value = serde_json::from_str(&config_json)
        .unwrap_or(serde_json::json!({ "widgets": [] }));

    let data = serde_json::json!({
        "goals": serde_json::from_str::<serde_json::Value>(&goals_json).unwrap_or(serde_json::json!([])),
        "events": serde_json::from_str::<serde_json::Value>(&events_json).unwrap_or(serde_json::json!([])),
        "config": config,
        "user_id": user_id,
        "shared_goals": shared_goals,
        "journal": serde_json::from_str::<serde_json::Value>(&journal_json).map_err(|e| e.to_string())?,
        "action_results": serde_json::from_str::<serde_json::Value>(&action_results_json).map_err(|e| e.to_string())?,
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "exported_at_ms": exported_ms,
    });

    let json = serde_json::to_string(&data).unwrap_or_else(|e| {
        eprintln!("[WidgetExport] JSON serialization failed: {}", e);
        String::new()
    });
    let bytes_written = json.len();
    if let Err(e) = std::fs::write(dir.join("widgets.json.tmp"), &json).and_then(|_| std::fs::rename(dir.join("widgets.json.tmp"), &path)) {
        eprintln!("[WidgetExport] write {:?} failed: {}", path, e);
        return Err(e.to_string());
    }
    eprintln!("[WidgetExport] success: wrote {} bytes to {:?}", bytes_written, path);
    Ok(())
}

#[tauri::command]
async fn widget_app_running() -> Result<bool, String> {
    // Check if already running (platform-specific)
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        let output = tokio::process::Command::new("tasklist")
            .args(&["/FI", "IMAGENAME eq facta-widgets.exe", "/FO", "CSV", "/NH"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .await
            .map_err(|e| format!("Failed to check running processes: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        if !output.status.success() { return Err("Failed to check running processes".to_string()); }
        return Ok(stdout.to_ascii_lowercase().contains("facta-widgets.exe"));
    }
    
    #[cfg(target_os = "macos")]
    {
        let output = tokio::process::Command::new("pgrep")
            .arg("-f")
            .arg("Facta Widgets")
            .output()
            .await
            .map_err(|e| format!("Failed to check running processes: {}", e))?;
        return Ok(output.status.success());
    }
    
    #[cfg(target_os = "linux")]
    {
        let output = tokio::process::Command::new("pgrep")
            .arg("-f")
            .arg("facta-widgets")
            .output()
            .await
            .map_err(|e| format!("Failed to check running processes: {}", e))?;
        return Ok(output.status.success());
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    Ok(false)
}

#[tauri::command]
async fn launch_widget_app() -> Result<(), String> {
    if widget_app_running().await? { return Ok(()); }

    // Platform-specific installation paths
    #[cfg(target_os = "windows")]
    let possible_paths = vec![
        dirs::data_local_dir().unwrap_or_default()
            .join("Facta Widgets")
            .join("facta-widgets.exe"),
        dirs::data_local_dir().unwrap_or_default()
            .join("Programs")
            .join("Facta Widgets")
            .join("facta-widgets.exe"),
        std::path::PathBuf::from("C:\\Program Files\\Facta Widgets\\facta-widgets.exe"),
        std::path::PathBuf::from("C:\\Program Files (x86)\\Facta Widgets\\facta-widgets.exe"),
    ];
    
    #[cfg(target_os = "macos")]
    let possible_paths = vec![
        std::path::PathBuf::from("/Applications/Facta Widgets.app/Contents/MacOS/Facta Widgets"),
        dirs::home_dir().unwrap_or_default()
            .join("Applications")
            .join("Facta Widgets.app")
            .join("Contents")
            .join("MacOS")
            .join("Facta Widgets"),
    ];
    
    #[cfg(target_os = "linux")]
    let possible_paths = vec![
        dirs::home_dir().unwrap_or_default()
            .join(".local")
            .join("bin")
            .join("facta-widgets"),
        std::path::PathBuf::from("/usr/bin/facta-widgets"),
        std::path::PathBuf::from("/usr/local/bin/facta-widgets"),
    ];
    
    for path in possible_paths {
        if path.exists() {
            match std::process::Command::new(&path).spawn() {
                Ok(_) => return Ok(()),
                Err(e) => return Err(format!("Found widget app at {:?} but failed to launch: {}", path, e)),
            }
        }
    }
    
    Err("Facta Widgets app not found. Please install it first.".to_string())
}

#[tauri::command]
fn read_pending_actions() -> Result<Vec<serde_json::Value>, String> {
    pending_actions(None)
}

#[tauri::command]
fn ack_widget_actions(ids: Vec<String>) -> Result<(), String> {
    pending_actions(Some(&ids)).map(|_| ())
}

// Read under the same lock as widget appends. Leave actions on disk until the
// webview acknowledges its cache, sync queue and receipt transaction committed.
fn pending_actions(ack: Option<&[String]>) -> Result<Vec<serde_json::Value>, String> {
    let path = dirs::data_local_dir()
        .ok_or("Could not find local app data directory")?
        .join("Facta")
        .join("pending-actions.json");

    if !path.exists() {
        return Ok(Vec::new());
    }

    // Hold an exclusive advisory lock across the whole read/acknowledge so a
    // widget app's write_action append can never interleave between the two.
    use fs2::FileExt;
    let mut file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(&path)
        .map_err(|e| format!("Failed to open pending actions: {}", e))?;

    let mut locked = false;
    for _ in 0..5 {
        if file.lock_exclusive().is_ok() {
            locked = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    if !locked {
        return Err("Failed to lock pending actions file".to_string());
    }

    let result = (|| -> Result<Vec<serde_json::Value>, String> {
        use std::io::{Read, Seek};
        file.seek(std::io::SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        let mut contents = String::new();
        file.read_to_string(&mut contents).map_err(|e| e.to_string())?;
        let actions: Vec<serde_json::Value> = if contents.trim().is_empty() { Vec::new() }
            else { serde_json::from_str(&contents).map_err(|e| format!("Invalid widget queue; original retained: {}", e))? };

        if ack.is_none() || actions.is_empty() {
            return Ok(actions);
        }
        let remaining: Vec<_> = actions.into_iter().filter(|action| {
            !action.get("id").and_then(|v| v.as_str()).map(|id| ack.unwrap().iter().any(|a| a == id)).unwrap_or(false)
        }).collect();

        // Rewrite the remaining actions — still under the same lock.
        file.seek(std::io::SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        file.set_len(0).map_err(|e| e.to_string())?;
        use std::io::Write;
        file.write_all(serde_json::to_string(&remaining).map_err(|e| e.to_string())?.as_bytes()).map_err(|e| e.to_string())?;
        file.flush().map_err(|e| e.to_string())?;

        file.sync_data().map_err(|e| e.to_string())?;
        Ok(remaining)
    })();

    let _ = file.unlock();
    result
}

// ─── Main ───────────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn configure_linux_webview() {
    // WebKitGTK can render a blank window when DMABUF or compositing is
    // incompatible with the user's Wayland/X11 graphics stack. Respect an
    // existing value so advanced users can opt into their preferred mode.
    if env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    if env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
        env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    configure_linux_webview();

    // Must be the first plugin. A second launch (e.g. the widget app opening
    // facta://focus) hands its args to this instance and exits instead
    // of starting a duplicate; the deep-link feature forwards the URL too.
    let mut builder = tauri::Builder::default()
        .manage(QuitState::default())
        .manage(WidgetActionDelivery(Mutex::new(None)))
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            finish_quit,
            quit_listener_ready,
            open_note_link,
            export_data_for_widgets,
            read_pending_actions,
            ack_widget_actions,
            set_widget_action_delivery,
            launch_widget_app,
            widget_app_running
        ]);

    builder = builder.setup(|app| {
        // Installed builds register facta:// via the installer. A dev
        // build never gets that, so the OS would launch whichever old copy is
        // installed instead; register this exe while developing.
        #[cfg(all(debug_assertions, any(windows, target_os = "linux")))]
        {
            use tauri_plugin_deep_link::DeepLinkExt;
            if let Err(e) = app.deep_link().register_all() {
                eprintln!("[Facta] deep link registration failed: {}", e);
            }
        }

        let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
        let show = MenuItem::with_id(app, "show", "Show Facta", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&show, &PredefinedMenuItem::separator(app)?, &quit])?;

        let _app_handle = app.handle().clone();
        let system_theme = tray_theme(|| app.get_webview_window("main")
            .and_then(|window| window.theme().ok()).unwrap_or(tauri::Theme::Dark));
        let _tray = TrayIconBuilder::with_id("facta-tray")
            .icon(tray_icon(system_theme))
            .tooltip("Facta")
            .menu(&menu)
            .on_menu_event(move |app, event| match event.id().as_ref() {
                "quit" => {
                    request_quit(app, 0);
                }
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                _ => {}
            })
            .on_tray_icon_event(move |tray, event| {
                if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                    if let Some(window) = tray.app_handle().get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            })
            .build(app)?;

        // Deliver pending widget actions from a native thread. A hidden (close-to-tray)
        // webview throttles JS timers, so polling there delayed widget
        // check-offs until the window was shown again.
        {
            // IndexedDB hydration can outlast the first polling interval.
            // Leave actions on disk until a signed-in consumer is listening.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_millis(400));
                if !handle.state::<WidgetActionDelivery>().0.lock().map(|consumer| consumer.is_some()).unwrap_or(false) {
                    continue;
                }
                match pending_actions(None) {
                    Ok(actions) if !actions.is_empty() => {
                        let _ = handle.emit("widget-actions", actions);
                    }
                    Ok(_) => {}
                    Err(e) => eprintln!("[Facta] pending_actions failed: {}", e),
                }
            });
        }

        // Enable autostart (cross-platform)
        {
            use tauri_plugin_autostart::ManagerExt;
            match app.autolaunch().enable() {
                Ok(_) => println!("[Facta] Autostart enabled"),
                Err(e) => eprintln!("[Facta] Failed to enable autostart: {}", e),
            }
        }

        // Check if --hidden flag was passed (autostart)
        let args: Vec<String> = env::args().collect();
        let hidden = args.contains(&"--hidden".to_string());

        if hidden {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();
            }
        }

        Ok(())
    });

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match event {
            RunEvent::ExitRequested { api, code, .. } => {
                if !app_handle.state::<QuitState>().allowed.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    request_quit(app_handle, code.unwrap_or(0));
                }
            }
            RunEvent::WindowEvent { label, event: win_event, .. } => {
                if label == "main" {
                    if let tauri::WindowEvent::ThemeChanged(theme) = &win_event {
                        if let Some(tray) = app_handle.tray_by_id("facta-tray") {
                            let _ = tray.set_icon(Some(tray_icon(tray_theme(|| *theme))));
                        }
                    }
                    if let tauri::WindowEvent::CloseRequested { api, .. } = win_event {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.hide();
                        }
                        api.prevent_close();
                    }
                }
            }
            _ => {}
        }
    });
}
mod widget_shared;
