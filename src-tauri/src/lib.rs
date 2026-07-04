use dirs::document_dir;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value, from_value};
use std::env;
use tauri_plugin_store::{ StoreExt };
use std::fs::{create_dir_all, File};
use std::io::{self, Write};
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    LazyLock, Mutex,
};
use tauri::{
    menu::MenuBuilder,LogicalSize,LogicalPosition,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

const TRAY_ICON: tauri::image::Image<'static> = tauri::include_image!("icons/32x32.png");
#[derive(Default)]
struct LockState {
    labels: Mutex<Vec<String>>,
}
#[derive(Default)]
struct AppState {
    allow_exit: AtomicBool,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct Config {
    screen_width: f64,
    screen_height: f64,
    width: f64,
    height: f64,
    scale: f64,
    font_size: f64,
    x: f64,
    y: f64,
}

static CONFIG: LazyLock<Mutex<Config>> = LazyLock::new(|| {
    Mutex::new(Config {
        screen_width: 1000.0,
        screen_height: 750.0,
        width: 80.0,
        height: 30.0,
        scale: 1.0,
        font_size: 14.0,
        x: -1.0,
        y: -1.0,
    })
});

#[tauri::command]
async fn get_default_size(app: tauri::AppHandle) -> Result<(), String> {
    let monitor_opt = app.primary_monitor().map_err(|e| e.to_string())?;
    if let Some(monitor) = monitor_opt {
        // 动态获取或创建 store
        let store = app.store("config.json").map_err(|e| e.to_string())?;
        let size = monitor.size();
        let mut config = CONFIG.lock().unwrap();
        config.scale = monitor.scale_factor();
        config.screen_width = (size.width as f64 / config.scale).floor() as f64;
        config.screen_height = (size.height as f64 / config.scale).floor() as f64;

        if let Some(value) = store.get("screenInfo") {
            let prev: Config = from_value(value.clone())
                .map_err(|e| format!("Failed to deserialize: {}", e))?;
            if config.scale != prev.scale
                || config.screen_width != prev.screen_width
                || config.screen_height != prev.screen_height {
                let x0 = (config.screen_width / 3.0).floor() as f64;
                let y0 = config.screen_height - 150.0;
                if prev.x > config.screen_width - prev.width || prev.y > config.screen_height - prev.height {
                    config.x = x0;
                    config.y = y0;
                } else {
                    config.x = prev.x;
                    config.y = prev.y;
                }
                config.width = prev.width;
                config.height = prev.height;
                config.font_size = prev.font_size;
                
                store.set("screenInfo", json!({
                    "screen_width": config.screen_width,
                    "screen_height": config.screen_height,
                    "width": config.width,
                    "height": config.height,
                    "scale": config.scale,
                    "font_size": config.font_size,
                    "x": config.x,
                    "y": config.y,
                }));
                store.save().map_err(|e| e.to_string())?;
            }
        } else {
            config.x = (config.screen_width / 3.0).floor() as f64;
            config.y = config.screen_height - 150.0;
            store.set("screenInfo", json!({
                "screen_width": config.screen_width,
                "screen_height": config.screen_height,
                "width": config.width,
                "height": config.height,
                "scale": config.scale,
                "font_size": config.font_size,
                "x": config.x,
                "y": config.y,
            }));
            store.save().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn show_lock_windows(
    app: tauri::AppHandle,
    state: tauri::State<'_, LockState>,
) -> Result<(), String> {
    let mut labels = state.labels.lock().map_err(|_| "锁状态被占用")?;
    if !labels.is_empty() {
        for label in labels.iter() {
            if let Some(window) = app.get_webview_window(label) {
                let _ = window.set_always_on_top(true);
                let _ = window.show();
                let _ = window.set_focus();
            }
            let Some(main_window) = app.get_webview_window("main") else {
                return Ok(());
            };
            let _ = main_window.hide();
        }
        return Ok(());
    }
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    if let Some(value) = store.get("screenInfo") {
        let size: Config = from_value(value.clone())
            .map_err(|e| format!("Failed to deserialize: {}", e))?;
        let label = format!("lockscreen-primary");
        let width = size.width as f64;
        let height = size.height as f64;
        let x = size.x as f64;
        let y = size.y as f64;
    
        let url = format!("index.html?lockscreen=1&end={}", 33,);
        let window = WebviewWindowBuilder::new(&app, label.clone(), WebviewUrl::App(url.into()))
            .decorations(false)
            .transparent(false)
            .resizable(false)
            .drag_and_drop(true)
            .always_on_top(true)
            .position(x, y)
            .build()
            .map_err(|err| err.to_string())?;
    
        apply_default_window_icon(&app, &window);
        let _ = window.set_fullscreen(false);
        let _ = window.set_focus();
        let _ = window.set_always_on_top(true);
        let _ = window.set_size(LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
        labels.push(label);
        
        let Some(main_window) = app.get_webview_window("main") else {
            return Ok(());
        };
        let _ = main_window.hide();
    }
    Ok(())
}

#[tauri::command]
fn hide_lock_windows(
    app: tauri::AppHandle,
    state: tauri::State<'_, LockState>,
) -> Result<(), String> {
    let mut labels = state.labels.lock().map_err(|_| "锁状态被占用")?;
    for label in labels.iter() {
        if !label.as_str().starts_with("lockscreen-") {
            continue;
        }
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.close();
        }
    }
    labels.clear();
    Ok(())
}

#[tauri::command]
fn change_lock_windows(
    app: tauri::AppHandle,
    state: tauri::State<'_, LockState>,
    obj: String,
) -> Result<(), String> {
    let labels = state.labels.lock().map_err(|_| "锁状态被占用")?;
    for label in labels.iter() {
        if let Some(window) = app.get_webview_window(label) {
            let value: Value = serde_json::from_str(&obj).unwrap();
            if let Some(map) = value.as_object() {
                let store = app.store("config.json").map_err(|e| e.to_string())?;
                
                let mut config = CONFIG.lock().unwrap();
                if let Some(value) = store.get("screenInfo") {
                    let prev: Config = from_value(value.clone())
                        .map_err(|e| format!("Failed to deserialize: {}", e))?;
                    config.x = prev.x;
                    config.y = prev.y;
                    config.width = prev.width;
                    config.height = prev.height;
                    config.font_size = prev.font_size;
                    config.scale = prev.scale;
                    config.screen_width = prev.screen_width;
                    config.screen_height = prev.screen_height;
                    let _ = window.set_always_on_top(true);
                    let _ = window.show();
                    let _ = window.set_focus();
                    if map.contains_key("x") {
                        let x = map.get("x").unwrap().as_f64().unwrap();
                        config.x = x;
                        let _ = window.set_position(LogicalPosition::new(x, config.y)).map_err(|e| e.to_string())?;
                    }
                    if map.contains_key("y") {
                        let y = map.get("y").unwrap().as_f64().unwrap();
                        config.y = y;
                        let _ = window.set_position(LogicalPosition::new(config.x, y)).map_err(|e| e.to_string())?;
                    }
                    if map.contains_key("width") {
                        let width = map.get("width").unwrap().as_f64().unwrap();
                        config.width = width;
                        let _ = window.set_size(LogicalSize::new(width, config.height)).map_err(|e| e.to_string())?;
                    }
                    if map.contains_key("height") {
                        let height = map.get("height").unwrap().as_f64().unwrap();
                        config.height = height;
                        let _ = window.set_size(LogicalSize::new(config.width, height)).map_err(|e| e.to_string())?;
                    }
                    if map.contains_key("font_size") {
                        let font_size = map.get("font_size").unwrap().as_f64().unwrap();
                        config.font_size = font_size;
                    }
                    store.set("screenInfo", json!({
                        "screen_width": config.screen_width,
                        "screen_height": config.screen_height,
                        "width": config.width,
                        "height": config.height,
                        "scale": config.scale,
                        "font_size": config.font_size,
                        "x": config.x,
                        "y": config.y,
                    }));
                    store.save().map_err(|e| e.to_string())?;
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn lockscreen_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    for (_label, window) in app.webview_windows() {
        let _ = window.emit("lockscreen-action", action.clone());
    }
    Ok(())
}

fn append_app_log(message: &str) -> io::Result<()> {
    // -------------------------- 步骤1：获取用户文档目录 --------------------------
    let doc_path = document_dir()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "无法找到当前用户的文档目录"))?;
    // -------------------------- 步骤2：定义目标路径 --------------------------
    let target_folder = doc_path.join("workoff");
    let target_file = target_folder.join("demo.txt");
    // -------------------------- 步骤3：创建文件夹 --------------------------
    // create_dir_all：递归创建目录
    if !target_folder.exists() {
        create_dir_all(&target_folder)?;
    }

    // -------------------------- 步骤4：创建文件并逐行写入 --------------------------
    // File::create：创建/覆盖文件（若文件已存在会清空内容！）
    let mut file: File;
    if !Path::new(&target_file).exists() {
        file = File::create(&target_file)?;
    }
    // 文件已存在：如果要【覆盖旧内容】用write(true)，如果要【追加内容】用append(true)
    file = File::options().append(true).open(&target_file)?;

    let line = format!("{} \n", message);
    let _ = write!(file, "{}", line);
    Ok(())
}

#[tauri::command]
fn log_app(message: String) -> Result<(), String> {
    append_app_log(&message);
    Ok(())
}

fn apply_default_window_icon<R: tauri::Runtime>(
    app: &AppHandle<R>,
    window: &tauri::WebviewWindow<R>,
) {
    if let Some(icon) = app.default_window_icon().cloned() {
        let _ = window.set_icon(icon);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            get_default_size(handle);
            if let Some(window) = app.get_webview_window("main") {
                apply_default_window_icon(app.handle(), &window);
                let _ = window.center();
                let _ = window.show();
                let _ = window.set_focus();
            }
            let tray_menu = MenuBuilder::new(app)
                .text("tray_show", "显示主界面")
                .text("tray_hide", "隐藏到托盘")
                .separator()
                .text("tray_quit", "退出")
                .build()?;

            let tray = TrayIconBuilder::new()
                .icon(TRAY_ICON.clone())
                .tooltip("休息吧")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    let app = tray.app_handle();
                    let Some(window) = app.get_webview_window("main") else {
                        return;
                    };
                    match event {
                        TrayIconEvent::Click {
                            button,
                            button_state,
                            ..
                        } => {
                            if button == MouseButton::Left && button_state == MouseButtonState::Up {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        TrayIconEvent::DoubleClick { button, .. } => {
                            if button == MouseButton::Left {
                                let visible = window.is_visible().unwrap_or(true);
                                if visible {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        _ => {}
                    }
                })
                .on_menu_event(|app, event| {
                    let Some(window) = app.get_webview_window("main") else {
                        return;
                    };
                    match event.id().as_ref() {
                        "tray_show" => {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        "tray_hide" => {
                            let _ = window.hide();
                        }
                        "tray_quit" => {
                            if let Some(state) = app.try_state::<AppState>() {
                                state.allow_exit.store(true, Ordering::SeqCst);
                            }
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            app.manage(tray);
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    if let Some(state) = window.app_handle().try_state::<AppState>() {
                        if !state.allow_exit.load(Ordering::SeqCst) {
                            let _ = window.hide();
                            api.prevent_close();
                            return;
                        }
                    }
                }
                WindowEvent::Destroyed => {}
                _ => {}
            }
        })
        .manage(LockState::default())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            lockscreen_action,
            show_lock_windows,
            hide_lock_windows,
            change_lock_windows,
            get_default_size,
            log_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
