// Main application logic lives here rather than in main.rs.
// This split is the standard Tauri v2 pattern: it lets the same `run()`
// entry point be reused for both desktop (main.rs) and mobile builds,
// should mobile support ever be added later.

#[cfg(target_os = "linux")]
use gilrs::{Axis, Button, Gilrs};
#[cfg(target_os = "linux")]
use serde_json::json;
#[cfg(target_os = "linux")]
use tauri::Emitter;

// On Linux the WebKitGTK Gamepad API is unreliable (missing, or a wrong
// mapping for some pads), so the frontend prefers the first connected pad
// read natively here and pushed to it as a
// standard-mapping-shaped state (`buttons` = W3C indices 0-15, `axes`
// with Y up = negative), only when it changes. `null` = no pad.
#[cfg(target_os = "linux")]
fn poll_gamepad(app: tauri::AppHandle) {
    let Ok(mut gilrs) = Gilrs::new() else { return };
    const BUTTONS: [Button; 16] = [
        Button::South, Button::East, Button::West, Button::North,
        Button::LeftTrigger, Button::RightTrigger, Button::LeftTrigger2, Button::RightTrigger2,
        Button::Select, Button::Start, Button::LeftThumb, Button::RightThumb,
        Button::DPadUp, Button::DPadDown, Button::DPadLeft, Button::DPadRight,
    ];
    let mut last = serde_json::Value::Null;
    // RETRO68K_GAMEPAD_DEBUG=1 prints what gilrs sees, to diagnose odd pads.
    let debug = std::env::var_os("RETRO68K_GAMEPAD_DEBUG").is_some();
    if debug {
        for (id, pad) in gilrs.gamepads() {
            eprintln!("[gamepad] {id}: {} mapping={:?}", pad.name(), pad.mapping_source());
        }
    }
    loop {
        while let Some(ev) = gilrs.next_event() { // refreshes cached state
            if debug {
                eprintln!("[gamepad] {:?}", ev.event);
            }
        }
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
            #[cfg(target_os = "linux")]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || poll_gamepad(handle));
            }
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
