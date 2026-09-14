# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.1.3] - 2026-09-14

### Fixed
- GitHub Actions workflow: added missing `permissions: contents: write` to allow creating releases

## [0.1.2] - 2026-09-14

### Fixed
- The 0.1.1 release build was failing on every platform:
  - macOS/Windows: `src-tauri/icons/` had no actual icon files — `tauri.conf.json` referenced `32x32.png`, `icon.ico`, `icon.icns`, etc., but only a placeholder README existed. Added a source icon and generated the full set via `tauri icon`.
  - Linux: `libsoup-3.0` wasn't found. The workflow installed `libwebkit2gtk-4.0-dev` (pulls `libsoup2`); switched to `libwebkit2gtk-4.1-dev`, which Tauri v2 actually needs (also fixed in `docs/INSTALLATION.md`).
- Generated PDFs were being silently deleted by `npm run build` — Vite empties `dist/` on every build, and the PDFs were written there too. All PDF scripts now write to `dist-docs/` instead.
- Clarified/corrected the signed vs. unsigned `Bcc` condition codes in both docs — `BHI`/`BLS` were undocumented, and `BLT`/`BGE` were described as plain N-flag tests instead of the real N≠V/N=V conditions.

## [0.1.1] - 2026-09-14

### Added
- Initial project scaffold: React + Vite + TypeScript frontend
- Three-panel UI: Editor, Debugger, Screen (320×200 LCD)
- Tauri desktop packaging (Windows/macOS/Linux installers)
- GitHub Actions workflows: CI checks + multi-platform release builds
- Full English documentation set (getting started, architecture, opcodes, API, memory, examples, installation, troubleshooting)
- Memory system: addressable RAM plus a 320×200 RGBA framebuffer, with byte/word/long access and bounds checking
- CPU core: `D0`-`D7`/`A0`-`A7` registers, status flags (N/Z/V/C/X), and a fetch-decode-execute loop
- Effective-address decoding: `Dn`, `An`, `(An)`, `(An)+`, `-(An)`, `#immediate`
- Opcodes: `NOP`, `MOVE`, `MOVEQ`, `ADD`, `SUB`, `CMP`, `Bcc`/`BRA` (all 14 standard condition codes)
- `TRAP #0` (halt)
- 49 unit tests covering memory, CPU, and opcodes
- End-user documentation (`docs/user/`): presentation, downloads, and a progressive opcode/TRAP reference
- Two separate PDF exports (developer and end-user docs), generated via WeasyPrint with real navigable bookmarks

### Fixed
- PDF generation: markdown tables, bulleted/numbered lists, and fenced code blocks weren't rendering (a stray `*` in an asm example was even being eaten as markdown emphasis)
- Unused-import/variable TypeScript errors in the UI scaffold that were failing CI (`npm run type-check`)

### Changed
- CI now runs only on tag pushes (`v*.*.*`), matching the release workflow, instead of on every push to `main`

### Planned
- Assembler: tokenizer, parser, code generator
- Remaining 68000 opcodes (~70 more: multiplication, division, logical ops, subroutine calls, ...)
- TRAP handler system: print text, read/write pixels, clear screen
- Live framebuffer rendering on the Screen component
- Breakpoints and step-by-step debugging wired to the real CPU
