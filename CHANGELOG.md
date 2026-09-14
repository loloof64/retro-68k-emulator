# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
