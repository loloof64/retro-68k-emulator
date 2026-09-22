# What Is the Retro 68K Emulator?

The Retro 68K Emulator is a free desktop app for learning Motorola 68000 assembly language, in the style of a retro fantasy console. Write 68000 assembly, run it, and watch the CPU registers, flags, and a simulated 320×200 LCD screen react in real time — no physical hardware required.

It's aimed at students, hobbyists, and anyone curious about how a CPU actually executes instructions, one step at a time.

If you just want to try the app, grab the latest version from the [Downloads](./DOWNLOAD.md) page, then head to the [Example Programs](./EXAMPLES.md) for fourteen ready-to-run programs.

## Features

- Every non-privileged 68000 instruction, plus a built-in assembler
- Full register set: `D0`–`D7` (data), `A0`–`A7` (address, with `A7` as the stack pointer)
- Status flags: Negative, Zero, Overflow, Carry, Extend
- A TRAP-based system-call layer, for things like printing text or drawing to the screen from your own assembly code
- A simulated 320×200 color LCD (32-bit RGBA), mapped directly into memory
- An on-screen retro gamepad (A/B/X/Y, D-pad, Start/Select), superseded by a real gamepad when one is connected
- Simple retro-style sound effects (a tone generator, not sampled audio), the way period 8/16-bit consoles did it
- A step-by-step debugger: watch registers, flags, memory (hex dump) and the screen change instruction by instruction, with breakpoints
- A syntax-highlighted assembly editor, built into the app — no external tools needed
- Bookmarks: mark lines (right-click a line number, or Ctrl+B), jump between them with F2 / Shift+F2; bookmarks and breakpoints are remembered for each file opened from disk
- Native installers for Windows, macOS, and Linux, so it runs like any other desktop app

## Why This Project?

Most ways to learn assembly language either require real, aging hardware or a fairly unfriendly command-line toolchain. This project's goal is a self-contained, visual, approachable way to write and run 68000 assembly, see exactly what each instruction does to the CPU, and build real intuition for how a computer executes code at the lowest level.

---

Next: [Downloads](./DOWNLOAD.md) · [References and Guidelines](./REFERENCE.md) · [Troubleshooting](./TROUBLESHOOTING.md)
