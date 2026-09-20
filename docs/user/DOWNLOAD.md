# Downloads

**At least one version is available.** The latest one is on the Releases page linked below. The project is still under active development — see the [status table](./PRESENTATION.md#project-status) for what's working today.

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

You won't need to pick a specific architecture — pick the file matching your operating system, that's it.

The portable Windows zip contains the program and everything it needs to start; it relies only on Microsoft's WebView2 component, which comes with Windows 10 and 11.

## Staying up to date

Watch the GitHub repository (or check the Releases page directly) to know when a new version becomes available.
