# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Initial project scaffold: React + Vite + TypeScript frontend
- Three-panel UI: Editor, Debugger, Screen (320×200 LCD)
- CPU/assembler type definitions
- Tauri desktop packaging (Windows/macOS/Linux installers)
- GitHub Actions workflows: CI checks + multi-platform release builds
- Full English documentation set (getting started, architecture, opcodes, API, memory, examples, installation, troubleshooting)
- PDF documentation generation with bookmarks (Puppeteer/Pandoc)

### Planned
- Assembler: tokenizer, parser, code generator
- CPU emulator: instruction execution engine (~80 opcodes)
- TRAP handler system
- Live framebuffer rendering on the Screen component
- Breakpoints and step-by-step debugging
