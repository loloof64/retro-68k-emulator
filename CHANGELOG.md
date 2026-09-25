# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.4.0] - 2026-09-25

Editor toolbar overhaul: icons, find-in-code, bookmark buttons.

### Added
- Find-in-code: `Ctrl+F` opens a find bar in the editor, `F3`/`Shift+F3`
  cycle through matches with wraparound, `Escape` closes; also exposed
  as its own toolbar/commands-menu entry
- Toolbar: Previous/Next bookmark and Toggle bookmark buttons,
  mirroring the existing `F2`/`Shift+F2`/`Ctrl+B` shortcuts
- A hamburger commands menu listing every toolbar action by its full
  text label, kept in sync with the icon toolbar from the same
  grouped item list

### Changed
- Toolbar buttons switched from text labels to dependency-free inline
  SVG icons, with the old labels kept as native tooltips
- Default window width increased to give the code editor more room
- `docs/user/`: DS.B/W/L and EQU documented in Assembly Programming
  Tips (with worked examples), and a new subsection shows decimal,
  hex, binary, character-code and EQU forms all loading the same
  value
- README screenshot updated to show the new icon toolbar

## [1.3.0] - 2026-09-24

TRAP #8: keyboard input.

### Added
- `TRAP #8`: pops the next queued keyboard character into `D0` (0 if
  none pending) — visible ASCII and Latin-1 accented characters only,
  from a 16-character FIFO fed by a keydown listener that works
  anywhere in the app except while typing in the editor or another UI
  field. Not memory-mapped like every other TRAP here: reading it has
  a side effect (it pops the queue), so a raw address would let the
  debugger's Memory Inspector silently consume keystrokes just by
  displaying it — `TRAP #8` is the sole access path
- Example #15: reading the keyboard — builds a 10-character string
  from typed input, echoing it to the screen with `TRAP #1` after
  every key

### Changed
- `docs/user/REFERENCE.md`: new "Reading the Keyboard with TRAP #8"
  section (character set, FIFO behavior, `D0`'s full 32-bit
  zero-extended width, worked examples for testing a key against
  `'A'`/`'a'` and for printing a runtime-read character), and `TRAP
  #5`'s table row now links to the existing "Reading the Gamepad"
  section it was missing a pointer to

## [1.2.0] - 2026-09-23

TRAP #7: pause a program for a given duration.

### Added
- `TRAP #7`: pauses the program for `D0` milliseconds (word) — a
  deliberate emulator extension, not real 68000 hardware. Run honors it
  in real time, Pause freezes the countdown, and Step always resolves
  a pending delay instantly since single-stepping already means the
  user is setting the pace

### Changed
- Detailed clarity pass over `docs/user/REFERENCE.md`: a new Stack
  section, big-endian and register partial-write notes, an `<ea>`
  definition surfaced in Addressing Modes, explicit no-side-effect
  notes for Displacement/Indexed/PC-relative modes, new "Why does ADDI
  exist" and "How does ADDQ/SUBQ pack its immediate" guidance, a fixed
  TAS spinlock example, and several reworded stale sentences
- New "What is a TRAP?" and control-flow-after-TRAP explainers ahead of
  the TRAP System Calls table, for readers new to assembly

## [1.1.0] - 2026-09-23

Editor toolbar, save workflow, and app-owned undo/redo.

### Added
- Editor: a proper toolbar (Open / Save / Save As, Undo / Redo), each button greyed out when its action isn't available
- Ctrl+S saves directly to the already-known file path with no dialog; Ctrl+Shift+S is always Save As via the picker; Save is disabled until a path is known (a loaded example or the starter program has none until Save As picks one)
- Editor: Tab/Shift+Tab indent to 8-column stops, Enter carries the current line's indentation onto the new one
- Editor: app-owned undo/redo (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, plus toolbar buttons), coalescing edits made within 700ms into one step
- Loading an example or a different file now asks for confirmation whenever the buffer is dirty or has any undo history, even if undoing brought the content back to exactly what was last saved

### Fixed
- The discard-changes confirmation dialog now reliably appears in the Tauri desktop build; it used to rely on the browser's `window.confirm`, which could silently resolve without ever showing a dialog there
- Undo/redo no longer depends on the browser's native text-field undo stack, which the Tauri WebView doesn't reliably support

## [1.0.1] - 2026-09-22

Repo-hosted user guide, and a new example program.

### Added
- README: link to the user guide PDF, now tracked in the repo at `docs/user/Retro68K-User-Guide.pdf` and kept current by a manual `update-user-guide.yml` workflow and automatically on every tagged release
- Example 14: handling the Zero Divide exception (installing a handler at vector `$40`, catching a `DIVU` by zero), in the editor's example picker (en/fr/es) and in the user guide

## [1.0.0] - 2026-09-22

First stable release: bookmarks and a breakpoint fix.

### Added
- Editor: bookmarks (right-click a line number or Ctrl+B to toggle, F2 / Shift+F2 to jump), which follow edits like breakpoints
- Bookmarks and breakpoints are saved per source file (exact full path) and restored when the file is reopened (desktop app only)

### Fixed
- Debugger: Run could skip a breakpoint when its first animation frame executed a single instruction (e.g. Run right after Step)

## [0.5.0] - 2026-09-22

Memory inspector and sound latency fix.

### Added
- Debugger: read-only memory inspector (hex + ASCII dump, go-to address, page buttons, shortcuts to PC/stack/program/screen/input/sound, highlights written bytes, "follow writes" on Step/Pause, click-to-edit bytes while paused)

### Fixed
- Sound: the first tone of the first run was delayed while the audio device opened; the audio context is now warmed up on the first click or key press anywhere in the app

## [0.4.5] - 2026-09-21

Windows Switch-style controller fix.

### Fixed
- Windows: wired Switch-style controllers that report a non-standard mapping (hat D-pad on axis 9, e.g. NSW wired controller 20d6:a713) are now read; face buttons follow the on-screen layout (bottom = A, right = B, left = X, top = Y)

## [0.4.4] - 2026-09-21

Linux X/Y fix.

### Fixed
- Linux: X and Y were swapped for controllers without an SDL mapping (Nacon GC-100 in its X mode)

## [0.4.3] - 2026-09-21

Linux gamepad fix.

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
