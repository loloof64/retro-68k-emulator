# Opcode Reference

Complete reference for Motorola 68000 instructions supported by the Retro 68K Emulator.

## Instruction Format

```
MNEMONIC.SIZE src,dst
```

Where:
- **MNEMONIC**: Instruction name (MOVE, ADD, BRA, etc.)
- **SIZE**: Data size - B (byte), W (word), L (long) - optional, defaults to W
- **src**: Source operand
- **dst**: Destination operand

## Addressing Modes

| Mode | Syntax | Example | Description |
|------|--------|---------|-------------|
| Immediate | `#value` | `MOVE.L #100,D0` | Load constant value |
| Register | `Dn`,`An` | `MOVE.L D0,D1` | Register direct |
| Indirect | `(An)` | `MOVE.L (A0),D0` | Memory at address in An |
| Post-Inc | `(An)+` | `MOVE.L (A0)+,D0` | Load then increment An |
| Pre-Dec | `-(An)` | `MOVE.L -(A0),D0` | Decrement An then load |
| Absolute Short | `xxx.W` | `MOVE.L $100.W,D0` | 16-bit address, sign-extended (reaches `$0000`-`$7FFF`) |
| Absolute Long | `xxx.L` | `MOVE.L D0,$40000.L` | Full 32-bit address, direct |
| Indexed | `d8(An,Xn)` | `MOVE.L $10(A0,D0.W),D0` | `An` + index register (`.W` sign-extended or `.L`) + 8-bit displacement |
| PC Displacement | `d16(PC)` | `MOVE.L $10(PC),D0` | PC (address of the extension word) + 16-bit displacement — source only |
| PC Indexed | `d8(PC,Xn)` | `MOVE.L $10(PC,D0.W),D0` | Like Indexed, but based on PC instead of `An` — source only |

## Data Movement

### MOVE - Move Data
```
MOVE src,dst
```

Copies data from source to destination, updates flags (N, Z).

**Sizes**: B, W, L
**Cycles**: 4

**Examples**:
```asm
MOVE.L  #100,D0        ; D0 = 100
MOVE.W  D0,D1          ; D1 = D0 (word)
MOVE.L  D0,$1000       ; Memory[$1000] = D0
MOVE.L  (A0),D1        ; D1 = Memory[A0]
```

### MOVEA - Move Address
```
MOVEA src,An
```

Special MOVE for address registers. No flags updated. On real 68000
hardware (and in this emulator) `MOVEA` isn't a distinct opcode — a `MOVE`
whose destination is an address register *is* `MOVEA`, exactly the same
bit pattern; only the mnemonic an assembler prints differs. So `MOVE.L
#$1000,A0` and `MOVEA.L #$1000,A0` assemble to the same instruction, and
both correctly leave the flags untouched. Byte size to an address
register is a reserved encoding and raises the
[Illegal Instruction exception](#cpu-exception-vector-table).

**Sizes**: W, L
**Cycles**: 4

**Examples**:
```asm
MOVEA.L #$1000,A0      ; A0 = $1000
MOVEA.L D0,A1          ; A1 = D0
```

### MOVEQ - Move Quick
```
MOVEQ #value,Dn
```

Move quick 8-bit signed value to data register. Updates flags.

**Cycles**: 4

**Examples**:
```asm
MOVEQ   #50,D0         ; D0 = 50
MOVEQ   #-1,D1         ; D1 = -1 (sign-extended)
```

### SWAP - Swap Register Halves
```
SWAP Dn
```

Exchanges the high and low 16-bit words of a data register.

**Cycles**: 4
**Flags**: N, Z, V (0), C (0)

**Examples**:
```asm
SWAP    D0              ; D0's high and low words trade places
```

## Arithmetic Operations

### ADD - Add
```
ADD src,dst
```

Adds source to destination: `dst = dst + src`

**Sizes**: B, W, L
**Cycles**: 4-6
**Flags**: N, Z, V, C, X

**Examples**:
```asm
ADD.L   D1,D0          ; D0 += D1
ADD.W   #10,D0         ; D0 += 10
ADD.L   (A0),D1        ; D1 += Memory[A0]
```

### SUB - Subtract
```
SUB src,dst
```

Subtracts source from destination: `dst = dst - src`

**Sizes**: B, W, L
**Cycles**: 4-6
**Flags**: N, Z, V, C, X

**Examples**:
```asm
SUB.L   D1,D0          ; D0 -= D1
SUB.W   #5,D0          ; D0 -= 5
```

### MUL - Multiply
```
MULU src,Dn   ; Unsigned multiply
MULS src,Dn   ; Signed multiply
```

Multiplies Dn by source, stores 32-bit result in Dn.

**Sizes**: W (source)
**Cycles**: 70 (MULU), 71 (MULS)
**Flags**: N, Z, V (always 0), C (always 0)

**Examples**:
```asm
MULU.W  D1,D0          ; D0 = (unsigned) D0 * D1
MULS.W  #10,D0         ; D0 = (signed) D0 * 10
```

### DIV - Divide
```
DIVU src,Dn   ; Unsigned divide
DIVS src,Dn   ; Signed divide
```

Divides Dn (32-bit) by src (16-bit). Result in Dn: quotient in the low
word, remainder in the high word. `DIVS` truncates the quotient toward
zero, and the remainder takes the sign of the dividend (matching real
68000 truncating division, not floored division).

If the quotient doesn't fit in 16 bits (unsigned 0-65535 for `DIVU`,
signed -32768..32767 for `DIVS`), `V` is set and `Dn` is left completely
unmodified — the only case where a DIV instruction doesn't write its
destination. Dividing by zero raises the Zero Divide exception — see
[CPU Exception Vector Table](./MEMORY.md#cpu-exception-vector-table) —
which jumps to a handler routine your program installs, rather than
setting a flag.

**Sizes**: W (source)
**Cycles**: 138 (DIVU), 158 (DIVS), 10 (quotient overflow, either), 38 (zero divide)
**Flags**: N, Z, V, C

**Examples**:
```asm
DIVU.W  D1,D0          ; D0 = D0 / D1
DIVS.W  #10,D0         ; D0 = D0 / 10
```

### CMP - Compare
```
CMP src,dst
```

Compares destination with source (calculates `dst - src`), updates flags but doesn't store result.

**Sizes**: B, W, L
**Cycles**: 4-6
**Flags**: N, Z, V, C, X

**Examples**:
```asm
CMP.L   D1,D0          ; Compare D0 with D1
CMP.W   #100,D0        ; Compare D0 with 100
BEQ     EQUAL          ; Branch if equal
```

### CLR - Clear
```
CLR dst
```

Sets `dst` to zero.

**Sizes**: B, W, L
**Cycles**: 4
**Flags**: N, Z (always set/clear accordingly), V (0), C (0)

**Examples**:
```asm
CLR.L   D0             ; D0 = 0
CLR.W   (A0)           ; Memory word at A0 = 0
```

### NEG - Negate
```
NEG dst
```

Two's-complement negation: `dst = 0 - dst`.

**Sizes**: B, W, L
**Cycles**: 4
**Flags**: N, Z, V, C, X

**Examples**:
```asm
NEG.L   D0             ; D0 = -D0
```

### TST - Test
```
TST dst
```

Sets flags from `dst`, like `CMP #0,dst`, without storing anything.

**Sizes**: B, W, L
**Cycles**: 4
**Flags**: N, Z, V (0), C (0)

**Examples**:
```asm
TST.L   D0             ; set flags from D0
BEQ     IS_ZERO
```

### EXT - Sign Extend
```
EXT.W Dn    ; byte -> word
EXT.L Dn    ; word -> long
```

Sign-extends the low part of a data register into the next size up. `EXT.W` leaves the register's high word untouched, matching real 68000 behavior.

**Sizes**: W, L
**Cycles**: 4
**Flags**: N, Z, V (0), C (0)

**Examples**:
```asm
EXT.W   D0              ; D0's low byte -> low word (sign-extended)
EXT.L   D0              ; D0's low word -> full long (sign-extended)
```

## Logical Operations

### AND - Bitwise AND
```
AND src,dst
```

Performs bitwise AND: `dst = dst & src`

**Sizes**: B, W, L
**Cycles**: 4-6
**Flags**: N, Z, C (always 0), V (always 0)

**Examples**:
```asm
AND.L   D1,D0          ; D0 &= D1
AND.W   #$FF,D0        ; D0 &= 0xFF (mask low byte)
```

### OR - Bitwise OR
```
OR src,dst
```

Performs bitwise OR: `dst = dst | src`

**Sizes**: B, W, L
**Cycles**: 4-6
**Flags**: N, Z, C (0), V (0)

**Examples**:
```asm
OR.L    D1,D0          ; D0 |= D1
OR.W    #$FF00,D0      ; D0 |= 0xFF00
```

### XOR - Bitwise XOR
```
XOR src,dst
```

Performs bitwise XOR: `dst = dst ^ src`

**Sizes**: B, W, L
**Cycles**: 4-6
**Flags**: N, Z, C (0), V (0)

**Examples**:
```asm
XOR.L   D1,D0          ; D0 ^= D1
XOR.W   #$FFFF,D0      ; D0 ^= 0xFFFF (flip all bits)
```

### NOT - Bitwise NOT
```
NOT dst
```

Performs bitwise NOT (one's complement): `dst = ~dst`

**Sizes**: B, W, L
**Cycles**: 4
**Flags**: N, Z, C (0), V (0)

**Examples**:
```asm
NOT.L   D0             ; D0 = ~D0
NOT.W   D1             ; D1 = ~D1 (16-bit flip)
```

## Bit Instructions

### BTST - Test Bit
```
BTST #n,dst
```

Tests bit `n` of `dst` and sets the Z flag (Z=1 when the bit is clear,
Z=0 when it's set). Unlike `AND`, the operand itself is never modified —
it's the standard way to check one flag/button out of a packed bitmask,
such as the [Controller Input](./MEMORY.md#controller-input-7e800-7e803)
register.

**Sizes**: A data register destination is tested as a full long (bit
number 0-31); a memory destination is tested as a byte (bit number 0-7).
An address register isn't a valid destination either way — that raises
the [Illegal Instruction exception](#cpu-exception-vector-table).
**Cycles**: 4 (register), 8 (memory)
**Flags**: Z only

**Examples**:
```asm
TRAP    #5                 ; D0 = controller button state
BTST    #0,D0              ; test bit 0 (button A)
BEQ     A_NOT_PRESSED      ; Z=1 -> bit was clear
```

## Shift and Rotate Operations

### ASL/ASR - Arithmetic Shift
```
ASL #n,Dn     ; Shift left by n bits (1-8; 0 encodes 8)
ASR #n,Dn     ; Shift right by n bits
ASL Dx,Dn     ; Shift left by the count in Dx, mod 64
ASR Dx,Dn     ; Shift right by the count in Dx, mod 64
```

Arithmetic shifts preserve sign bit: `ASR` copies the original sign back in
at each step, `ASL` sets V if the sign bit changes value at any point
during the shift. Only the register form is implemented — the `<ea>`
memory-operand form (always a single-bit shift) isn't.

**Cycles**: 6 + 2*n
**Flags**: N, Z, V, C, X (a dynamic count of 0 clears C but leaves X
untouched — no shift happened)

**Examples**:
```asm
ASL #1,D0              ; D0 <<= 1 (multiply by 2)
ASR #2,D1              ; D1 >>= 2 (divide by 4, signed)
```

### LSL/LSR - Logical Shift
```
LSL #n,Dn     ; Shift left by n bits (1-8; 0 encodes 8)
LSR #n,Dn     ; Shift right by n bits
LSL Dx,Dn     ; Shift left by the count in Dx, mod 64
LSR Dx,Dn     ; Shift right by the count in Dx, mod 64
```

Logical shifts don't preserve sign — both directions fill with `0`. Only
the register form is implemented, same as `ASL`/`ASR`.

**Cycles**: 6 + 2*n
**Flags**: N, Z, V (always 0), C, X (a dynamic count of 0 clears C but
leaves X untouched)

**Examples**:
```asm
LSL #3,D0              ; D0 <<= 3 (multiply by 8)
LSR #1,D1              ; D1 >>= 1 (unsigned divide by 2)
```

### ROL/ROR - Rotate
```
ROL #n,Dn     ; Rotate left (1-8; 0 encodes 8)
ROR #n,Dn     ; Rotate right
ROL Dx,Dn     ; Rotate left by the count in Dx, mod 64
ROR Dx,Dn     ; Rotate right by the count in Dx, mod 64
```

Rotates bits in a circular manner — the bit that rotates out one end comes
back in the other. Only the register form is implemented. Unlike the
shifts above, `X` is never affected by a rotate on real 68000 hardware.

**Cycles**: 6 + 2*n
**Flags**: N, Z, V (0), C (X untouched)

**Examples**:
```asm
ROL #4,D0              ; Rotate D0 left by 4 bits
ROR #1,D1              ; Rotate D1 right by 1 bit
```

## Branch Instructions

### BRA - Branch Always
```
BRA label
```

Unconditional branch to label.

**Cycles**: 10
**Flags**: None

**Example**:
```asm
BRA     LOOP           ; Jump to LOOP
```

### Conditional Branches

`BLT`/`BLE`/`BGT`/`BGE` and `BHI`/`BLS`/`BCC`/`BCS` are two *separate* families for "is it bigger/smaller" — signed vs. unsigned — not synonyms. They can disagree on the same bit pattern: comparing `$FFFFFFFF` to `1`, `BLT` is true (signed: `-1 < 1`) but `BHI` is true too (unsigned: huge `> 1`). Use the signed family for values that can be negative, the unsigned family for plain counts/addresses.

| Instruction | Condition | Flags tested |
|-------------|-----------|-------|
| `BEQ` | Equal | Z=1 |
| `BNE` | Not equal | Z=0 |
| `BGT` | Greater than (signed) | Z=0 and N=V |
| `BGE` | Greater or equal (signed) | N=V |
| `BLT` | Less than (signed) | N≠V |
| `BLE` | Less or equal (signed) | Z=1 or N≠V |
| `BHI` | Higher (unsigned) | C=0 and Z=0 |
| `BCC` (a.k.a. `BHS`) | Carry clear / Higher or same (unsigned) | C=0 |
| `BCS` (a.k.a. `BLO`) | Carry set / Lower (unsigned) | C=1 |
| `BLS` | Lower or same (unsigned) | C=1 or Z=1 |
| `BVS` | Overflow set | V=1 |
| `BVC` | Overflow clear | V=0 |
| `BPL` | Plus | N=0 |
| `BMI` | Minus | N=1 |

`N=V` means "N and V have the same value" (both 0 or both 1); `N≠V` means they differ. See `branchConditionTrue` in `src/cpu/opcodes.ts` for the reference implementation.

**Cycles**: 8 (branch not taken), 10 (branch taken)

**Examples**:
```asm
CMP.L   #100,D0
BEQ     EQUAL_100      ; Branch if D0 == 100
BLT     LESS_100       ; Branch if D0 < 100
BGE     GTE_100        ; Branch if D0 >= 100
```

### DBRA - Decrement and Branch
```
DBRA Dn,label
```

Decrements the low 16 bits of `Dn` (the high word is untouched) and
branches to `label` unless the result is `-1`. Only `DBRA` is
implemented — not the full `DBcc` family (`DBEQ`, `DBNE`, ...), which
would need the same kind of condition-code table `Bcc` uses, over the
`Scc`/`DBcc` truth table rather than the branch one. Unlike `Bcc`, the
branch displacement is always a 16-bit extension word — there's no 8-bit
inline form.

**Cycles**: 10 (branch), 12 (no branch)

**Example**:
```asm
MOVE.W  #100,D0        ; Counter = 100
LOOP:
  ADD.W   #1,D1        ; D1 += 1
  DBRA    D0,LOOP      ; D0--, loop if D0 != -1
```

## Subroutine Control

### JSR - Jump to Subroutine
```
JSR label
```

Push PC onto stack and jump to label.

**Addressing**: only `(An)` indirect is supported so far. `JSR` needs the
*address itself* (to jump to), not a value read through it, so it doesn't
reuse the general `decodeEA` used elsewhere — extending it to absolute
targets is separate follow-up work, not something the addressing-mode
work elsewhere on this page unlocks automatically.
**Cycles**: 16

**Example**:
```asm
JSR     MY_FUNC        ; Call subroutine
; Returns to here
```

### BSR - Branch to Subroutine
```
BSR label
```

Like JSR but PC-relative.

**Cycles**: 18

### RTS - Return from Subroutine
```
RTS
```

Pop PC from stack.

**Cycles**: 16

**Example**:
```asm
MY_FUNC:
  MOVE.L  #42,D0       ; Do something
  RTS                  ; Return
```

## System Instructions

### TRAP - Software Trap
```
TRAP #n
```

Invoke system handler. See [TRAP Handlers](#trap-handlers).

**Cycles**: 34

**Example**:
```asm
TRAP    #0             ; Exit program
TRAP    #1             ; Print string
```

## NOP - No Operation
```
NOP
```

Does nothing, useful for timing/padding.

**Cycles**: 4

## Instruction Summary Table

| Category | Instructions |
|----------|--------------|
| Data Movement | MOVE, MOVEA, MOVEQ, SWAP |
| Arithmetic | ADD, SUB, MUL, DIV, CMP, CLR, NEG, TST, EXT |
| Logical | AND, OR, XOR, NOT |
| Bit | BTST |
| Shift/Rotate | ASL, ASR, LSL, LSR, ROL, ROR |
| Branches | BRA, BEQ, BNE, BLT, BLE, BGT, BGE, BHI, BLS, BCS, BCC, BVS, BVC, BPL, BMI, DBRA |
| Subroutines | JSR, BSR, RTS |
| System | TRAP, NOP |

## Alphabetical Index

Every mnemonic documented above, A-Z, linking back to its section. The
conditional `Bcc` variants (`BEQ`, `BNE`, ...) all share the one
[Conditional Branches](#conditional-branches) table rather than having a
section each.

**A** — [ADD](#add---add) · [AND](#and---bitwise-and) · [ASL](#aslasr---arithmetic-shift) · [ASR](#aslasr---arithmetic-shift)

**B** — [BCC](#conditional-branches) · [BCS](#conditional-branches) · [BEQ](#conditional-branches) · [BGE](#conditional-branches) · [BGT](#conditional-branches) · [BHI](#conditional-branches) · [BLE](#conditional-branches) · [BLS](#conditional-branches) · [BLT](#conditional-branches) · [BMI](#conditional-branches) · [BNE](#conditional-branches) · [BPL](#conditional-branches) · [BRA](#bra---branch-always) · [BSR](#bsr---branch-to-subroutine) · [BTST](#btst---test-bit) · [BVC](#conditional-branches) · [BVS](#conditional-branches)

**C** — [CLR](#clr---clear) · [CMP](#cmp---compare)

**D** — [DBRA](#dbra---decrement-and-branch) · [DIVS](#div---divide) · [DIVU](#div---divide)

**E** — [EXT](#ext---sign-extend)

**J** — [JSR](#jsr---jump-to-subroutine)

**L** — [LSL](#lsllsr---logical-shift) · [LSR](#lsllsr---logical-shift)

**M** — [MOVE](#move---move-data) · [MOVEA](#movea---move-address) · [MOVEQ](#moveq---move-quick) · [MULS](#mul---multiply) · [MULU](#mul---multiply)

**N** — [NEG](#neg---negate) · [NOP](#nop---no-operation) · [NOT](#not---bitwise-not)

**O** — [OR](#or---bitwise-or)

**R** — [ROL](#rolror---rotate) · [ROR](#rolror---rotate) · [RTS](#rts---return-from-subroutine)

**S** — [SUB](#sub---subtract) · [SWAP](#swap---swap-register-halves)

**T** — [TRAP](#trap---software-trap) · [TST](#tst---test)

**X** — [XOR](#xor---bitwise-xor)

## TRAP Handlers

| TRAP # | Function | Description |
|--------|----------|-------------|
| 0 | Exit | Terminate program |
| 1 | Print String | Print null-terminated string to console |
| 2 | Read Pixel | Read pixel from framebuffer at (A0) |
| 3 | Write Pixel | Write pixel to framebuffer at (A0) |
| 4 | Clear Screen | Clear entire LCD screen |
| 5 | Read Controller State | Load the controller button bitmask into D0 |
| 6 | Play Tone | Write D0-D3 (frequency, duration, volume, waveform) into the sound registers and trigger playback |

---

For examples using these instructions, see [Examples](./EXAMPLES.md).
