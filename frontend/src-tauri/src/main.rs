#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;

fn main() {
    // Start the FastAPI backend in background
    Command::new("./backend.exe")
        .spawn()
        .expect("failed to start backend");

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
