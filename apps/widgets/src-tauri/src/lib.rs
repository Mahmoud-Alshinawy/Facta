use tauri::{Manager, WebviewWindowBuilder, WebviewUrl};
use tauri::tray::TrayIconBuilder;
use tauri::menu::{Menu, MenuItem};
use tauri_plugin_opener::OpenerExt;
use std::collections::{HashMap, HashSet};
use std::io::{Read, Seek};
use std::path::PathBuf;
use std::sync::Mutex;
use fs2::FileExt;

fn tray_icon(theme: tauri::Theme) -> tauri::image::Image<'static> {
    match theme {
        tauri::Theme::Light => tauri::include_image!("../../desktop/public/tray-black.png"),
        _ => tauri::include_image!("../../desktop/public/tray-white.png"),
    }
}

// ─── State ────────────────────────────────────────────────────────────────────

struct WidgetState {
    user_closed: Mutex<HashSet<String>>,
    window_positions: Mutex<HashMap<String, WindowPos>>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct WindowPos {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl WidgetState {
    fn new() -> Self {
        Self {
            user_closed: Mutex::new(load_user_closed()),
            window_positions: Mutex::new(load_positions()),
        }
    }
}

fn state_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_default()
        .join("Facta")
}

fn user_closed_path() -> PathBuf {
    state_path().join("widget-state.json")
}

fn positions_path() -> PathBuf {
    state_path().join("widget-positions.json")
}

fn load_user_closed() -> HashSet<String> {
    if let Ok(contents) = std::fs::read_to_string(user_closed_path()) {
        if let Ok(data) = serde_json::from_str::<serde_json::Value>(&contents) {
            if let Some(arr) = data.get("user_closed").and_then(|v| v.as_array()) {
                return arr.iter().filter_map(|v| v.as_str().map(String::from)).collect();
            }
        }
    }
    HashSet::new()
}

fn save_user_closed(set: &HashSet<String>) {
    let data = serde_json::json!({ "user_closed": set.iter().collect::<Vec<_>>() });
    let _ = std::fs::create_dir_all(state_path());
    let _ = std::fs::write(user_closed_path(), serde_json::to_string(&data).unwrap_or_default());
}

fn load_positions() -> HashMap<String, WindowPos> {
    if let Ok(contents) = std::fs::read_to_string(positions_path()) {
        if let Ok(map) = serde_json::from_str::<HashMap<String, WindowPos>>(&contents) {
            return map;
        }
    }
    HashMap::new()
}

fn save_positions(map: &HashMap<String, WindowPos>) {
    let _ = std::fs::create_dir_all(state_path());
    let _ = std::fs::write(positions_path(), serde_json::to_string(map).unwrap_or_default());
}

// ─── Logging ────────────────────────────────────────────────────────────────

fn log(msg: &str) {
    let path = state_path().join("widget-app.log");
    let _ = std::fs::create_dir_all(state_path());
    let _ = (|| -> std::io::Result<()> {
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        writeln!(f, "[{}] {}", ts, msg)?;
        Ok(())
    })();
}

// ─── Monitor and coordinate helpers ──────────────────────────────────────────

/// Get work areas and scale factors for all available monitors
/// Returns: Vec<(x, y, width, height, scale_factor)>
fn get_monitor_work_areas(app: &tauri::AppHandle) -> Vec<(i32, i32, u32, u32, f64)> {
    let mut monitors = Vec::new();
    
    if let Ok(available) = app.available_monitors() {
        for monitor in available {
            let scale = monitor.scale_factor();
            
            // Use work area (excludes taskbar)
            let work_area = monitor.work_area();
            let wpos = work_area.position;
            let wsize = work_area.size;
            
            monitors.push((wpos.x, wpos.y, wsize.width, wsize.height, scale));
        }
    }
    
    // Fallback: assume a single 1920x1080 monitor at 100% DPI
    if monitors.is_empty() {
        monitors.push((0, 0, 1920, 1080, 1.0));
    }
    
    monitors
}

/// Convert physical pixels to logical pixels
fn physical_to_logical(physical: i32, scale: f64) -> f64 {
    physical as f64 / scale
}

/// Clamp a window position to ensure it's visible on at least one monitor
/// Returns clamped (x, y) in logical coordinates
fn clamp_to_monitors(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    monitors: &[(i32, i32, u32, u32, f64)],
) -> (f64, f64) {
    // Find the monitor that contains the most of the window
    let mut best_monitor = None;
    let mut best_overlap = 0.0;
    
    for &(mon_x, mon_y, mon_w, mon_h, scale) in monitors {
        let mon_x_log = physical_to_logical(mon_x, scale);
        let mon_y_log = physical_to_logical(mon_y, scale);
        let mon_w_log = physical_to_logical(mon_w as i32, scale);
        let mon_h_log = physical_to_logical(mon_h as i32, scale);
        
        // Calculate overlap
        let overlap_x = (x + width).min(mon_x_log + mon_w_log) - x.max(mon_x_log);
        let overlap_y = (y + height).min(mon_y_log + mon_h_log) - y.max(mon_y_log);
        let overlap = overlap_x.max(0.0) * overlap_y.max(0.0);
        
        if overlap > best_overlap {
            best_overlap = overlap;
            best_monitor = Some((mon_x_log, mon_y_log, mon_w_log, mon_h_log));
        }
    }
    
    // If window doesn't overlap any monitor, use the first monitor
    let (mon_x, mon_y, mon_w, mon_h) = best_monitor.unwrap_or_else(|| {
        let &(mx, my, mw, mh, scale) = monitors.first().unwrap();
        (
            physical_to_logical(mx, scale),
            physical_to_logical(my, scale),
            physical_to_logical(mw as i32, scale),
            physical_to_logical(mh as i32, scale),
        )
    });
    
    // Clamp to ensure at least 50px of the window is visible
    let min_visible = 50.0;
    let clamped_x = x.max(mon_x - width + min_visible).min(mon_x + mon_w - min_visible);
    let clamped_y = y.max(mon_y - height + min_visible).min(mon_y + mon_h - min_visible);
    
    (clamped_x, clamped_y)
}

// ─── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
fn read_shared_data() -> Result<serde_json::Value, String> {
    let path = dirs::data_local_dir()
        .ok_or("Could not find local app data directory")?
        .join("Facta")
        .join("widgets.json");
    
    if !path.exists() {
        log(&format!("widgets.json not found at {:?}", path));
        return Ok(serde_json::json!({ "goals": [], "events": [], "config": { "widgets": [] } }));
    }
    
    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read shared data: {}", e))?;
    
    let data: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse shared data: {}", e))?;
    
    log(&format!("Read widgets.json: {} widgets", 
        data.get("config").and_then(|c| c.get("widgets")).and_then(|w| w.as_array()).map(|a| a.len()).unwrap_or(0)));
    
    Ok(data)
}

#[tauri::command]
fn close_widget(app: tauri::AppHandle, state: tauri::State<WidgetState>, label: String) {
    let id = label.strip_prefix("widget-").unwrap_or(&label).to_string();
    state.user_closed.lock().unwrap().insert(id);
    save_user_closed(&state.user_closed.lock().unwrap());
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.close();
    }
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle, state: tauri::State<WidgetState>) {
    save_current_positions(&app, &state);
    for (_, window) in app.webview_windows() {
        let _ = window.close();
    }
    app.exit(0);
}

#[tauri::command]
fn open_main_app(app: tauri::AppHandle) -> Result<(), String> {
    app.opener()
        .open_url("facta://focus", None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_action(action_json: String) -> Result<(), String> {
    let path = dirs::data_local_dir()
        .ok_or("Could not find local app data directory")?
        .join("Facta")
        .join("pending-actions.json");

    let dir = path.parent().unwrap();
    if let Err(e) = std::fs::create_dir_all(dir) {
        let msg = format!("create_dir_all({:?}) failed: {}", dir, e);
        log(&msg);
        eprintln!("[WidgetAction] {}", msg);
        return Err(msg);
    }

    let action: serde_json::Value = match serde_json::from_str(&action_json) {
        Ok(a) => a,
        Err(e) => {
            let msg = format!("Invalid action JSON: {}", e);
            log(&msg);
            eprintln!("[WidgetAction] {}", msg);
            return Err(msg);
        }
    };
    let action_id = action.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());

    // Hold an exclusive advisory lock across the whole read-modify-write so the
    // planner app can never interleave a read+clear between our read and write.
    let mut file = match std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(&path)
    {
        Ok(f) => f,
        Err(e) => {
            let msg = format!("Failed to open pending actions: {}", e);
            log(&msg);
            eprintln!("[WidgetAction] {}", msg);
            return Err(msg);
        }
    };

    // Brief retry loop: better to fail one click than to deadlock.
    let mut locked = false;
    for attempt in 0..5 {
        if file.lock_exclusive().is_ok() {
            locked = true;
            break;
        }
        if attempt == 4 {
            let msg = format!("lock attempt {} failed: {:?}", attempt, file.lock_exclusive().err());
            log(&msg);
            eprintln!("[WidgetAction] {}", msg);
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    if !locked {
        let msg = "Failed to lock pending actions file after 5 attempts".to_string();
        log(&msg);
        eprintln!("[WidgetAction] {}", msg);
        return Err(msg);
    }

    let result = (|| -> Result<(), String> {
        if let Err(e) = file.seek(std::io::SeekFrom::Start(0)) {
            let msg = format!("seek failed: {}", e);
            log(&msg);
            eprintln!("[WidgetAction] {}", msg);
            return Err(msg);
        }
        let mut contents = String::new();
        // Read may fail on a fresh empty file; treat as empty queue.
        if let Err(e) = file.read_to_string(&mut contents) {
            let msg = format!("read_to_string failed (treating as empty queue): {}", e);
            log(&msg);
            eprintln!("[WidgetAction] {}", msg);
            contents = String::new();
        }
        let mut actions: Vec<serde_json::Value> =
            serde_json::from_str(&contents).unwrap_or_default();

        // De-dup: skip if the same action id is already queued.
        if let Some(id) = action.get("id").and_then(|v| v.as_str()) {
            if actions.iter().any(|a| a.get("id").and_then(|v| v.as_str()) == Some(id)) {
                let msg = format!("action {} already queued, skipping (dedup)", id);
                log(&msg);
                eprintln!("[WidgetAction] {}", msg);
                return Ok(());
            }
        }
        actions.push(action);

        if let Err(e) = file.seek(std::io::SeekFrom::Start(0)) {
            let msg = format!("seek (write) failed: {}", e);
            log(&msg);
            eprintln!("[WidgetAction] {}", msg);
            return Err(msg);
        }
        if let Err(e) = file.set_len(0) {
            let msg = format!("set_len failed: {}", e);
            log(&msg);
            eprintln!("[WidgetAction] {}", msg);
            return Err(msg);
        }
        let json = serde_json::to_string(&actions).unwrap_or("[]".into());
        let bytes_written = json.len();
        let write_result = write_all(&mut file, json);
        if let Err(e) = &write_result {
            let msg = format!("write_all failed: {}", e);
            log(&msg);
            eprintln!("[WidgetAction] {}", msg);
        }
        if write_result.is_ok() {
            let msg = format!(
                "write_action success: wrote {} ({} bytes) to queue ({} actions pending)",
                action_id.as_deref().unwrap_or("<no id>"),
                bytes_written,
                actions.len()
            );
            log(&msg);
            eprintln!("[WidgetAction] {}", msg);
        }
        write_result
    })();

    let _ = file.unlock();
    result
}

fn write_all(file: &mut std::fs::File, s: String) -> Result<(), String> {
    use std::io::Write;
    file.write_all(s.as_bytes()).map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Save widget window positions ─────────────────────────────────────────────

fn save_current_positions(app: &tauri::AppHandle, state: &tauri::State<WidgetState>) {
    let monitors = get_monitor_work_areas(app);
    let mut positions = state.window_positions.lock().unwrap();
    
    for (label, window) in app.webview_windows() {
        if !label.starts_with("widget-") { continue; }
        
        if let (Ok(pos), Ok(size)) = (window.outer_position(), window.inner_size()) {
            // Find the monitor this window is on to get its scale factor
            let scale = monitors.iter()
                .find(|&&(mon_x, mon_y, mon_w, mon_h, _)| {
                    let wx = pos.x;
                    let wy = pos.y;
                    wx >= mon_x && wx < mon_x + mon_w as i32 &&
                    wy >= mon_y && wy < mon_y + mon_h as i32
                })
                .map(|&(_, _, _, _, scale)| scale)
                .unwrap_or(1.0);
            
            // Convert physical to logical coordinates
            let logical_x = physical_to_logical(pos.x, scale);
            let logical_y = physical_to_logical(pos.y, scale);
            let logical_w = physical_to_logical(size.width as i32, scale);
            let logical_h = physical_to_logical(size.height as i32, scale);
            
            let id = label.strip_prefix("widget-").unwrap_or(&label).to_string();
            positions.insert(id, WindowPos {
                x: logical_x,
                y: logical_y,
                width: logical_w,
                height: logical_h,
            });
            
            log(&format!("Saved {} position: logical ({:.1}, {:.1}) size {:.1}x{:.1} (scale: {:.2})", 
                label, logical_x, logical_y, logical_w, logical_h, scale));
        }
    }
    save_positions(&positions);
}

// ─── Widget window spawner ────────────────────────────────────────────────────

fn spawn_or_update_widgets(app: &tauri::AppHandle, state: &tauri::State<WidgetState>) -> Result<(), String> {
    let data = read_shared_data()?;
    let config = data.get("config").cloned().unwrap_or(serde_json::json!({ "widgets": [] }));
    let widgets = config.get("widgets").and_then(|w| w.as_array()).cloned().unwrap_or_default();
    
    log(&format!("spawn_or_update_widgets: {} widgets in config", widgets.len()));
    
    if widgets.is_empty() {
        log("No widgets configured, skipping spawn");
    }

    // Get monitor information for coordinate handling
    let monitors = get_monitor_work_areas(app);
    log(&format!("Found {} monitor(s)", monitors.len()));

    // Save current positions before potentially closing windows
    save_current_positions(app, state);
    
    // Collect all enabled widget IDs from config
    let enabled_ids: HashSet<String> = widgets.iter()
        .filter(|w| w.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true))
        .filter_map(|w| w.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();
    
    // Remove user_closed entries for widgets that are now enabled in config
    let mut user_closed = state.user_closed.lock().unwrap();
    user_closed.retain(|id| !enabled_ids.contains(id));
    let positions = state.window_positions.lock().unwrap();
    
    let mut expected_labels: Vec<String> = Vec::new();
    let mut spawned_count = 0;
    
    for (index, w) in widgets.iter().enumerate() {
        let id = w.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let enabled = w.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
        let widget_type = w.get("type").and_then(|v| v.as_str()).unwrap_or("tasks").to_string();
        let translucent = w.get("translucent").and_then(|v| v.as_bool()).unwrap_or(true);
        let theme = w.get("theme").and_then(|v| v.as_str()).unwrap_or("midnight").to_string();
        
        if !enabled || id.is_empty() {
            continue;
        }
        
        let label = format!("widget-{}", id);
        
        if user_closed.contains(&id) {
            log(&format!("Skipping {} (user closed)", label));
            continue;
        }
        
        expected_labels.push(label.clone());
        
        if let Some(window) = app.get_webview_window(&label) {
            // Only correct position/size if the window has genuinely drifted
            // from where it should be (e.g. a monitor was disconnected and the
            // window ended up off-screen). This function runs on every routine
            // widgets.json refresh (roughly every 10s, whenever the main app
            // exports data), so unconditionally calling set_position/set_size
            // here was fighting with OS-level window management — most visibly
            // when a widget was near a screen edge and Windows' snap animation
            // was running, which caused jitter and could crash the window.
            if let Some(pos) = positions.get(&id) {
                let (clamped_x, clamped_y) = clamp_to_monitors(
                    pos.x, pos.y, pos.width, pos.height, &monitors
                );

                if let (Ok(live_pos), Ok(live_size)) = (window.outer_position(), window.inner_size()) {
                    let scale = monitors.iter()
                        .find(|&&(mon_x, mon_y, mon_w, mon_h, _)| {
                            live_pos.x >= mon_x && live_pos.x < mon_x + mon_w as i32 &&
                            live_pos.y >= mon_y && live_pos.y < mon_y + mon_h as i32
                        })
                        .map(|&(_, _, _, _, scale)| scale)
                        .unwrap_or(1.0);

                    let live_x = physical_to_logical(live_pos.x, scale);
                    let live_y = physical_to_logical(live_pos.y, scale);
                    let live_w = physical_to_logical(live_size.width as i32, scale);
                    let live_h = physical_to_logical(live_size.height as i32, scale);

                    let drifted = (live_x - clamped_x).abs() > 2.0
                        || (live_y - clamped_y).abs() > 2.0
                        || (live_w - pos.width).abs() > 2.0
                        || (live_h - pos.height).abs() > 2.0;

                    if drifted {
                        let _ = window.set_position(tauri::Position::Logical(
                            tauri::LogicalPosition { x: clamped_x, y: clamped_y }
                        ));
                        let _ = window.set_size(tauri::Size::Logical(
                            tauri::LogicalSize { width: pos.width, height: pos.height }
                        ));
                        log(&format!("Corrected drifted position for {} to logical ({:.1}, {:.1}) size {:.1}x{:.1}",
                            label, clamped_x, clamped_y, pos.width, pos.height));
                    }
                }
            }
            continue;
        }
        
        let saved_pos = positions.get(&id);
        let default_x = 50.0 + (index as f64 * 30.0);
        let default_y = 50.0 + (index as f64 * 30.0);
        let x = saved_pos.map(|p| p.x).unwrap_or(default_x);
        let y = saved_pos.map(|p| p.y).unwrap_or(default_y);
        
        let (default_w, default_h) = match widget_type.as_str() {
            "progress" => (240.0, 260.0),
            "events" => (280.0, 300.0),
            "calendar" => (260.0, 280.0),
            "dayview" => (300.0, 400.0),
            _ => (280.0, 360.0),
        };
        let width = saved_pos.map(|p| p.width).unwrap_or(default_w);
        let height = saved_pos.map(|p| p.height).unwrap_or(default_h);
        
        // Clamp position to ensure it's visible on screen
        let (clamped_x, clamped_y) = clamp_to_monitors(x, y, width, height, &monitors);
        
        let url = format!("/?widget={}&theme={}&translucent={}", widget_type, theme, translucent);
        
        log(&format!("Creating window {} at logical ({:.1}, {:.1}) size {:.1}x{:.1}", 
            label, clamped_x, clamped_y, width, height));
        
        match WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
            .title(&id)
            .inner_size(width, height)
            .min_inner_size(180.0, 180.0)
            .position(clamped_x, clamped_y)
            .decorations(false)
            .transparent(true)
            .skip_taskbar(true)
            .visible(true)
            .resizable(true)
            .always_on_bottom(true)
            .build()
        {
            Ok(_) => {
                log(&format!("Successfully created {}", label));
                spawned_count += 1;
            }
            Err(e) => {
                log(&format!("FAILED to create {}: {}", label, e));
            }
        }
    }
    
    // Close windows no longer in config
    for (label, window) in app.webview_windows() {
        if label.starts_with("widget-") && !expected_labels.contains(&label) {
            log(&format!("Closing {} (not in config)", label));
            let _ = window.close();
            let id = label.strip_prefix("widget-").unwrap_or(&label).to_string();
            user_closed.remove(&id);
        }
    }
    
    save_user_closed(&user_closed);
    log(&format!("Spawn cycle complete. Spawned {} windows.", spawned_count));
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let t0 = std::time::Instant::now();
    log("Starting Facta Widgets companion app");
    
    tauri::Builder::default()
        .manage(WidgetState::new())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .invoke_handler(tauri::generate_handler![
            read_shared_data,
            close_widget,
            quit_app,
            open_main_app,
            write_action
        ])
        .on_window_event(|window, event| {
            if window.label() == "keeper" {
                if let tauri::WindowEvent::ThemeChanged(theme) = event {
                    if let Some(tray) = window.app_handle().tray_by_id("facta-widgets-tray") {
                        let _ = tray.set_icon(Some(tray_icon(*theme)));
                    }
                }
            }
        })
        .setup(move |app| {
            log(&format!("Setup phase (T+{}ms)", t0.elapsed().as_millis()));
            
            // Create tray icon to keep app alive
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_item])?;
            
            let tray = TrayIconBuilder::with_id("facta-widgets-tray")
                .icon(tray_icon(tauri::Theme::Dark))
                .tooltip("Facta Widgets")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        log("Quit requested from tray");
                        let state: tauri::State<WidgetState> = app.state::<WidgetState>();
                        save_current_positions(app, &state);
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;
            
            log(&format!("Tray icon created (T+{}ms)", t0.elapsed().as_millis()));
            
            // Enable autostart (cross-platform)
            {
                let app_handle = app.app_handle().clone();
                use tauri_plugin_autostart::ManagerExt;
                match app_handle.autolaunch().enable() {
                    Ok(_) => log("Autostart enabled"),
                    Err(e) => log(&format!("Failed to enable autostart: {}", e)),
                }
            }
            
            // Keeper window to keep app alive in background
            match WebviewWindowBuilder::new(app, "keeper", WebviewUrl::App("/".into()))
                .inner_size(1.0, 1.0)
                .position(-10000.0, -10000.0)
                .decorations(false)
                .transparent(true)
                .skip_taskbar(true)
                .visible(false)
                .build()
            {
                Ok(_) => log(&format!("Keeper window created (T+{}ms)", t0.elapsed().as_millis())),
                Err(e) => log(&format!("Keeper window failed: {}", e)),
            }

            let system_theme = app.get_webview_window("keeper")
                .and_then(|window| window.theme().ok()).unwrap_or(tauri::Theme::Dark);
            tray.set_icon(Some(tray_icon(system_theme)))?;
            let app_handle = app.app_handle().clone();
            let state: tauri::State<WidgetState> = app.state::<WidgetState>();
            
            // Initial spawn - immediate
            log(&format!("Initial spawn... (T+{}ms)", t0.elapsed().as_millis()));
            match spawn_or_update_widgets(&app_handle, &state) {
                Ok(_) => log(&format!("Initial spawn complete (T+{}ms)", t0.elapsed().as_millis())),
                Err(e) => log(&format!("Initial spawn failed: {}", e)),
            }
            
            // Watch for config changes using file system notifications
            std::thread::spawn(move || {
                use notify::{Watcher, RecursiveMode, Event, EventKind};
                use std::sync::mpsc::channel;
                use std::time::Duration;
                
                let (tx, rx) = channel();
                
                let mut watcher = match notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
                    if let Ok(event) = res {
                        if matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                            if event.paths.iter().any(|p| {
                                p.file_name().map_or(false, |f| f == "widgets.json")
                            }) {
                                let _ = tx.send(());
                            }
                        }
                    }
                }) {
                    Ok(w) => w,
                    Err(e) => {
                        log(&format!("Failed to create file watcher: {}", e));
                        return;
                    }
                };
                
                let widgets_path = dirs::data_local_dir()
                    .unwrap_or_default()
                    .join("Facta")
                    .join("widgets.json");
                
                let watch_dir = widgets_path.parent().unwrap();
                
                if let Err(e) = watcher.watch(watch_dir, RecursiveMode::NonRecursive) {
                    log(&format!("Failed to watch directory {:?}: {}", watch_dir, e));
                    return;
                }
                
                log(&format!("Watching {:?} for changes", watch_dir));
                
                // Debounce: fire once after 100ms of quiet
                let mut last_change = std::time::Instant::now() - Duration::from_secs(1);
                let mut pending = false;
                loop {
                    match rx.recv_timeout(Duration::from_millis(50)) {
                        Ok(_) => {
                            last_change = std::time::Instant::now();
                            pending = true;
                        }
                        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                            if pending && last_change.elapsed() >= Duration::from_millis(100) {
                                pending = false;
                                log("Config changed, spawning widgets...");
                                let state: tauri::State<WidgetState> = app_handle.state::<WidgetState>();
                                match spawn_or_update_widgets(&app_handle, &state) {
                                    Ok(_) => log("Spawn complete"),
                                    Err(e) => log(&format!("Spawn failed: {}", e)),
                                }
                            }
                        }
                        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                            log("File watcher disconnected");
                            break;
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
