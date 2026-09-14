// Main application logic lives here rather than in main.rs.
// This split is the standard Tauri v2 pattern: it lets the same `run()`
// entry point be reused for both desktop (main.rs) and mobile builds,
// should mobile support ever be added later.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
