# What Is the Retro 68K Emulator?

The Retro 68K Emulator is a free desktop app for learning Motorola 68000 assembly language, in the style of a retro fantasy console. Write 68000 assembly, run it, and watch the CPU registers, flags, and a simulated 320×200 LCD screen react in real time — no physical hardware required.

It's aimed at students, hobbyists, and anyone curious about how a CPU actually executes instructions, one step at a time.

## Project Status

This project is under active development. The table below reflects what's genuinely working today, not the final goal — it will be updated after every development session.

| Component | Status |
|---|---|
| Memory system (addressable space + framebuffer + controller input) | ✅ Done |
| Sound (tone generator registers) | 🚧 Registers + `TRAP #6` wired up, no audio backend yet — see [Reference](./REFERENCE.md) |
| CPU core (registers, flags, instruction execution) | ✅ Done |
| Assembler (turns `.asm` source into runnable bytecode) | ⏳ Planned |
| 68000 instruction set (~80 opcodes) | 🚧 47 of ~80 (`NOP`, `MOVE`, `MOVEA`, `MOVEQ`, `MOVEM`, `LEA`, `PEA`, `ADD`, `SUB`, `ADDQ`, `SUBQ`, `CMP`, `CHK`, `MULU`, `MULS`, `DIVU`, `DIVS`, `ABCD`, `SBCD`, `NBCD`, `Bcc`/`BRA`, `DBcc`, `Scc`, `BTST`, `AND`, `OR`, `XOR`, `NOT`, `CLR`, `NEG`, `TST`, `TAS`, `SWAP`, `EXT`, `JSR`, `BSR`, `RTS`, `LINK`, `UNLK`, `ASL`, `ASR`, `LSL`, `LSR`, `ROL`, `ROR`, `ROXL`, `ROXR`) — see [Reference](./REFERENCE.md) |
| TRAP system calls (print text, draw pixels, clear screen, read gamepad, play tone) | 🚧 3 of several (`TRAP #0` halt, `TRAP #5` read controller, `TRAP #6` set sound registers) — see [Reference](./REFERENCE.md) |
| Gamepad UI (A/B/X/Y, D-pad, Start/Select) | ✅ On-screen buttons + real Gamepad API (takes over automatically when a controller is connected) |
| Editor / Debugger / Screen interface | 🚧 UI shell built, not yet connected to a working emulator (Gamepad is the exception — it already writes real button state into memory, see above) |
| Desktop installers (Windows / macOS / Linux) | 🚧 Packaging configured, first release not shipped yet |

If you just want to try the app today, it's not ready for that yet — check the [Downloads](./DOWNLOAD.md) page, which will be updated the moment a first usable version is published.

## Planned Features

- Support for the ~80 68000 opcodes most relevant to learning assembly
- Full register set: `D0`–`D7` (data), `A0`–`A7` (address, with `A7` as the stack pointer)
- Status flags: Negative, Zero, Overflow, Carry, Extend
- A TRAP-based system-call layer, for things like printing text or drawing to the screen from your own assembly code
- A simulated 320×200 color LCD (32-bit RGBA), mapped directly into memory
- An on-screen retro gamepad (A/B/X/Y, D-pad, Start/Select), superseded by a real gamepad when one is connected
- Simple retro-style sound effects (a tone generator, not sampled audio), the way period 8/16-bit consoles did it
- A step-by-step debugger: watch registers and memory change instruction by instruction
- A syntax-highlighted assembly editor, built into the app — no external tools needed
- Native installers for Windows, macOS, and Linux, so it runs like any other desktop app

## Why This Project?

Most ways to learn assembly language either require real, aging hardware or a fairly unfriendly command-line toolchain. This project's goal is a self-contained, visual, approachable way to write and run 68000 assembly, see exactly what each instruction does to the CPU, and build real intuition for how a computer executes code at the lowest level.

---

Next: [Downloads](./DOWNLOAD.md) · [Opcode & TRAP Reference](./REFERENCE.md) · [Troubleshooting](./TROUBLESHOOTING.md)
