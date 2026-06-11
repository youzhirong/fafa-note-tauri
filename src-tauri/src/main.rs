// 桌面端二进制入口。Windows 下隐藏控制台窗口。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    fafa_note_tauri_lib::run()
}
