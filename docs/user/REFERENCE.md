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
| `MOVEQ` | `MOVEQ #data,Dn` | long | N, Z (V and C always cleared) | Loads a small immediate (-128 to 127) into a data register. Faster/shorter than `MOVE.L #imm,Dn`. |
| `ADD` | `ADD.size src,Dn` | byte, word, long | N, Z, V, C, X | Adds `src` to a data register, in place. |
| `SUB` | `SUB.size src,Dn` | byte, word, long | N, Z, V, C, X | Subtracts `src` from a data register, in place. |
| `CMP` | `CMP.size src,Dn` | byte, word, long | N, Z, V, C | Subtracts `src` from a data register like `SUB`, but only sets flags — the register itself is unchanged. Typically followed by a `Bcc`. |
| `BRA` | `BRA target` | word | none | Always jumps to `target`. |
| `Bcc` | see below | word | none (reads flags, doesn't set them) | Jumps to `target` only if the named condition on the current flags holds. |

### Which `Bcc` do I want?

After a `CMP`, there are *two separate* families of "is it bigger/smaller" branches — one for **signed** numbers (can be negative), one for **unsigned** (always treated as a positive count). Mixing them up is a classic bug: comparing `$FFFFFFFF` to `1`, as signed that's `-1 < 1` (`BLT` is true), but as unsigned `$FFFFFFFF` is a huge number `> 1` (`BHI` is true) — same bits, opposite answer. Pick the family that matches what the value actually represents (a loop counter is usually unsigned; a temperature could be signed).

**Signed comparisons** (`CMP.L #5,D0` then...):

| Mnemonic | Branches when | Meaning |
|---|---|---|
| `BGT` | signed `>` | Greater Than |
| `BGE` | signed `>=` | Greater or Equal |
| `BLT` | signed `<` | Less Than |
| `BLE` | signed `<=` | Less or Equal |

**Unsigned comparisons** (same syntax, different meaning of "bigger"):

| Mnemonic | Branches when | Meaning |
|---|---|---|
| `BHI` | unsigned `>` | Higher |
| `BCC` (= `BHS`) | unsigned `>=` | Carry Clear / Higher or Same |
| `BCS` (= `BLO`) | unsigned `<` | Carry Set / Lower |
| `BLS` | unsigned `<=` | Lower or Same |

**Equality and raw flag tests** (same either way):

| Mnemonic | Branches when | Meaning |
|---|---|---|
| `BEQ` | `Z=1` (equal) | Equal |
| `BNE` | `Z=0` (not equal) | Not Equal |
| `BPL` | `N=0` | Plus (result was positive/zero) |
| `BMI` | `N=1` | Minus (result was negative) |
| `BVC` | `V=0` | Overflow Clear |
| `BVS` | `V=1` | Overflow Set |

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

**Example** — a countdown loop using `MOVEQ`, `SUB`, `CMP`, and `Bcc`:

```
MOVEQ   #5,D0             ; D0 = 5 (loop counter)
LOOP:
MOVEQ   #1,D1
SUB.L   D1,D0             ; D0 -= 1
CMP.L   #0,D0
BNE     LOOP               ; keep looping while D0 != 0
TRAP    #0                 ; exit
```

*(Labels like `LOOP:` are an assembler feature — there's no assembler yet, so this example is illustrative; today `Bcc`'s target has to be hand-encoded as a byte offset.)*

The rest of the ~80-instruction set (multiplication, division, logical ops, subroutine calls, ...) lands in upcoming sessions — each one gets its own entry here as it becomes real.

## TRAP System Calls

One TRAP vector is wired in:

| Vector | Syntax | Description |
|---|---|---|
| `#0` | `TRAP #0` | Halts the CPU (ends the program). |

The rest — printing text, reading/writing pixels, clearing the screen — is documented here as each one is implemented.

---

Back to [Presentation](./PRESENTATION.md) · [Downloads](./DOWNLOAD.md)
