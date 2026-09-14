# Installation & Distribution

How to build a real installable executable of the TI-89 68000 Emulator, and how to install it on another machine.

## Overview

The emulator is a web frontend (React + Vite) wrapped by [Tauri](https://tauri.app), which packages it into a small native desktop app with a real installer for Windows, macOS, and Linux.

Two different things are described in this doc:

1. **Building** the executable/installer (done once per platform, by whoever ships the app)
2. **Installing** it on a machine (done by anyone who just wants to run it)

## Prerequisites for Building

Building requires a full dev setup. Installing the built app does not — see [Installing a Pre-Built App](#installing-a-pre-built-app) below.

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 16+ | Frontend build |
| Rust | 1.77.2+ | Tauri 2 backend, install via [rustup.rs](https://rustup.rs) |
| Platform build tools | — | See per-OS notes below |

### Windows
- Microsoft Visual Studio C++ Build Tools (or Visual Studio with "Desktop development with C++")
- WebView2 (pre-installed on Windows 10/11; Tauri will prompt if missing)

### macOS
- Xcode Command Line Tools: `xcode-select --install`

### Linux
- `webkit2gtk`, `libgtk-3-dev`, and a few build essentials. On Debian/Ubuntu:
  ```bash
  sudo apt update
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget \
    file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
  ```

## Permissions (Tauri 2 Capabilities)

Tauri 2 replaced the old v1 `allowlist` with a **capabilities** system: `src-tauri/capabilities/default.json` explicitly lists what the frontend is allowed to do (currently just `core:default`, the safe baseline — window management, events, etc.).

If you later add features that need filesystem access (e.g., "Save/Open .asm file"), you'll need to:
1. Add the relevant plugin to `src-tauri/Cargo.toml` (e.g., `tauri-plugin-fs = "2"`) and register it in `src-tauri/src/lib.rs`
2. Add the matching JS package (`npm install @tauri-apps/plugin-fs`)
3. Grant the specific permission in `src-tauri/capabilities/default.json` (e.g., `"fs:allow-read-text-file"`) — capabilities are deny-by-default, so nothing works until explicitly listed

This is more verbose than v1's `allowlist: { fs: { all: true } }`, but it means the app only ever has access to exactly what it needs.

## First-Time Setup

```bash
cd ti89-68k-emulator
npm install
```

This installs both the frontend dependencies and the Tauri CLI (`@tauri-apps/cli`).

### Generate app icons (first time only)

```bash
npm run tauri icon
```

This uses Tauri's placeholder icon so the build pipeline works immediately. See `src-tauri/icons/README.md` to swap in a custom icon later.

## Documentation Toolchain (Optional)

`npm run docs:pdf` bundles all the `docs/*.md` files into a single PDF (`dist-docs/TI89-68000-Documentation.pdf`) with a cover page, table of contents, and real navigable PDF bookmarks generated from the headings. `npm run docs:pdf:user` does the same for `docs/user/*.md` (`dist-docs/TI89-68000-User-Guide.pdf`). Both write to `dist-docs/`, not `dist/`, so they survive an `npm run build`.

This requires [WeasyPrint](https://weasyprint.org) — a system package, not an npm one:

```bash
sudo apt install weasyprint       # Debian/Ubuntu
# or: brew install weasyprint     # macOS
```

A plain LaTeX-based pipeline (`texlive-xetex`) was tried first and rejected: it pulls in ~70 packages including a full JRE, for no benefit over WeasyPrint here. `pandoc` alone (`npm run docs:pdf:pandoc`) does **not** produce a PDF without a PDF engine like this installed too — it's kept only as a fallback for converting to other formats.

## Development Mode

Run the app as a native window with hot-reload, instead of a browser tab:

```bash
npm run tauri:dev
```

This starts the Vite dev server AND opens a native desktop window pointed at it. Code changes reload live, same as `npm run dev`, but in a real app window.

## Building the Installer

```bash
npm run tauri:build
```

This produces a **platform-specific installer** — you can only build for the OS you're currently running on (no cross-compilation by default):

| Platform | Output | Location |
|---|---|---|
| Windows | `.msi` and `.exe` (NSIS) | `src-tauri/target/release/bundle/msi/` and `/nsis/` |
| macOS | `.dmg` and `.app` | `src-tauri/target/release/bundle/dmg/` and `/macos/` |
| Linux | `.deb`, `.AppImage`, `.rpm` | `src-tauri/target/release/bundle/deb/`, `/appimage/`, `/rpm/` |

Build time: a few minutes on first build (Rust compiles from scratch), seconds after that thanks to incremental compilation.

### Debug build (faster, larger, for testing)

```bash
npm run tauri:build:debug
```

## Installing a Pre-Built App

Once you have the installer file (`.msi`, `.dmg`, `.deb`, `.AppImage`, etc.), sharing and installing is just like any normal desktop app — **no Node.js, Rust, or terminal required** on the receiving machine.

### Windows
1. Double-click the `.msi` or `.exe`
2. Follow the installer wizard
3. Launch from the Start Menu

### macOS
1. Open the `.dmg`
2. Drag the app to `Applications`
3. First launch: right-click → Open (to bypass Gatekeeper's unsigned-app warning, since this isn't notarized by Apple)

### Linux
- **`.deb`** (Debian/Ubuntu): `sudo dpkg -i ti89-68k-emulator_0.1.0_amd64.deb`
- **`.AppImage`**: `chmod +x TI89-68K-Emulator.AppImage && ./TI89-68K-Emulator.AppImage`
- **`.rpm`** (Fedora/RHEL): `sudo rpm -i ti89-68k-emulator-0.1.0.x86_64.rpm`

## Sharing the App with Someone Else

To let someone else install it, just send them the single installer file that matches their OS — the `.msi`/`.exe` for Windows users, `.dmg` for Mac users, `.deb`/`.AppImage` for Linux users. They don't need this repository, Node.js, or Rust; the installer is fully self-contained.

If they're on a different OS than you, you'll need to build on (or for) that OS — Tauri doesn't cross-compile out of the box. Options if you don't have access to the other OS:
- Use a CI service (e.g., GitHub Actions with platform-specific runners) to build all three installers automatically
- Use a VM for the other OS

## Code Signing (Optional, for wider distribution)

Unsigned apps trigger OS security warnings (Gatekeeper on macOS, SmartScreen on Windows). For personal use or sharing with people who trust the source, this is just a "click through" warning and can be ignored. For broader distribution, you'd eventually want:
- **Windows**: a code-signing certificate
- **macOS**: an Apple Developer ID + notarization

This isn't necessary to get started — skip it for now.

## Uninstalling

- **Windows**: Settings → Apps → TI-89 68K Emulator → Uninstall
- **macOS**: Drag the app from `Applications` to Trash
- **Linux**: `sudo apt remove ti89-68k-emulator` (deb) or just delete the `.AppImage` file

## Troubleshooting Build Issues

See the [Troubleshooting](./TROUBLESHOOTING.md) guide's build-specific section, or common Tauri issues:

- **"failed to bundle project: error running light.exe"** (Windows) → Reinstall WiX toolset, bundled with Tauri CLI normally
- **Rust compile errors on first build** → Run `rustup update` to ensure a recent toolchain
- **"webkit2gtk not found"** (Linux) → Install the packages listed above for your distro

---

See [Getting Started](./GETTING_STARTED.md) for running the app in plain browser mode without Tauri.
