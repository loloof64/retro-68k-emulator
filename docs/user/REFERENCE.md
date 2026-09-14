# Opcode & TRAP Reference

This page is filled in progressively, as each part of the emulator becomes real — it documents what you can actually *do* today, not the final wish list (see [Presentation](./PRESENTATION.md) for the full roadmap).

## Memory Map

The emulator's memory system is implemented and working. Every address below is real, addressable memory:

| Region | Address range | Size | Purpose |
|---|---|---|---|
| System area | `$00000`–`$01FFF` | 8 KB | Reserved for TRAP vectors and system data |
| User RAM | `$02000`–`$3FFFF` | ~248 KB | Your program's code, data, and stack |
| Framebuffer | `$40000`–`$7E7FF` | 250 KB | The 320×200 screen, 4 bytes (RGBA) per pixel |

To find the address of pixel `(x, y)`:

```
address = $40000 + (y * 320 + x) * 4
```

## Instruction Set (Opcodes)

The CPU core (registers, status flags, and the fetch-decode-execute loop) is up and running, but only one instruction is wired into it so far:

| Mnemonic | Syntax | Description |
|---|---|---|
| `NOP` | `NOP` | Does nothing for one cycle count (4 cycles). Useful for timing/padding. |

The rest of the ~80-instruction set (moves, arithmetic, branches, ...) lands in upcoming sessions — each one gets its own entry here as it becomes real, with syntax, affected flags, and an example.

## TRAP System Calls

Not implemented yet. TRAPs will be the way your assembly code talks to the outside world — printing text, reading/writing pixels, clearing the screen, exiting the program. Once wired up, each TRAP number will be documented here the same way: what it does, what registers it reads, and an example.

---

Back to [Presentation](./PRESENTATION.md) · [Downloads](./DOWNLOAD.md)
