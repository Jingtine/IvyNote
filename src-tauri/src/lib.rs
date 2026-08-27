pub mod commands;
pub mod errors;
pub mod filesystem;
pub mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::workspace::scan_root,
            commands::workspace::create_workspace,
            commands::workspace::list_workspaces,
            commands::workspace::list_recent_workspaces,
            commands::workspace::open_workspace,
            commands::workspace::update_mount_exclusions,
            commands::workspace::update_workspace_exclusions,
            commands::files::read_markdown_file,
            commands::files::save_markdown_file,
            commands::files::create_folder,
            commands::files::create_markdown,
            commands::files::rename_path,
            commands::files::move_path,
            commands::files::delete_to_trash
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
