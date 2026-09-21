# Downloads

**At least one version is available.** The latest one is on the Releases page linked below.

## How releases work

This project builds real, native installers for Windows, macOS, and Linux — no need for Node.js, Rust, or a terminal to run it once it's installed. Each version is published on the project's GitHub Releases page:

**https://github.com/loloof64/retro-68k-emulator/releases**

Each release includes one installer per platform:

| Platform | File to download | How to install |
|---|---|---|
| Windows | `.msi` or `.exe` | Double-click, follow the installer |
| Windows (portable) | `-windows-portable.zip` | Unzip anywhere and double-click `Retro68K-Emulator.exe` — nothing gets installed |
| macOS | `.dmg` | Open it, drag the app to `Applications` |
| Linux | `.deb`, `.AppImage`, or `.rpm` | `.deb`/`.rpm`: install via your package manager. `.AppImage`: make it executable and run it directly |

The Windows `.msi` comes in three languages (installer language only, not the app's): `en-US` (English), `fr-FR` (French) and `es-ES` (Spanish) — pick the one you prefer.

On Windows and Linux you don't need to pick an architecture: pick the file matching your operating system. On macOS there are two `.dmg` files: the `aarch64` one for Apple Silicon (M1 and later), the `x64` one for Intel Macs.

The portable Windows zip contains the program and everything it needs to start; it relies only on Microsoft's WebView2 component, which comes with Windows 10 and 11.

## Supported systems

| System | Supported versions | Notes |
|---|---|---|
| Windows | Windows 11 (Windows 10 should also work) | Needs Microsoft's WebView2, already included in Windows 10/11 |
| macOS | macOS 10.15 (Catalina) or later | Intel and Apple Silicon builds — **not tested yet** |
| Linux | Ubuntu 22.04 or later, or any distribution with a comparable system (glibc 2.35 or later, WebKitGTK 4.1) | Linux builds are made on Ubuntu 22.04 |

On Linux, the `.AppImage` and `.deb` need at least glibc 2.35 and WebKitGTK 4.1 (the versions shipped with Ubuntu 22.04 and Debian 12); older distributions will refuse to start the app or to install it. Only Windows 11 and Linux are confirmed by the author. The macOS builds have not been tested at all: they are produced by the same automated build, but nobody has run them yet.

## Staying up to date

Watch the GitHub repository (or check the Releases page directly) to know when a new version becomes available.
