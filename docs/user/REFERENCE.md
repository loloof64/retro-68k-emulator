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

No instructions are executable yet — there is no CPU core to run them. Once instruction execution starts landing, each opcode will get its own entry here: syntax, what it does, which flags it affects, and a short example.

## TRAP System Calls

Not implemented yet. TRAPs will be the way your assembly code talks to the outside world — printing text, reading/writing pixels, clearing the screen, exiting the program. Once wired up, each TRAP number will be documented here the same way: what it does, what registers it reads, and an example.

---

Back to [Presentation](./PRESENTATION.md) · [Downloads](./DOWNLOAD.md)
