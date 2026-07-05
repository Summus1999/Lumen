// 在 Windows 发布构建中防止额外弹出控制台窗口。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lumen_lib::run();
}
