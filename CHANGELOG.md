# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Fixed
- Linux: pressing a trigger (LT/RT) could hold *up* and disable the D-pad — the controller read through the webview's Gamepad API took over from the native one, with a wrong mapping. The native reading is now preferred. This also fixes a face button (Y) lighting the wrong on-screen button in one mode of the Nacon GC-100

### Added
- Linux: `RETRO68K_GAMEPAD_DEBUG=1` prints the controller events the app receives, to diagnose odd controllers
- User guide: troubleshooting entry for controller mode switches and stuck directions

## [0.4.2] - 2026-09-21

Lighter Linux AppImage, Spanish Windows installer.

### Added
- Windows: Spanish (`es-ES`) `.msi` installer, alongside English and French

### Changed
- Linux AppImage: bundles only the GStreamer plugins Web Audio needs (base, good, PulseAudio, ALSA) instead of also the bad and libav ones — about 40 MB lighter, sound unchanged
## [0.4.1] - 2026-09-21

Sound fixed for the Linux AppImage.

### Fixed
- Linux AppImage: no sound, because the GStreamer plugins used by WebKitGTK's Web Audio were not bundled. They are now (`bundleMediaFramework`)
- Linux `.deb` now depends on the GStreamer base and good plugins
- Release workflow: the draft release is created once before the platform builds (a race between the parallel jobs could split the assets across several drafts)

### Changed
- Docs: clearer TROUBLESHOOTING sections and a note on the highlighted line while running; Status Flags is now a sibling of Registers in the Reference; the Project Status table is gone; syntax highlighting is marked as planned

## [0.4.0] - 2026-09-21

Sound implemented.

### Added
- Sound: `TRAP #6` tones (and direct writes to the sound registers) are played through Web Audio — square, sine, triangle, sawtooth and noise waveforms, single voice
- Example 13: a C major scale

### Fixed
- Run speed no longer depends on the display's refresh rate: the instruction count per tick scales with elapsed time (speed = instructions per 1/60 s)

### Changed
- Docs state that the macOS builds are not tested yet

## [0.3.0] - 2026-09-21

Gamepad support fixed.

### Added
- Desktop app: the gamepad is read natively (Rust, `gilrs`) when the webview has no Gamepad API (WebKitGTK on Linux)

### Fixed
- D-pad reported as axes (6/7) by generic Xbox/PlayStation-style pads is now recognised; the left stick also acts as a D-pad

### Changed
- Dev server port is now 1420 (3000 is commonly taken)

## [0.2.0] - 2026-09-21

The assembler is complete.

### Added
- Assembler now covers every real (non-privileged) 68000 mnemonic: logic, NOT/NEG, MUL/DIV, EXT/SWAP/EXG/PEA, Scc, LINK/UNLK, X/BCD forms, shifts/rotates, bit operations, MOVEM (register lists), MOVEP, `CCR`/`SR` operands, PC-relative `d(PC)`/`d(PC,Xn)` and indexed `d(An,Xn)` addressing
- Assembler diagnostics: invalid size suffixes rejected, `DC` range and odd-address checks, error columns point at the offending operand/label
- UI in English (default), French and Spanish, auto-detected, with a language selector; the starter program follows the language
- Debugger: labelled Speed selector, decimal tooltip (unsigned + signed) on registers and PC

### Fixed
- Screen info no longer claims a monochrome mode
- Speed selector wraps instead of overflowing the debugger column

## [0.1.4] - 2026-09-20

Functional assembler with subsets of op-codes.

### Added
- Assembler (`src/assembler/`, two-pass) wired into the UI: the Debugger assembles the editor source, loads it at `origin`, and offers Run / Step / Reset with registers, flags, PC, cycle count, source line of PC, and assembler/runtime errors. Assemblable subset: MOVE/MOVEA/MOVEQ, ADD/SUB/CMP (+A/I), ADDQ/SUBQ, LEA, CLR, TST, BRA/BSR/Bcc, DBcc, JMP/JSR/RTS, NOP, TRAP
- Editor line-number gutter with clickable breakpoints and a highlight on the line about to execute
- Screen panel paints the framebuffer; on-screen and physical gamepad with visual press feedback
- `TRAP #1`-`#6` system calls (print string, pixels, clear screen, controller, tone)
- Windows portable `.zip` in the release
- The end-user documentation (`docs/user`) is generated as a PDF and attached to the release by the GitHub Action

### Fixed
- Layout of the stacked UI keeps a usable screen panel; the example program now draws an opaque line
- Cross-file link regex in the PDF generator no longer produces broken links

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
