# Opcode & TRAP Reference

This page is filled in progressively, as each part of the emulator becomes real — it documents what you can actually *do* today, not the final wish list (see [Presentation](./PRESENTATION.md) for the full roadmap).

## Registers

The CPU core (registers, status flags, and the fetch-decode-execute loop) is implemented and working.

| Register | Size | Purpose |
|---|---|---|
| `D0`–`D7` | 32-bit | Data registers — general-purpose, for values and arithmetic |
| `A0`–`A7` | 32-bit | Address registers — hold memory addresses. `A7` doubles as the Stack Pointer (SP) |
| `PC` | 32-bit | Program Counter — address of the next instruction to fetch |

A freshly created CPU — internally, `createCPU()`/`reset()` in the emulator's core — starts with every register at `0` except `A7`, which starts at `$03FFF` (the top of the default stack, which grows downward). This isn't tied to any button in today's UI yet: the app doesn't have a working "load a program and run it" flow at all right now, so nothing currently triggers this reset from the interface (the Debugger panel's own "⟲ Reset" button doesn't drive the real CPU either — see [Troubleshooting](./TROUBLESHOOTING.md#run-step-pause-dont-do-anything)).

### Status Flags

| Flag | Name | Meaning |
|---|---|---|
| `N` | Negative | Set when the result's sign bit is `1` |
| `Z` | Zero | Set when the result is `0` |
| `V` | Overflow | Set on signed overflow |
| `C` | Carry | Set on unsigned carry/borrow |
| `X` | Extend | Mirrors `C` for most operations; used in multi-precision arithmetic |

Which flags a given instruction touches is listed per-instruction below, in the "Flags affected" column, using three notations: a flag on its own (e.g. `N, Z`) is set or cleared to reflect what the instruction actually produced; a flag followed by `(0)` (e.g. `V (0)`) is unconditionally cleared to `0`, regardless of the result — real hardware does this where the flag has no meaningful value for that instruction (multiply/divide can't overflow the way add/sub can, so `MULU`/`MULS` always clear `V`); and a flag missing from the list entirely is left untouched, keeping whatever value it had before the instruction ran.

## Addressing Modes

An addressing mode is how an instruction says where an operand lives — a register, a memory address, or a constant baked right into the instruction. These are the modes wired in today:

| Mode | Syntax | Example | Description |
|---|---|---|---|
| Data register | `Dn` | `MOVE.L D0,D1` | The value in a data register |
| Address register | `An` | `MOVE.L A0,A1` | The value in an address register |
| Register indirect | `(An)` | `MOVE.L (A0),D0` | The value in memory at the address held in `An` |
| Post-increment | `(An)+` | `MOVE.L (A0)+,D0` | Like indirect, then `An` is bumped by the operand's size |
| Pre-decrement | `-(An)` | `MOVE.L D0,-(A0)` | `An` is decremented by the operand's size first, then used as the address |
| Displacement | `d16(An)` | `MOVE.L $10(A0),D0` | `An` plus a 16-bit displacement |
| Immediate | `#value` | `MOVE.L #100,D0` | A constant baked into the instruction (source only — can't be a destination) |
| Absolute short | `xxx.W` | `MOVE.L $100.W,D0` | A 16-bit address, sign-extended — reaches `$0000`-`$7FFF` (or, on real hardware, the top of memory too; this emulator's address space doesn't extend that far) |
| Absolute long | `xxx.L` | `MOVE.L $40000.L,D0` | A full 32-bit address, written directly into the instruction |
| Indexed | `d8(An,Xn)` | `MOVE.L $10(A0,D1.W),D0` | `An` plus an index register (`Dn` or `An`, `.W` sign-extended or `.L`) plus an 8-bit displacement |
| PC displacement | `d16(PC)` | `MOVE.L $10(PC),D0` | The program counter (at the displacement's own extension word) plus a 16-bit displacement — source only, can't be a destination |
| PC indexed | `d8(PC,Xn)` | `MOVE.L $10(PC,D1.W),D0` | Like Indexed, but based on the program counter instead of an address register — source only |

Absolute addressing works either as shown above or, for an address you'll reuse, by loading it into an address register first with `MOVEA` (e.g. `MOVEA.L #$40000,A0` then `(A0)`) — most examples on this page still use the `MOVEA` style since it's what the addressing modes actually looked like before absolute addressing landed, but either works today.

## Memory Map

The emulator's memory system is implemented and working. Every address below is real, addressable memory:

| Region | Address range | Size | Purpose |
|---|---|---|---|
| System area | `$00000`–`$01FFF` | 8 KB | Reserved for TRAP vectors and system data |
| User RAM | `$02000`–`$3FFFF` | ~248 KB | Your program's code, data, and stack |
| Framebuffer | `$40000`–`$7E7FF` | 250 KB | The 320×200 screen, 4 bytes (RGBA) per pixel |
| Controller Input | `$7E800`–`$7E803` | 4 B | Gamepad button state, as a bitmask (see below) |
| Sound | `$7E804`–`$7E80B` | 8 B | Tone generator registers, written by `TRAP #6` — no audio backend consumes them yet (see below) |

To find the address of pixel `(x, y)`:

```
address = $40000 + (y * 320 + x) * 4
```

### Reading the Gamepad

`$7E800` is a live 32-bit bitmask of the current button state — bit `1`
means held down. The app's Gamepad component keeps it updated from
whichever input is active: the on-screen A/B/X/Y + D-pad + Start/Select
control pad by default, or a real controller's buttons the moment one is
connected (a standard-mapped gamepad takes over automatically — the
on-screen buttons stop doing anything while it's plugged in).

| Bit | Button |
|---|---|
| 0 | A |
| 1 | B |
| 2 | X |
| 3 | Y |
| 4 | D-Pad Up |
| 5 | D-Pad Down |
| 6 | D-Pad Left |
| 7 | D-Pad Right |
| 8 | Start |
| 9 | Select |

```
TRAP    #5                ; D0 = controller state
BTST    #0,D0              ; test bit 0 (button A)
BEQ     A_NOT_PRESSED      ; Z=1 -> button A isn't held
```

### Sound (Wired Up, Silent For Now)

`$7E804`–`$7E80B` is laid out for a single-voice tone generator —
frequency, duration, volume, waveform — the same idea as a PC speaker or
the TI-89's buzzer, not a sample player.

| Offset | Field | Size | Purpose |
|---|---|---|---|
| `+0` | Frequency | word | Hz; `0` = silence |
| `+2` | Duration | word | milliseconds |
| `+4` | Volume | byte | `0`-`255` |
| `+5` | Waveform | byte | `0`=square `1`=sine `2`=triangle `3`=sawtooth `4`=noise |
| `+6` | Trigger | byte | nonzero after `TRAP #6` |

`TRAP #6` writes D0-D3 into those fields in one step and sets the trigger:

```
MOVE.W  #440,D0            ; frequency (Hz)
MOVE.W  #250,D1            ; duration (ms)
MOVE.B  #200,D2            ; volume
MOVE.B  #0,D3               ; waveform (0 = square)
TRAP    #6
```

That part's real and tested — the registers land in memory exactly as
written. What's still missing is a host audio backend that reads the
trigger and actually plays a sound through the Web Audio API; until that
lands, running this is silent.

## Instruction Set (Opcodes)

A first handful of real instructions is wired in, grouped below the way Motorola's own 68000 Programmer's Reference Manual groups them. **Cycles** are how many CPU cycles an instruction takes to run — smaller is faster; they're what the emulator's cycle counter adds up as your program executes.

*(Real 68000 hardware charges different cycle counts per addressing mode, and `Bcc` costs less when the branch isn't taken — the emulator uses one flat number per instruction for now; that'll get more accurate as addressing-mode-specific timing is added.)*

### Data Movement

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `MOVE` | `MOVE.size src,dst` | byte, word, long | 4 | N, Z, V (0), C (0) | Copies a value from `src` to `dst`. |
| `MOVEA` | `MOVEA.size src,An` | word, long | 4 | none | Loads an address register. Not a separate opcode — a `MOVE` whose destination is `An` *is* `MOVEA`, bit-for-bit, which is exactly why it skips the flags a plain `MOVE` would set. Byte size raises the [Illegal Instruction exception](#exceptions). |
| `MOVEQ` | `MOVEQ #data,Dn` | long | 4 | N, Z, V (0), C (0) | Loads a small immediate (-128 to 127) into a data register. Faster/shorter than `MOVE.L #imm,Dn`. |
| `LEA` | `LEA src,An` | long | 4 | none | Computes an address and loads it into `An`, without reading what's stored there. Same addressing modes as `JSR` — see [below](#which-addressing-modes-can-jsr-target). |
| `PEA` | `PEA src` | long | 12 | none | Like `LEA`, but pushes the address onto the stack instead of loading it into a register. Same addressing modes as `JSR` — see [below](#which-addressing-modes-can-jsr-target). |
| `SWAP` | `SWAP Dn` | long | 4 | N, Z, V (0), C (0) | Swaps the high and low 16-bit halves of `Dn`. |
| `EXG` | `EXG Dx,Dy` / `EXG Ax,Ay` / `EXG Dx,Ay` | long | 6 | none | Swaps two full 32-bit registers — any mix of data and address registers. |
| `MOVEM` | `MOVEM.size list,dst` / `MOVEM.size src,list` | word, long | see below | none | Moves any subset of the 16 registers to or from memory at once, picked by a bitmask. See [below](#how-does-movems-register-list-work) for the addressing modes, the bitmask order, and the cycle formula. |
| `MOVEP` | `MOVEP.size Dx,(d16,Ay)` / `MOVEP.size (d16,Ay),Dx` | word, long | 16 (word), 24 (long) | none | Transfers a data register to/from alternating bytes of memory, for talking to an 8-bit peripheral over the 16-bit bus. See [below](#how-does-movep-transfer-alternating-bytes) for exactly which bytes and in what order. |

### Arithmetic

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `ADD` | `ADD.size src,Dn` / `ADD.size Dn,dst` | byte, word, long | 4 (Dn), 8/12 byte-word/long (mem) | N, Z, V, C, X | Adds `src` into a data register, or a data register into memory — see [below](#how-does-the-memory-destination-direction-work) for the second form's addressing restriction and why the cycle count is higher. |
| `ADDA` | `ADDA.size src,An` | word, long | 8 (word), 6 (long) | none | `ADD`'s `An`-destination form: always a full 32-bit add, word `src` sign-extended first. Same relationship `MOVEA` has to `MOVE` — no flags touched at all, not even the ones a same-size `ADD` would set. |
| `SUB` | `SUB.size src,Dn` / `SUB.size Dn,dst` | byte, word, long | 4 (Dn), 8/12 byte-word/long (mem) | N, Z, V, C, X | Subtracts `src` from a data register, or a data register from memory — same two directions `ADD` has, see [below](#how-does-the-memory-destination-direction-work). |
| `SUBA` | `SUBA.size src,An` | word, long | 8 (word), 6 (long) | none | `SUB`'s `An`-destination form — same rules `ADDA` follows. |
| `ADDQ`/`SUBQ` | `ADDQ #data,dst` / `SUBQ #data,dst` | byte, word, long | 4 | N, Z, V, C, X (`An`: none) | Adds/subtracts a small immediate (`1`-`8`) straight into `dst`, packed into the opcode itself. `dst = An` is always a full 32-bit op with no flags touched, regardless of size — same rule `MOVEA` follows. |
| `CMP` | `CMP.size src,Dn` | byte, word, long | 4 | N, Z, V, C | Subtracts `src` from a data register like `SUB`, but only sets flags — the register itself is unchanged. Typically followed by a `Bcc`. |
| `CMPA` | `CMPA.size src,An` | word, long | 6 | N, Z, V, C | `CMP`'s `An`-destination form: compares the full 32-bit `An` against `src` (sign-extended if word), without modifying `An`. |
| `CLR` | `CLR.size dst` | byte, word, long | 4 | N, Z, V (0), C (0) | Sets `dst` to `0`. |
| `NEG` | `NEG.size dst` | byte, word, long | 4 | N, Z, V, C, X | Negates `dst` in place (two's complement: `dst = 0 - dst`). |
| `TST` | `TST.size dst` | byte, word, long | 4 | N, Z, V (0), C (0) | Sets flags from `dst`, like `CMP.size #0,dst` — doesn't modify it. |
| `TAS` | `TAS dst` | byte | 4 (`Dn`), 14 (memory) | N, Z (from the value read), V (0), C (0) | Like `TST.B`, but also sets `dst`'s bit 7 to `1` afterward — a "busy" flag for a spinlock. See [below](#how-does-tas-work-as-a-lock) for the idiom. |
| `EXT` | `EXT.size Dn` | word, long | 4 | N, Z, V (0), C (0) | Sign-extends `Dn`: `.W` extends the low byte into the low word (high word untouched); `.L` extends the low word into the full long. |
| `MULU` | `MULU.W src,Dn` | word (source) | 70 | N, Z, V (0), C (0) | Unsigned multiply: `Dn = src × Dn.W`, full 32-bit result in `Dn`. |
| `MULS` | `MULS.W src,Dn` | word (source) | 71 | N, Z, V (0), C (0) | Signed multiply: `Dn = src × Dn.W`, full 32-bit result in `Dn`. |
| `DIVU` | `DIVU.W src,Dn` | word (source) | 138 (10 on overflow, 38 on zero divide) | N, Z, V, C (0) | Unsigned divide: `Dn` (32-bit) ÷ `src` (16-bit) → quotient in `Dn`'s low word, remainder in the high word. If the quotient doesn't fit in 16 bits, `V` is set and `Dn` is left unmodified. Dividing by zero raises the [Zero Divide exception](#exceptions) instead. |
| `DIVS` | `DIVS.W src,Dn` | word (source) | 158 (10 on overflow, 38 on zero divide) | N, Z, V, C (0) | Signed divide, same layout as `DIVU`. Truncates toward zero; the remainder takes the dividend's sign. |

### Binary Coded Decimal

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `ABCD` | `ABCD Dy,Dx` / `ABCD -(Ay),-(Ax)` | byte | 6 (register), 18 (memory) | X, C, Z (see below); N, V undefined | Adds two packed-BCD digits plus `X`: `Dx = Dx + Dy + X`. See [below](#how-does-packed-bcd-arithmetic-work) for what "packed BCD" means and why the flags behave differently here. |
| `SBCD` | `SBCD Dy,Dx` / `SBCD -(Ay),-(Ax)` | byte | 6 (register), 18 (memory) | X, C, Z (see below); N, V undefined | Subtracts two packed-BCD digits plus `X`: `Dx = Dx - Dy - X`. |
| `NBCD` | `NBCD dst` | byte | 6 (`Dn`), 8 (memory) | X, C, Z (see below); N, V undefined | Negates a packed-BCD byte plus `X`: `dst = 0 - dst - X`. `An` direct isn't valid — see [below](#how-does-packed-bcd-arithmetic-work). |

### Logical

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `AND` | `AND.size src,Dn` / `AND.size Dn,dst` | byte, word, long | 4 (Dn), 8/12 byte-word/long (mem) | N, Z, V (0), C (0) | Bitwise ANDs `src` into a data register, or a data register into memory — see [below](#how-does-the-memory-destination-direction-work). |
| `OR` | `OR.size src,Dn` / `OR.size Dn,dst` | byte, word, long | 4 (Dn), 8/12 byte-word/long (mem) | N, Z, V (0), C (0) | Bitwise ORs `src` into a data register, or a data register into memory — see [below](#how-does-the-memory-destination-direction-work). |
| `XOR` | `XOR.size Dn,dst` | byte, word, long | 4 | N, Z, V (0), C (0) | Bitwise XORs a data register into `dst` — the one bitwise op where the *source* is always `Dn` and `dst` can be memory. |
| `NOT` | `NOT.size dst` | byte, word, long | 4 | N, Z, V (0), C (0) | Bitwise inverts `dst` in place (one's complement: `dst = ~dst`). |

### Bit Manipulation

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `BTST` | `BTST #n,dst` | long (register), byte (memory) | 4 (register), 8 (memory) | Z only | Tests bit `n` of `dst` (Z=1 when clear). Doesn't modify `dst` — the standard way to poll one button out of the [gamepad bitmask](#reading-the-gamepad). An address register isn't a valid `dst` — that raises the [Illegal Instruction exception](#exceptions). |
| `BCHG` | `BCHG #n,dst` | long (register), byte (memory) | 12 | Z only | Like `BTST`, but also toggles bit `n` of `dst` after testing it. See [below](#what-do-bchgbclrbset-write-back) for what "write back" means here. |
| `BCLR` | `BCLR #n,dst` | long (register), byte (memory) | 14 (register), 12 (memory) | Z only | Like `BTST`, but also clears bit `n` of `dst` after testing it. See [below](#what-do-bchgbclrbset-write-back). |
| `BSET` | `BSET #n,dst` | long (register), byte (memory) | 12 | Z only | Like `BTST`, but also sets bit `n` of `dst` after testing it. See [below](#what-do-bchgbclrbset-write-back). |

### Shift and Rotate

`Dn` shifted/rotated in place by either an immediate count (`#n`, 1-8,
with `#0` meaning 8) or a dynamic count taken from another data register
(mod 64). There's also a second form that shifts/rotates a memory `<ea>`
directly, always by exactly one bit — see [below](#how-does-the-memory-operand-shift-and-rotate-form-work) for its addressing modes, size
restriction, and cycle cost.

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `ASL` | `ASL #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V, C, X | Arithmetic shift left. Sets V if the sign bit changes value at any point during the shift. |
| `ASR` | `ASR #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V (0), C, X | Arithmetic shift right — copies the original sign bit back in at each step. |
| `LSL` | `LSL #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V (0), C, X | Logical shift left, filling with `0`. |
| `LSR` | `LSR #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V (0), C, X | Logical shift right, filling with `0`. |
| `ROL` | `ROL #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V (0), C | Rotates left — the bit rotated out of the top wraps back into bit 0. `X` is never touched. |
| `ROR` | `ROR #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V (0), C | Rotates right — the bit rotated out of bit 0 wraps back into the top. `X` is never touched. |
| `ROXL` | `ROXL #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V (0), C, X | Rotates left *through* `X` — the bit rotated out becomes the new `X`/`C`; the *old* `X` rotates in where `ROL` would wrap the outgoing bit. See [below](#how-does-rotating-through-x-differ-from-a-plain-rotate). |
| `ROXR` | `ROXR #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V (0), C, X | Rotates right *through* `X`, mirroring `ROXL`. |

*(A dynamic count of `0` — only possible with the `Dx,Dn` form — does nothing to the value. For every instruction here except `ROXL`/`ROXR`: `C` comes out cleared, `X` is left exactly as it was. `ROXL`/`ROXR` are the one exception — see [below](#how-does-rotating-through-x-differ-from-a-plain-rotate).)*

### Program Control

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `BRA` | `BRA target` | word | 10 | none | Always jumps to `target`. |
| `Bcc` | see below | word | 10 | none (reads flags, doesn't set them) | Jumps to `target` only if the named condition on the current flags holds. |
| `JMP` | `JMP target` | word | 8 | none | Jumps to `target` unconditionally — no [return address](#what-is-a-return-address) is pushed. See [below](#which-addressing-modes-can-jsr-target) for which addressing modes are valid. |
| `JSR` | `JSR target` | word | 16 | none | Pushes the [return address](#what-is-a-return-address) onto the stack, then jumps to `target`. See [below](#which-addressing-modes-can-jsr-target) for which addressing modes are valid. |
| `BSR` | `BSR target` | word | 18 | none | Like `JSR`, but PC-relative — pushes the [return address](#what-is-a-return-address), then always branches to `target`. |
| `RTS` | `RTS` | word | 16 | none | Pops a [return address](#what-is-a-return-address) pushed by `JSR`/`BSR` and jumps there. |
| `DBcc` | `DBcc Dn,target` | word | 10 / 12 / 14 | none | Tests condition `cc` (same table as `Bcc`), then either stops or loops back to `target`. See [below](#how-does-dbcc-decide) for exactly how, and what the three cycle counts mean. |
| `Scc` | `Scc dst` | byte | 4 / 6 / 8 | none | Tests condition `cc` (same table as `Bcc`) and sets `dst` to `$FF` or `$00` — no branch, no arithmetic. See [below](#which-destinations-can-scc-use) for valid destinations and what the three cycle counts mean. |
| `LINK` | `LINK An,#displacement` | word | 16 | none | Stack-frame prologue: pushes `An`, points `An` at the new frame, then moves `SP` by `displacement`. See [below](#how-do-link-and-unlk-handle-a7) for the `LINK A7`/`UNLK A7` special case. |
| `UNLK` | `UNLK An` | word | 12 | none | Stack-frame epilogue, `LINK`'s inverse: restores `SP` from `An`, then pops the old `An` value. See [below](#how-do-link-and-unlk-handle-a7) for the `UNLK A7` special case. |
| `CHK` | `CHK <ea>,Dn` | word | 10 / 40 | N (see below) | Bounds-checks `Dn` against `0` and `<ea>` (both signed words); out of range either way raises the [CHK exception](#exceptions) instead of continuing. See [below](#which-values-does-chk-accept) for the exact range and what happens to `N`. |

### System

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `NOP` | `NOP` | word | 4 | none | Does nothing. Useful for timing/padding. |
| `ILLEGAL` | `ILLEGAL` | word | 34 | none | Deliberately raises the [Illegal Instruction exception](#exceptions) — a reserved opcode, useful as a portable, explicit "trap here" marker. |
| `TRAPV` | `TRAPV` | word | 4 (V clear), 34 (V set) | none (reads V, doesn't set it) | Raises the [TRAPV exception](#exceptions) if `V` is set, otherwise falls through — checks for overflow after an `ADD`/`SUB` without a separate `BVC`/`TRAP` pair. |

See [TRAP System Calls](#trap-system-calls) below for `TRAP`, and
[below](#why-doesnt-this-emulator-implement-rtestopresetmove-sr) for why
`ILLEGAL`/`TRAPV` are here but `RTE`/`STOP`/`RESET`/`MOVE SR` aren't.

### Alphabetical Index

**A** — [ABCD](#binary-coded-decimal) · [ADD](#arithmetic) · [ADDA](#arithmetic) · [ADDQ](#arithmetic) · [AND](#logical) · [ASL](#shift-and-rotate) · [ASR](#shift-and-rotate)

**B** — [Bcc](#program-control) · [BCHG](#bit-manipulation) · [BCLR](#bit-manipulation) · [BRA](#program-control) · [BSET](#bit-manipulation) · [BSR](#program-control) · [BTST](#bit-manipulation)

**C** — [CHK](#program-control) · [CLR](#arithmetic) · [CMP](#arithmetic) · [CMPA](#arithmetic)

**D** — [DBcc](#program-control) · [DIVS](#arithmetic) · [DIVU](#arithmetic)

**E** — [EXG](#data-movement) · [EXT](#arithmetic)

**I** — [ILLEGAL](#system)

**J** — [JMP](#program-control) · [JSR](#program-control)

**L** — [LEA](#data-movement) · [LINK](#program-control) · [LSL](#shift-and-rotate) · [LSR](#shift-and-rotate)

**M** — [MOVE](#data-movement) · [MOVEA](#data-movement) · [MOVEM](#data-movement) · [MOVEP](#data-movement) · [MOVEQ](#data-movement) · [MULS](#arithmetic) · [MULU](#arithmetic)

**N** — [NBCD](#binary-coded-decimal) · [NEG](#arithmetic) · [NOP](#system) · [NOT](#logical)

**O** — [OR](#logical)

**P** — [PEA](#data-movement)

**R** — [ROL](#shift-and-rotate) · [ROR](#shift-and-rotate) · [ROXL](#shift-and-rotate) · [ROXR](#shift-and-rotate) · [RTS](#program-control)

**S** — [SBCD](#binary-coded-decimal) · [Scc](#program-control) · [SUB](#arithmetic) · [SUBA](#arithmetic) · [SUBQ](#arithmetic) · [SWAP](#data-movement)

**T** — [TAS](#arithmetic) · [TRAPV](#system) · [TST](#arithmetic)

**U** — [UNLK](#program-control)

**X** — [XOR](#logical)

### How does the memory-destination direction work?

`ADD`, `SUB`, `AND`, and `OR` each support two directions that share one mnemonic:

- **`<ea>,Dn`** — read a value from anywhere (any addressing mode, including `#imm`) and combine it into a data register. This is the form used everywhere else on this page.
- **`Dn,<ea>`** — the mirror image: combine a data register's value into `<ea>` instead, writing the result back to `<ea>` rather than to `Dn`. `<ea>` here must be a *memory-alterable* address — not `Dn`, not `An`, no `#imm`, no PC-relative — the same restriction the [memory-operand shift/rotate form](#how-does-the-memory-operand-shift-and-rotate-form-work) uses.

```asm
MOVE.B  #5,D0
ADD.B   D0,(A1)          ; Memory[A1] += D0, not D0 += Memory[A1]
```

The memory-destination form costs more than the flat `4` cycles the `<ea>,Dn` direction uses: `8` for byte or word, `12` for long — writing the result back to memory is a real extra bus cycle the register-destination form doesn't pay.

`AND`'s and `OR`'s `Dn,<ea>` form has one more wrinkle worth knowing if you're hand-encoding opcodes: their byte-sized `mode 000`/`001` slot is reserved on real hardware for `ABCD` (in `AND`'s case) or `SBCD` (in `OR`'s case) — see [How does packed BCD arithmetic work?](#how-does-packed-bcd-arithmetic-work). This isn't a conflict in practice: `Dn,<ea>`'s own `<ea>` already excludes `Dn`/`An` (mode `000`/`001`), so the two instructions never actually compete for the same encoding — the split just happens to land exactly where `Dn,<ea>` was never going to use anyway.

### How does TAS work as a lock?

`TAS dst` does two things in one instruction: it sets flags from `dst` exactly like `TST.B dst` would (`N` from the value's sign bit, `Z` if it was `0`), then — regardless of what it just read — forces `dst`'s bit 7 to `1` and writes that back. Reading the old value and setting the new one happen as a single indivisible step on real 68000 hardware, which is the entire point: it's the classic building block for a *spinlock*, a busy-wait flag that only one caller can ever "win":

```asm
LOOP:
  TAS     FLAG           ; N = old bit 7, then sets FLAG's bit 7
  BMI     LOOP           ; N set: was already busy - spin
  ; N clear: lock acquired, critical section entered
  ...
  CLR.B   FLAG           ; release the lock for the next caller
```

If `FLAG`'s bit 7 was already `1`, `N` comes out set and the loop spins — someone else holds the lock. If it was `0`, `N` comes out clear, execution falls through, and `TAS` has *already* set the bit on its way out — no other caller can slip in between the test and the set, because they were never two separate steps to begin with.

This emulator has no concurrency (no threads, no interrupts preempting mid-instruction) to actually race against, so a plain read followed by a plain write already behaves identically to the indivisible version — the idiom above works the same way it would on real hardware, just without anything else that could ever contend for the lock.

`An` direct isn't a valid `dst` — there's no such thing as test-and-setting an address register — so it raises the [Illegal Instruction exception](#exceptions) instead, the same restriction `BTST`/`CHK` have on their own `<ea>`.

### How does packed BCD arithmetic work?

Packed BCD stores two decimal digits, `0`-`9` each, one per nibble of a byte — a completely different interpretation of the bits than plain binary. `$09` means the decimal digit 9 either way, but `$99` is decimal 99 in packed BCD, not 153 like it would be read as plain binary. Adding `$09` and `$01` as ordinary binary gives `$0A` — not a valid pair of decimal digits — which is exactly the problem `ABCD` corrects for, producing `$10` instead: the same digits ("1", "0") you'd get adding 9 and 1 by hand and carrying.

```asm
MOVE.B  #$09,D0
MOVE.B  #$01,D1
ABCD    D0,D1           ; D1 = 9 + 1 = $10, not the binary $0A
```

All three instructions are byte-only and thread `X` through as a carry/borrow, so a decimal number wider than one byte can be processed one byte at a time, low byte first — the same chaining idiom `ADDX`/`SUBX`/`NEGX` use for plain binary (not yet implemented here, but the principle is identical). `ABCD`/`SBCD`'s `-(Ay),-(Ax)` form exists specifically for this: it walks two multi-byte BCD numbers backward through memory together, one digit-pair at a time.

A real consequence of `NBCD` being defined as `0 - dst - X`: negating a zero byte with `X` already set doesn't stay zero — it borrows, producing `$99` with `C`/`X` set. That's not a bug, it's what makes negating a multi-byte BCD number work: negate the low byte first, then each higher byte's `NBCD` sees the previous byte's borrow via `X` and accounts for it.

Two flag quirks worth knowing before relying on them:

- **`N` and `V` are genuinely undefined** on real 68000 hardware for a BCD result — a packed-decimal byte's top bit isn't a sign bit, so there's no meaningful value to compute. This emulator leaves them untouched rather than inventing one, the same choice [CHK](#which-values-does-chk-accept) makes for its own undefined flags.
- **`Z` is *cleared* if the result is non-zero, but *left alone* if the result is zero** — not a plain assignment like every other instruction on this page. That's deliberate: it lets a multi-byte chain clear `Z` once before the first byte, then read `Z=1` at the end only if *every* byte in the chain came out zero, without each individual byte's instruction able to falsely set `Z` back to `1` on its own.

`NBCD`'s `dst` follows the same restriction `BTST`/`CHK`/`TAS` place on their own operands: `An` direct raises the [Illegal Instruction exception](#exceptions) instead of being treated as a value to negate.

### What do BCHG/BCLR/BSET write back?

Same as `BTST` — the bit is located and its old value drives `Z` — but instead of stopping there, the (possibly changed) value gets written back to `dst`: `BCHG` flips the bit, `BCLR` forces it to `0`, `BSET` forces it to `1`. `Z` still reflects the bit's state *before* the write, exactly like `BTST`, so `BSET #0,D0 / BEQ WAS_CLEAR` reads naturally: branch if the bit *used to be* clear, even though it's `1` now.

`An` direct isn't a valid `dst` for any of the three — same restriction `BTST`/`CHK`/`TAS`/`NBCD` share — so it raises the [Illegal Instruction exception](#exceptions) instead.

`BCLR`'s register-form cycle count (14) is genuinely higher than `BCHG`/`BSET`'s (12) on real 68000 hardware — not a typo. All three cost the same 12 cycles for a memory `dst`.

### Which Bcc do I want?

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

### How does DBcc decide?

`target` works the same way it does for `Bcc`: a label placed earlier in the code, so branching back to it repeatedly is what forms a loop — there's no loop construct in the CPU itself, just this instruction deciding, each time it runs, whether to jump back or not.

```mermaid
flowchart TD
    Start(["DBcc runs"]) --> TestCC{"1. cc true?"}
    TestCC -- yes --> Stop["2. Stop: no branch<br/>Dn untouched<br/>(12 cycles)"]
    TestCC -- no --> Dec["3. Decrement low 16 bits of Dn"]
    Dec --> TestNeg1{"Dn == -1?"}
    TestNeg1 -- no --> Branch["4. Branch back to target<br/>loop runs again<br/>(10 cycles)"]
    TestNeg1 -- yes --> Fall["5. Fall through<br/>loop is over<br/>(14 cycles)"]
```

Spelled out, step by step:

1. Test condition `cc` (the same table as `Bcc`, above).
2. **Already true?** Stop here: no branch, `Dn` untouched. *(12 cycles.)*
3. **False** — decrement the low 16 bits of `Dn`.
4. **Result isn't `-1`?** Branch back to `target`: the loop runs again. *(10 cycles.)*
5. **Result is `-1`?** Fall through instead: the loop is over. *(14 cycles.)*

`DBRA` (a.k.a. `DBF`) is `DBcc` with `cc` fixed to "always false" — step 2 never fires, so it always falls through to the decrement. See the `DBRA` example further down this page, including the classic off-by-one it's easy to trip over.

### Which destinations can Scc use?

Any data-alterable destination — `Dn` or writable memory, same restriction `CLR`/`NOT`/`NEG`/`TST` use. Not valid: `An`, `#value`, or a PC-relative address (`d16(PC)`, `d8(PC,Xn)`).

The three cycle counts depend on both the destination and the outcome of testing `cc`: 4 cycles for `Dn` when `cc` turns out false, 6 when it's true, 8 for a memory destination either way.

### What is a "return address"?

The address of the instruction right after the call — where execution should pick back up once the called code is done. `JSR`/`BSR` push it onto the stack when they jump; `RTS` pops it back off and jumps there, resuming exactly where the caller left off. This is the 68000's version of a `call`/`return` mechanism.

Concretely, `PC` (the [Program Counter](#registers)) already points past an instruction by the time that instruction runs — the CPU advances it during fetch, before execution. So when `JSR` pushes "the return address", it's just pushing `PC`'s current value at that point, which happens to be right after the `JSR` instruction (and past any extension word its addressing mode used, e.g. the `d16` in `JSR $10(A0)`):

```asm
        JSR     MY_FUNC        ; at address $2000, 2 bytes long
; <-- $2002 is what gets pushed as the return address
```

Inside `MY_FUNC`, a final `RTS` pops that `$2002` back into `PC`, so execution resumes right after the call. `JMP` skips all of this — no address is pushed, so there's nothing to return to.

### Which addressing modes can JSR target?

Any that name a memory location without a register side effect — the 68000's "control" addressing modes: `(An)`, `d16(An)`, `d8(An,Xn)`, `xxx.W`, `xxx.L`, `d16(PC)`, `d8(PC,Xn)`. Not valid: `Dn`, `An`, `(An)+`, `-(An)`, or `#imm`. See [Addressing Modes](#addressing-modes) above for what each of these means (that section covers what every other instruction's `src`/`dst` can be, too). `JMP`, `LEA`, and `PEA` all use this exact same set for their `target`/`src` — they compute the address the same way `JSR` does, just jump to it directly (`JMP`, without pushing a return address), load it into `An` (`LEA`), or push it onto the stack (`PEA`) instead.

### How do LINK and UNLK handle A7?

`LINK An,#displacement` sets up a stack frame in three steps: push `An` onto the stack, point `An` at that pushed value (the new frame pointer), then move `SP` by `displacement` — a negative value reserves that many bytes of local variables below the frame. `UNLK An` tears it back down in the opposite order: `SP` is restored from `An`, and the old `An` value is popped back off the stack. Together they're the standard prologue/epilogue for a subroutine that needs local variables:

```asm
MY_FUNC:
  LINK    A6,#-8         ; A6 = frame pointer, 8 bytes of locals
  MOVE.L  D0,-8(A6)      ; use the locals via A6
  ...
  UNLK    A6             ; restore SP, pop the caller's A6 back
  RTS
```

Both instructions are defined as an exact sequence of micro-operations, not one atomic "swap An and SP" step — `LINK`: `SP-4→SP`, `An→(SP)`, `SP→An`, `SP+displacement→SP`; `UNLK`: `SP←An`, `An←(SP)`, `SP←SP+4`. That only matters when `An` *is* `A7` (`LINK A7,#d` / `UNLK A7`), since then every step in the sequence reads or writes the same physical register the previous step just changed:

- **`LINK A7,#d`**: step 1 already decremented `A7` before step 2 pushes it, so the value that lands on the stack is the *new*, already-decremented `SP` — not `A7`'s value from before the instruction ran.
- **`UNLK A7`**: step 1 (`SP←An`) is a no-op, since `An` already *is* `SP`. Step 2 (`An←(SP)`) then overwrites `A7` with the popped value — so by the time step 3 runs, `SP←SP+4` adds 4 to the *popped* value, not to the original frame pointer.

Neither case comes up in the `LINK A6,#-8` / `UNLK A6` idiom above, since a subroutine almost always frames a different register than `SP` — but hand-encoding raw opcode words makes it easy to reach for `A7` by mistake, so it's worth knowing the sequence rather than assuming "swap" semantics.

### Which values does CHK accept?

`CHK <ea>,Dn` treats `<ea>` as an upper bound and checks whether `Dn`'s low 16 bits, read as a signed value, falls in the range `0` to `<ea>` inclusive — the classic use is validating an array index before using it:

```asm
MOVE.W  D3,D0           ; candidate index, computed earlier
CHK     #99,D0          ; valid range is 0-99 (a 100-entry array)
; only reached if D0 was in 0..99 - safe to use as an index below
LEA     TABLE,A0
MOVE.W  (A0,D0.W),D1    ; safe: D0 already passed the bounds check
```

Two ways to fail, and `N` tells you which one happened right before the exception fires:

- **`Dn` is negative** — `N` is set to `1`.
- **`Dn` is greater than the bound** — `N` is cleared to `0`.

Either failure raises the [CHK exception](#exceptions) (vector `$48`) instead of falling through to the next instruction — same mechanism as `DIVU`/`DIVS`'s Zero Divide, just a different vector. When `Dn` is in range, execution just continues and `N` is left exactly as it was; `Z`, `V`, and `C` are undefined on real 68000 hardware in every case, so this emulator leaves them untouched too rather than picking an arbitrary value for them.

`An` direct isn't a valid `<ea>` here — there's no such thing as bounds-checking against an address register — so it raises the [Illegal Instruction exception](#exceptions) instead, the same restriction `BTST` has on its destination.

### How does MOVEM's register list work?

`MOVEM` moves any subset of the 16 registers (`D0`-`D7`, `A0`-`A7`) to or from memory in one instruction. The register list — written as a range/list like `D0-D2/A0`, meaning `D0`, `D1`, `D2`, and `A0` — gets packed into a 16-bit bitmask, one bit per register, that follows the opcode word. (There's no assembler yet, so today that bitmask has to be hand-encoded, the same way `Bcc`'s target does.)

Which addressing modes are valid depends on which direction the data is moving:
- **Register list → memory** (`MOVEM.size list,dst`): the [control addressing modes](#which-addressing-modes-can-jsr-target) `JSR`/`LEA`/`PEA` use, plus predecrement (`-(An)`).
- **Memory → register list** (`MOVEM.size src,list`): the same control addressing modes, plus postincrement (`(An)+`).

`Dn`, `An` direct, and `#imm` are never valid — there's no single register or constant to move a whole register list to or from.

Two quirks worth knowing before hand-encoding one:
1. **Predecrement reverses the bit order.** For every addressing mode except `-(An)`, bit 0 of the mask is `D0` and bit 15 is `A7`. But `-(An)` decrements the address *before* each store, filling memory backward — so to keep the lowest address holding the lowest-numbered register (matching normal reading order), the bit order flips too: bit 0 becomes `A7`, bit 15 becomes `D0`. A real assembler handles this automatically from the `list,-(An)` syntax; hand-encoding it means reversing the bits yourself.
2. **Word-size loads sign-extend.** `MOVEM.W src,list` sign-extends each 16-bit value it reads to the full 32 bits of its register — unlike `MOVE.W`, which only overwrites the low word and leaves the high word alone. `MOVEM.W list,dst` (storing) just writes each register's low 16 bits, no extension involved.

**Cycles**: `8 + 4n` (register→memory, word) / `8 + 8n` (long); `12 + 4n` (memory→register, word) / `12 + 8n` (long) — `n` is the number of registers actually transferred, not 16.

### How does MOVEP transfer alternating bytes?

`MOVEP` moves data between `Dx` and a byte-oriented peripheral wired onto the 68000's 16-bit data bus at every *other* address — a hardware detail this emulator doesn't need to model (it's flat byte-addressable memory), but the instruction still transfers the bytes in the same order and positions real hardware would, in case a program relies on it.

Starting at `(d16,Ay)`, it reads/writes one byte, steps the address by `2`, reads/writes the next byte, and so on — `2` (`.W`) or `4` (`.L`) bytes total, most-significant byte first:

```
MOVEP.L D0,$0(A0)
; byte 0 (D0 bits 31-24) -> Memory[A0+0]
; byte 1 (D0 bits 23-16) -> Memory[A0+2]
; byte 2 (D0 bits 15-8)  -> Memory[A0+4]
; byte 3 (D0 bits 7-0)   -> Memory[A0+6]
```

`.W` only ever touches `Dx`'s low 16 bits — loading leaves the high word alone (same merge rule a plain word `MOVE` into `Dn` follows), storing only reads the low word out.

Unlike every other data-movement instruction, there's no addressing-mode field to pick from: `(d16,Ay)` is the only form `MOVEP` supports, always with a displacement (even `$0`, as above) — there's no `(An)`-only shorthand.

### How does the memory-operand shift and rotate form work?

Every `ASL`/`ASR`/`LSL`/`LSR`/`ROL`/`ROR`/`ROXL`/`ROXR` in [Shift and Rotate](#shift-and-rotate) above also has a second form that shifts/rotates a memory `<ea>` directly instead of a `Dn` — always by exactly one bit (there's no room left in the opcode for a count once `<ea>` is encoded), and word-sized only (same reason — no size field left either).

Valid `<ea>`: `(An)`, `(An)+`, `-(An)`, `d16(An)`, `d8(An,Xn)`, `xxx.W`, or `xxx.L` — anything except `Dn`, `An` direct, `#imm`, or a PC-relative address (see [Addressing Modes](#addressing-modes)). `Dn` and `An` both raise the [Illegal Instruction exception](#exceptions) here: shifting a `Dn` is what the register form above is for, and there's no such thing as shifting an address register.

**Cycles**: 8, flat, regardless of addressing mode.

**Example** — shift a value already sitting in memory, without loading it into a register first:

```
ASL     (A0)                ; Memory[A0] <<= 1, in place
```

### How does rotating through X differ from a plain rotate?

`ROXL`/`ROXR` rotate through the `X` flag instead of leaving it out of the loop the way `ROL`/`ROR` do — the bit that gets rotated out becomes the new `X` (and `C` — the two always end up equal here), but the bit that rotates back *in* is whatever `X` held *before* the instruction ran, not the bit that just left. A `ROL`/`ROR` never has this extra step: the outgoing bit wraps straight back in on its own.

One consequence worth knowing: a rotate count of `0` (only possible with the `Dx,Dn` form) still sets `C` to `X`'s value. Every other instruction in this family either leaves `C`/`X` alone (`ASL`/`ASR`/`LSL`/`LSR`) or clears `C` (`ROL`/`ROR`) when nothing actually shifted — `ROXL`/`ROXR` are the one case where "nothing shifted" still changes a flag.

**Example** — the same rotate, with and without `X`:

```
; D0 = %0000_0010, X = 1
ROL     #1,D0        ; -> %0000_0100 (bit 7 wraps in)
; ...reset D0 to %0000_0010...
ROXL    #1,D0        ; -> %0000_0101 (old X wraps in)
```

### Why doesn't this emulator implement RTE/STOP/RESET/MOVE SR?

Real 68000 hardware has two privilege levels, user and supervisor,
controlled by a bit in the Status Register (`SR`) — a 16-bit register
this emulator only partially models. `SR`'s low byte is the
[Status Flags](#status-flags) every arithmetic/logic instruction on this
page reads or sets (`N`/`Z`/`V`/`C`, plus `X`). `SR`'s high byte — the
supervisor bit, an interrupt priority mask, a trace bit — doesn't exist
here at all, and neither does the separate supervisor stack pointer
(`SSP`) real hardware switches to alongside it: raising an
[exception](#exceptions) here only ever pushes `PC`, onto the one stack
there is, `A7`.

That's a deliberate simplification, not an oversight: supervisor mode
exists to protect a multi-program OS kernel from untrusted user code
sharing one CPU. This emulator runs one program at a time with nothing to
protect it from, so the privilege boundary has no job to do here.
Concretely, that rules out:

- `MOVE` to/from `SR`, `MOVE` to/from `CCR`, `MOVE USP` — nothing to read
  a full `SR` out of, no separate `USP` register to move.
- `STOP` — loads an immediate into `SR` (interrupt mask included) before
  halting; the "immediate into `SR`" part has no home.
- `RESET` — pulses a hardware reset line to external peripherals; there's
  no peripheral bus to reset.
- `RTE` — pops `SR` and `PC` off the supervisor stack, possibly returning
  to user mode; this emulator's exceptions only ever push `PC`, so
  there's no `SR` for `RTE` to pop either.

`ILLEGAL` and `TRAPV` don't touch any of this — both are just alternate
ways to *raise* an exception, through the exact same `PC`-only mechanism
every other exception on this page already uses.

**Example** — add two numbers and write a white pixel, using a direct absolute address:

```
MOVE.L  #100,D0
MOVE.L  #200,D1
ADD.L   D1,D0                ; D0 = 300
MOVE.L  #$FFFFFF,$40000.L    ; first pixel = white
TRAP    #0                    ; exit
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

**Example** — the same countdown, more idiomatically, using `DBRA`:

```
MOVEQ   #4,D0             ; D0 = 4 (see gotcha below)
LOOP:
ADD.W   #1,D1             ; (loop body — whatever the loop is for)
DBRA    D0,LOOP           ; D0--, loop unless D0 hits -1
TRAP    #0                 ; exit
```

`DBRA` folds the decrement, the comparison, and the branch into one instruction — this is the loop `SUB.L`/`CMP.L`/`BNE` above builds by hand, in the form real 68000 code almost always uses instead. The classic gotcha, and the reason this loads `4` where the `Bcc` version above loaded `5`: the body always runs once *before* the first decrement, and the loop only stops once `Dn` has been decremented all the way to `-1`. So for the body to run exactly `N` times, `Dn` has to start at `N - 1`, not `N` — starting it at `5` here would run the body 6 times, not 5.

**Example** — calling a subroutine with `JSR`/`RTS` (again, `DOUBLE:` is illustrative — hand-encode the actual address today):

```
MOVEA.L #DOUBLE,A0        ; A0 = address of the subroutine
MOVEQ   #21,D0
JSR     (A0)               ; D0 *= 2, then returns here
TRAP    #0                 ; exit

DOUBLE:
ADD.L   D0,D0              ; D0 += D0
RTS                        ; back to the caller
```

**Example** — saving and restoring registers around a subroutine call with `MOVEM`, so `DOUBLE` is free to use `D1` and `A0` as scratch without disturbing the caller's:

```
MOVEQ   #1,D1
MOVEA.L #$1000,A0
MOVEM.L D1/A0,-(A7)       ; push D1,A0 (see above)
MOVEA.L #DOUBLE,A0
MOVEQ   #21,D0
JSR     (A0)               ; D0 *= 2; free to clobber D1/A0
MOVEM.L (A7)+,D1/A0       ; restore, same order pushed
TRAP    #0                 ; exit

DOUBLE:
ADD.L   D0,D0
RTS
```

The rest of the ~80-instruction set lands in upcoming sessions — each one gets its own entry here as it becomes real.

## TRAP System Calls

Three TRAP vectors are wired in:

| Vector | Syntax | Cycles | Description |
|---|---|---|---|
| `#0` | `TRAP #0` | 4 | Halts the CPU (ends the program). |
| `#5` | `TRAP #5` | 4 | Loads the controller button bitmask into D0 — a shortcut for reading `$7E800` directly. |
| `#6` | `TRAP #6` | 4 | Writes D0 (frequency), D1 (duration), D2 (volume), D3 (waveform) into the [sound registers](#sound-wired-up-silent-for-now) and sets the trigger byte. |

The rest — printing text, reading/writing pixels, clearing the screen — is documented here as each one is implemented.

## Exceptions

Different from a `TRAP #n` a program calls on purpose: an exception is
something the CPU raises *on its own* when an instruction hits a fault it
can't just set a flag for. Only genuinely reserved/invalid encodings and
runtime faults raise one — never an instruction this emulator simply
hasn't implemented yet, which would run fine on real hardware.

| Vector | Address | Raised by | Description |
|---|---|---|---|
| Zero Divide | `$40` | `DIVU`/`DIVS` with a zero divisor | Jumps to the handler address stored at `$40`. |
| Illegal Instruction | `$44` | `MOVE.B` to an address register; `BTST`/`CHK` targeting one; `ILLEGAL` | Jumps to the handler address stored at `$44`. The first three are reserved/undefined encodings on real 68000 hardware, not missing features; `ILLEGAL` raises this same one deliberately — see [System](#system) above. |
| CHK | `$48` | `CHK`'s bounds check failing (`Dn < 0` or `Dn >` the upper bound) | Jumps to the handler address stored at `$48`. See [CHK](#program-control) above. |
| TRAPV | `$4C` | `TRAPV` executed with `V` set | Jumps to the handler address stored at `$4C`. See [System](#system) above. |

Your program installs a handler by writing its address into the vector
*before* the fault can happen:

```
MOVEA.L #$40,A0           ; the Zero Divide vector
MOVE.L  #HANDLER,(A0)     ; install the handler
...
DIVU.W  D1,D0             ; if D1 is 0, jumps to HANDLER instead
```

Real 68000 hardware pushes the status register and PC onto a *supervisor*
stack on any exception; this emulator has no supervisor-mode/status
register concept, so only PC is pushed — onto `A7`, exactly like `JSR`.
So a handler ends with `RTS`, not the real `RTE`, to resume right after
the faulting instruction — see
[above](#why-doesnt-this-emulator-implement-rtestopresetmove-sr) for why
`RTE` itself, and the rest of the real 68000's system/privileged group,
aren't implemented here. If no handler was installed when the fault
happens, the emulator throws a clear error instead of jumping to address
`$0` the way real (misconfigured) hardware would.

## Assembly Programming Tips

### Declaring data: DC.B, DC.W, DC.L

On real 68000 assemblers, `DC.B`, `DC.W`, and `DC.L` ("Define Constant") reserve space in memory and fill it with fixed values at assembly time — the usual way to embed a lookup table, a string, or any other static data alongside the code, e.g.:

```asm
ARRAY:
DC.L    10, 20, 30, 40, 50    ; five long words, back to back
MESSAGE:
DC.B    'HI', 0                ; three bytes: 'H', 'I', 0
```

There's no assembler in this project yet — no `.asm` file at all, only hand-encoded machine words — so `DC.x` isn't something that can actually be written today. The closest equivalent right now is building the data at *runtime* instead of baking it in ahead of time: pick an address, then write each value into it with its own `MOVE`, stepping the address with [`(An)+`](#addressing-modes) the same way a program would read the data back out later. Less convenient than a static table, but the memory ends up holding exactly the same bytes.

### Tips

A few habits worth having, some of them straight from gotchas this emulator's own opcodes hit during development:

- **Initialize every register before reading it.** Nothing clears `D0`-`A7` to a known value automatically — a register holds whatever was last written to it (they do start at `0`, but don't rely on that once a program is running).
- **`CMP` first, `Bcc` second, and pick the right family.** Mixing up signed and unsigned comparisons is the classic bug — see [Which Bcc do I want?](#which-bcc-do-i-want) if a branch seems to go the wrong way.
- **`DBcc`/`DBRA` loop counters start at `N - 1`, not `N`.** The loop body always runs once before the first decrement — see [How does DBcc decide?](#how-does-dbcc-decide) for the full walk-through; it's an easy off-by-one to trip over.
- **Save what a subroutine will clobber, restore it before returning.** [`MOVEM`](#how-does-movems-register-list-work) pushing onto `-(A7)` at the top and popping from `(A7)+` at the bottom is the standard pattern — see its worked example above.
- **`MOVEA`/`ADDQ`/`SUBQ` to an address register never touch the flags**, and are always a full 32-bit operation regardless of the size field — real 68000 behavior, easy to forget if a flag check right after one comes back stale.
- **Prefer `MOVEQ` for small constants (`-128` to `127`)** into a data register — it's the same 4 cycles as `MOVE.L #imm,Dn` but a shorter encoding, and shifts (`ASL`/`LSL`, etc.) are a cheap way to multiply or divide by a power of two instead of reaching for `MULU`/`DIVU`.
- **Comment the *why*, not just the *what*, even in illustrative examples.** Every worked example on this page does — it's what makes a hand-traced instruction sequence checkable later.

## Performance Notes

- **Simple interpretation, no recompilation**: each instruction is fetched, decoded, and executed one at a time — there's no JIT, no bytecode caching. That keeps the implementation easy to follow, which matters more here than raw speed for hand-written assembly programs at this scale.
- **Cycle costs are currently flat per instruction** (see the tables above), not the real 68000's addressing-mode-dependent timing — today's cycle counter is a rough guide for comparing programs, not a cycle-accurate simulation of real hardware.
- **Memory access is O(1)** everywhere: no caching, no virtual memory — the whole address space (RAM, framebuffer, controller input) is backed by one flat block of memory, so reading or writing any address costs the same.
- **No memory protection *inside* the emulated address space**: a running program can read or write any address there, including the system area — nothing stops a bug from overwriting its own vector table or code. This matches real 68000 hardware, which has no MMU either (the same was true of the Mac 128K, Sega Genesis, and Atari ST). It does **not** mean a buggy program can touch your actual computer's memory — the whole emulated space is one self-contained block inside the app; there's no bridge to your real machine, so there's nothing to "escape" to. Out-of-bounds addresses (outside `$00000`–`$7E803`) are still rejected and stop the program.

---

Back to [Presentation](./PRESENTATION.md) · [Downloads](./DOWNLOAD.md) · [Troubleshooting](./TROUBLESHOOTING.md)
