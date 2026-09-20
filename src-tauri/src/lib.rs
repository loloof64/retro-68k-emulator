// Main application logic lives here rather than in main.rs.
// This split is the standard Tauri v2 pattern: it lets the same `run()`
// entry point be reused for both desktop (main.rs) and mobile builds,
// should mobile support ever be added later.

use gilrs::{Axis, Button, Gilrs};
use serde_json::json;
use tauri::Emitter;

// WebKitGTK (Tauri's Linux webview) often has no Gamepad API, so the
// first connected pad is read natively and pushed to the frontend as a
// standard-mapping-shaped state (`buttons` = W3C indices 0-15, `axes`
// with Y up = negative), only when it changes. `null` = no pad.
fn poll_gamepad(app: tauri::AppHandle) {
    let Ok(mut gilrs) = Gilrs::new() else { return };
    const BUTTONS: [Button; 16] = [
        Button::South, Button::East, Button::West, Button::North,
        Button::LeftTrigger, Button::RightTrigger, Button::LeftTrigger2, Button::RightTrigger2,
        Button::Select, Button::Start, Button::LeftThumb, Button::RightThumb,
        Button::DPadUp, Button::DPadDown, Button::DPadLeft, Button::DPadRight,
    ];
    let mut last = serde_json::Value::Null;
    loop {
        while gilrs.next_event().is_some() {} // refreshes cached state
        let state = match gilrs.gamepads().next() {
            None => serde_json::Value::Null,
            Some((_, pad)) => json!({
                "buttons": BUTTONS.map(|b| pad.is_pressed(b)),
                "axes": [
                    pad.value(Axis::LeftStickX), -pad.value(Axis::LeftStickY), 0, 0, 0, 0,
                    pad.value(Axis::DPadX), -pad.value(Axis::DPadY),
                ],
            }),
        };
        if state != last {
            let _ = app.emit("gamepad-state", &state);
            last = state;
        }
        std::thread::sleep(std::time::Duration::from_millis(8));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || poll_gamepad(handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
