// Tauri 应用入口（库形式，桌面与移动端共用）。
// 在这里注册需要的插件。新增原生能力时：
//   1) Cargo.toml 加依赖；
//   2) 这里 .plugin(...) 注册；
//   3) capabilities/default.json 增加对应权限。

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init());

    // 自动更新相关插件仅桌面端注册（移动/web 无意义）
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
