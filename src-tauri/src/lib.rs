use std::env;
use std::fs::{create_dir_all, File};
use serde::{Deserialize, Serialize};
use std::io::{self, Write};
use dirs::document_dir;
use std::path::{Path};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{
    menu::MenuBuilder,
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


#[derive(Serialize, Deserialize, Debug, Clone)]
#[derive(Default)]
struct Config {
    screen_width: f64,
    screen_height: f64,
    width: f64,
    height: f64,
    scale: f64,
    x: f64,
    y: f64,
}

const CONFIG: Config = Config {
    screen_width: 1000.0,
    screen_height: 750.0,
    width: 80.0,
    height: 30.0,
    scale: 1.0,
    x: 100.0,
    y: 100.0,
};

#[tauri::command]
async fn get_default_size() -> Config {
    CONFIG.clone()
}

#[tauri::command]
async fn show_lock_windows(
    app: tauri::AppHandle,
    state: tauri::State<'_, LockState>,
    end_at_ms: i64,
) -> Result<(), String> {
    let mut labels = state.labels.lock().map_err(|_| "锁状态被占用")?;
    if !labels.is_empty() {
        for label in labels.iter() {
            if let Some(window) = app.get_webview_window(label) {
                let _ = window.set_always_on_top(true);
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        return Ok(());
    }

    let label = format!("lockscreen-primary");
    let width = 80.0;
    let height = 30.0;
    let x = unsafe {CONFIG.x};
    let y = unsafe {CONFIG.y};
    // let x = 0.0;
    // let y = 0.0;

    let url = format!("index.html?lockscreen=1&end={}", end_at_ms,);
    let window = WebviewWindowBuilder::new(&app, label.clone(), WebviewUrl::App(url.into()))
        .decorations(false)
        .transparent(false)
        .resizable(true)
        .drag_and_drop(true)
        .inner_size(width, height)
        .position(x, y)
        .build()
        .map_err(|err| err.to_string())?;

    apply_default_window_icon(&app, &window);
    let _ = window.set_fullscreen(false);
    let _ = window.set_focus();
    labels.push(label);
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
fn lockscreen_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    for (_label, window) in app.webview_windows() {
        let _ = window.emit("lockscreen-action", action.clone());
    }
    Ok(())
}

fn append_app_log(message: &str) -> io::Result<()> {
    // -------------------------- 步骤1：获取用户文档目录 --------------------------
    let doc_path = document_dir()
        .ok_or_else(|| io::Error::new(
            io::ErrorKind::NotFound, 
            "无法找到当前用户的文档目录"
        ))?;
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Ok(Some(monitor)) = app.primary_monitor() {
                let size = monitor.size();
                unsafe {
                    CONFIG.screen_width = size.width as f64;
                    CONFIG.screen_height = size.height as f64;
                    CONFIG.scale = monitor.scale_factor();
                    
                    CONFIG.x = ((CONFIG.screen_width / 3.0) as f64 / CONFIG.scale).floor();
                    CONFIG.y = (CONFIG.screen_height as f64 / CONFIG.scale).floor() - 150.0;
                }
            }
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
                WindowEvent::Destroyed => {
                }
                _ => {}
            }
        })
        .manage(LockState::default())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            lockscreen_action,
            show_lock_windows,
            hide_lock_windows,
            get_default_size,
            log_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
