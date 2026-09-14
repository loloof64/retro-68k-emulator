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

The CPU core (registers, status flags, and the fetch-decode-execute loop) is up and running, with a first handful of real instructions wired in:

| Mnemonic | Syntax | Sizes | Flags affected | Description |
|---|---|---|---|---|
| `NOP` | `NOP` | word | none | Does nothing for 4 cycles. Useful for timing/padding. |
| `MOVE` | `MOVE.size src,dst` | byte, word, long | N, Z (V and C always cleared) | Copies a value from `src` to `dst`. |
| `ADD` | `ADD.size src,Dn` | byte, word, long | N, Z, V, C, X | Adds `src` to a data register, in place. |

Supported addressing modes for `src`/`dst` so far: a data register (`D0`-`D7`), an address register (`A0`-`A7`), an immediate value (`#123`, source only), and, through an address register, `(A0)`, `(A0)+`, and `-(A0)`. Absolute addresses (`$40000`) and indexed modes aren't supported yet — that's why the examples below load addresses into an address register first, the same way the [memory map](#memory-map) example does.

**Example** — add two numbers and write a white pixel:

```
MOVE.L  #100,D0
MOVE.L  #200,D1
ADD.L   D1,D0            ; D0 = 300
MOVE.L  #$40000,A0       ; framebuffer base
MOVE.L  #$FFFFFF,(A0)    ; first pixel = white
TRAP    #0                ; exit
```

The rest of the ~80-instruction set (subtraction, multiplication, branches, comparisons, ...) lands in upcoming sessions — each one gets its own entry here as it becomes real.

## TRAP System Calls

One TRAP vector is wired in:

| Vector | Syntax | Description |
|---|---|---|
| `#0` | `TRAP #0` | Halts the CPU (ends the program). |

The rest — printing text, reading/writing pixels, clearing the screen — is documented here as each one is implemented.

---

Back to [Presentation](./PRESENTATION.md) · [Downloads](./DOWNLOAD.md)
