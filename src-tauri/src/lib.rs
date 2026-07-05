pub mod commands;
pub mod db;
pub mod llm;
pub mod memory;
pub mod settings;

use std::path::PathBuf;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Resolve the DB path: <app_data_dir>/lumen.db
            // On Windows this is %APPDATA%/com.summus.lumen/lumen.db
            let app_data = app
                .path()
                .app_data_dir()
                .expect("app data dir should resolve");
            let db_path: PathBuf = app_data.join("lumen.db");
            log::info!("Lumen DB at {:?}", db_path);

            let pool = db::init_db(&db_path)
                .expect("failed to initialize SQLite database");
            app.manage(pool);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // settings
            commands::get_settings,
            commands::save_settings,
            // memory CRUD
            commands::list_memories,
            commands::add_memory,
            commands::update_memory,
            commands::delete_memory,
            commands::toggle_archive,
            // conversations & messages
            commands::list_conversations,
            commands::create_conversation,
            commands::delete_conversation,
            commands::list_messages,
            // chat
            commands::chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lumen");
}
