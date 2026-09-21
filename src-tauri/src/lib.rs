// Main application logic lives here rather than in main.rs.
// This split is the standard Tauri v2 pattern: it lets the same `run()`
// entry point be reused for both desktop (main.rs) and mobile builds,
// should mobile support ever be added later.

#[cfg(target_os = "linux")]
use gilrs::{Axis, Button, Gilrs, MappingSource};
#[cfg(target_os = "linux")]
use serde_json::json;
#[cfg(target_os = "linux")]
use tauri::Emitter;

// W3C standard order (0 = A ... 15 = D-pad right). With no SDL mapping
// (`Driver`), gilrs names the face buttons like the kernel does: BTN_X
// (0x133) is `North` and BTN_Y (0x134) is `West` — the reverse of the
// compass position they have on an Xbox-style pad — so X and Y swap places.
// SDL mappings (`SdlMappings`) already follow the printed labels.
#[cfg(target_os = "linux")]
fn button_order(source: MappingSource) -> [Button; 16] {
    let (x, y) = match source {
        MappingSource::Driver => (Button::North, Button::West),
        _ => (Button::West, Button::North),
    };
    [
        Button::South, Button::East, x, y,
        Button::LeftTrigger, Button::RightTrigger, Button::LeftTrigger2, Button::RightTrigger2,
        Button::Select, Button::Start, Button::LeftThumb, Button::RightThumb,
        Button::DPadUp, Button::DPadDown, Button::DPadLeft, Button::DPadRight,
    ]
}

// On Linux the WebKitGTK Gamepad API is unreliable (missing, or a wrong
// mapping for some pads), so the frontend prefers the first connected pad
// read natively here and pushed to it as a
// standard-mapping-shaped state (`buttons` = W3C indices 0-15, `axes`
// with Y up = negative), only when it changes. `null` = no pad.
#[cfg(target_os = "linux")]
fn poll_gamepad(app: tauri::AppHandle) {
    let Ok(mut gilrs) = Gilrs::new() else { return };
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
                "buttons": button_order(pad.mapping_source()).map(|b| pad.is_pressed(b)),
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn driver_mapping_swaps_x_and_y() {
        assert_eq!(button_order(MappingSource::Driver)[2], Button::North);
        assert_eq!(button_order(MappingSource::Driver)[3], Button::West);
        assert_eq!(button_order(MappingSource::SdlMappings)[2], Button::West);
        assert_eq!(button_order(MappingSource::SdlMappings)[3], Button::North);
    }
}
