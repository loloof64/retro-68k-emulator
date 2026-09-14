# Icons

This folder needs icon files for the Tauri build (Windows `.ico`, macOS `.icns`, and PNG sizes for Linux).

## Generate icons automatically (recommended)

Once you have a single source icon (PNG, at least 1024×1024, square), run:

```bash
npm run tauri icon path/to/your-icon.png
```

This generates everything needed in this folder:
- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)
- Various other platform-specific sizes

## No icon yet?

Tauri ships a default icon you can use to test the build pipeline first:

```bash
npm run tauri icon
```

(Run with no argument — it uses Tauri's default placeholder icon so `npm run tauri:build` works immediately. Swap in your own icon later with the command above.)

## Suggested icon idea for this project

Something evoking both the TI-89 and the 68000: a monochrome LCD-pixel motif (like the screen simulated in the emulator), or a stylized "68K" wordmark in a calculator-style font. Keep it simple — it needs to be legible at 16×16 in a taskbar.
