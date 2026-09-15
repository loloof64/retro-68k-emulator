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
| Displacement | `d16(An)` | `MOVE.L $10(A0),D0` | `An` + 16-bit displacement |
| Absolute Short | `xxx.W` | `MOVE.L $100.W,D0` | 16-bit address, sign-extended (reaches `$0000`-`$7FFF`) |
| Absolute Long | `xxx.L` | `MOVE.L D0,$40000.L` | Full 32-bit address, direct |
| Indexed | `d8(An,Xn)` | `MOVE.L $10(A0,D0.W),D0` | `An` + index register (`.W` sign-extended or `.L`) + 8-bit displacement |
| PC Displacement | `d16(PC)` | `MOVE.L $10(PC),D0` | PC (address of the extension word) + 16-bit displacement — source only |
| PC Indexed | `d8(PC,Xn)` | `MOVE.L $10(PC,D0.W),D0` | Like Indexed, but based on PC instead of `An` — source only |

## Flag Notation

Each instruction below has a **Flags** line naming which of the status flags (`N`, `Z`, `V`, `C`, `X` — see [Architecture](./ARCHITECTURE.md#status-flags)) it touches. Three notations appear there:
- A flag listed on its own (e.g. `N, Z`) is set or cleared to reflect what the instruction actually produced.
- A flag followed by `(0)` (e.g. `V (0)`) is unconditionally cleared to `0`, regardless of the result — real 68000 hardware does this where the flag has no meaningful value for that instruction (multiply/divide, for instance, can't overflow the way add/sub can, so `MULU`/`MULS` always clear `V`; `AND`/`OR`/`XOR`/`NOT`/shifts and rotates without a genuine carry out always clear `C` and/or `V` the same way).
- A flag missing from the list entirely is left untouched — its value carries over from whatever it was before the instruction ran.

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

### LEA - Load Effective Address
```
LEA <ea>,An
```

Computes the address `<ea>` names and loads it into `An` — no
dereferencing, so this never reads the memory at that address, only
computes where it *is*. Same "control" addressing modes as `JSR`:
`(An)`, `d16(An)`, `d8(An,Xn)`, `xxx.W`, `xxx.L`, `d16(PC)`, `d8(PC,Xn)`.
Not `Dn`, `An`, `(An)+`, `-(An)`, or `#imm` — see `decodeControlAddress`
in `src/cpu/addressing.ts`, shared with `JSR`. No flags updated.

**Sizes**: L (always)
**Cycles**: 4
**Flags**: None

**Example**:
```asm
LEA     $40000.L,A0    ; A0 = address of the framebuffer
MOVE.L  #$FFFFFF,(A0)  ; first pixel = white
```

### PEA - Push Effective Address
```
PEA <ea>
```

Like `LEA`, but pushes the computed address onto the stack (`A7 -= 4`)
instead of loading it into an address register — the same "control"
addressing modes as `JSR`/`LEA`. Shares `SWAP`'s `$4840` opcode at the
bit level: mode `000` (`Dn`) isn't a valid `PEA` destination anyway (not
a control addressing mode), so `SWAP`'s narrower, more specific
`opcodeTable` entry has to stay listed before `PEA`'s broader one for
that mode to keep resolving to `SWAP` — same trick `DBcc`/`Scc` use for
their own shared `mode=001` slot.

**Sizes**: L (always)
**Cycles**: 12
**Flags**: None

**Example**:
```asm
PEA     $40000.L       ; push the framebuffer address
; ... call a subroutine that expects it on the stack ...
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

### ADDQ/SUBQ - Add/Subtract Quick
```
ADDQ #data,dst    ; data is 1-8
SUBQ #data,dst    ; data is 1-8
```

Adds/subtracts a small immediate (1-8) straight into `dst` — the data is
packed into the opcode word itself, no extension word, unlike
`ADD`/`SUB #imm`. `dst = An` is a special case: always a full 32-bit
operation regardless of the size field, and no flags are touched — same
rule `MOVEA`/`ADDA`/`SUBA` follow. Shares its `ss=11` size-field slot with
`Scc`/`DBcc` (`$50C0`-`$5FFE`, reserved there since `11` isn't a real
size), so those narrower, earlier `opcodeTable` entries have to keep
matching first for that combination.

**Sizes**: B, W, L
**Cycles**: 4
**Flags**: N, Z, V, C, X (`dst = An`: none)

**Examples**:
```asm
ADDQ.L  #1,D0          ; D0 += 1
SUBQ.W  #8,A0          ; A0 -= 8, full 32-bit, no flags
```

### MUL - Multiply
```
MULU src,Dn   ; Unsigned multiply
MULS src,Dn   ; Signed multiply
```

Multiplies Dn by source, stores 32-bit result in Dn.

**Sizes**: W (source)
**Cycles**: 70 (MULU), 71 (MULS)
**Flags**: N, Z, V (0), C (0)

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
**Flags**: N, Z, V (0), C (0)

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
EXT.W   D0              ; low byte -> low word (sign-extended)
EXT.L   D0              ; low word -> full long (sign-extended)
```

## Logical Operations

### AND - Bitwise AND
```
AND src,dst
```

Performs bitwise AND: `dst = dst & src`

**Sizes**: B, W, L
**Cycles**: 4-6
**Flags**: N, Z, C (0), V (0)

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
**Flags**: N, Z, V (0), C, X (a dynamic count of 0 clears C but
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
**Flags**: N, Z, V (0), C

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

### DBcc - Decrement and Branch Conditionally
```
DBcc Dn,label
```

The classic "decrement and loop" instruction. As with `Bcc`, there's no
loop construct in the CPU itself — `label` just names an earlier point
in the code, and it's `DBcc` repeatedly branching back to it that *forms*
the loop. Each time this instruction runs, it decides one of two things:
jump back to `label` (the loop runs again) or fall through to whatever
comes after (the loop is over).

Tests the condition `cc` — the same 16-entry table `Bcc` uses (`T`, `F`,
`HI`, `LS`, `CC`, `CS`, `NE`, `EQ`, `VC`, `VS`, `PL`, `MI`, `GE`, `LT`,
`GT`, `LE`). If it's already true, that's an immediate fall-through: no
branch, `Dn` left untouched, loop over. Otherwise, decrements the low 16
bits of `Dn` (the high word is untouched) and branches back to `label`
unless the result is `-1`, in which case it falls through instead — same
end state (loop over), just reached after one last decrement. `DBRA`
(a.k.a. `DBF`) is this same instruction with `cc` fixed to `F` (always
false), which is why it never takes the immediate-fall-through path and
just counts down every time — see `branchConditionTrue` in
`src/cpu/opcodes.ts` for the reference implementation, shared with `Bcc`.
Unlike `Bcc`, the branch displacement is always a 16-bit extension word —
there's no 8-bit inline form.

**Cycles**: 10 (branch taken), 12 (condition already true, loop stops), 14 (condition false, counter reaches `-1`)

**Example**:
```asm
MOVE.W  #99,D0         ; runs 100 times (Dn = iterations - 1)
LOOP:
  ADD.W   #1,D1        ; D1 += 1
  DBRA    D0,LOOP      ; D0--, loop if D0 != -1
```

The `iterations - 1` starting value is the classic `DBcc` gotcha: the body
always runs once before the first decrement, and the loop only stops once
`Dn` has counted all the way down to `-1` — so `Dn = 99` (not `100`) is
what makes the body run exactly 100 times.

```asm
LOOP:
  BTST    #0,D2         ; test some condition
  DBEQ    D0,LOOP       ; D0--, loop unless already true (Z=1)
```

### Scc - Set Conditionally
```
Scc dst
```

Tests the condition `cc` — the same 16-entry table `Bcc`/`DBcc` use — and
sets `dst` to `$FF` if it's true, `$00` if it's false. No branch, no
arithmetic, no flags touched; it just turns a condition into a byte value
you can store, use as a mask, or feed to another instruction later. Valid
`dst` modes are the same "data alterable" set `CLR`/`NOT`/`NEG`/`TST`
accept: `Dn` or writable memory — not `An`, `#imm`, or PC-relative.

`Scc` and `DBcc` share the same `$50C0`-`$5FFE` encoding range: mode
`001` (`An`) is reserved for `DBcc` there (not a valid `Scc` destination
anyway), so an `Scc`-shaped opcode with that mode is actually a `DBcc`.

**Sizes**: B (always)
**Cycles**: 4 (`Dn`, condition false), 6 (`Dn`, condition true), 8 (memory, either way)
**Flags**: None

**Example**:
```asm
CMP.L   #100,D0
SEQ     D1             ; low byte = $FF if D0 was 100, else $00
```

## Subroutine Control

### JSR - Jump to Subroutine
```
JSR label
```

Push PC onto stack and jump to label.

**Addressing**: all control addressing modes — `(An)`, `d16(An)`,
`d8(An,Xn)`, `xxx.W`, `xxx.L`, `d16(PC)`, `d8(PC,Xn)`. Not `Dn`, `An`,
`(An)+`, `-(An)`, or `#imm`, which the 68000 doesn't allow here either.
`JSR` needs the *address itself* (to jump to), not a value read through
it, so it uses `decodeControlAddress` rather than the general `decodeEA`
used elsewhere.
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
| Data Movement | MOVE, MOVEA, MOVEQ, LEA, PEA, SWAP |
| Arithmetic | ADD, SUB, ADDQ, SUBQ, MUL, DIV, CMP, CLR, NEG, TST, EXT |
| Logical | AND, OR, XOR, NOT |
| Bit | BTST |
| Shift/Rotate | ASL, ASR, LSL, LSR, ROL, ROR |
| Branches | BRA, BEQ, BNE, BLT, BLE, BGT, BGE, BHI, BLS, BCS, BCC, BVS, BVC, BPL, BMI, DBcc (DBRA/DBF, DBT, DBEQ, DBNE, ...), Scc (SEQ, SNE, ST, SF, ...) |
| Subroutines | JSR, BSR, RTS |
| System | TRAP, NOP |

## Alphabetical Index

Every mnemonic documented above, A-Z, linking back to its section. The
conditional `Bcc` variants (`BEQ`, `BNE`, ...) all share the one
[Conditional Branches](#conditional-branches) table, the conditional
`DBcc` variants (`DBEQ`, `DBNE`, ...) all share the one
[DBcc](#dbcc---decrement-and-branch-conditionally) section, and the
conditional `Scc` variants (`SEQ`, `SNE`, ...) all share the one
[Scc](#scc---set-conditionally) section, rather than having a section
each.

**A** — [ADD](#add---add) · [ADDQ](#addqsubq---addsubtract-quick) · [AND](#and---bitwise-and) · [ASL](#aslasr---arithmetic-shift) · [ASR](#aslasr---arithmetic-shift)

**B** — [BCC](#conditional-branches) · [BCS](#conditional-branches) · [BEQ](#conditional-branches) · [BGE](#conditional-branches) · [BGT](#conditional-branches) · [BHI](#conditional-branches) · [BLE](#conditional-branches) · [BLS](#conditional-branches) · [BLT](#conditional-branches) · [BMI](#conditional-branches) · [BNE](#conditional-branches) · [BPL](#conditional-branches) · [BRA](#bra---branch-always) · [BSR](#bsr---branch-to-subroutine) · [BTST](#btst---test-bit) · [BVC](#conditional-branches) · [BVS](#conditional-branches)

**C** — [CLR](#clr---clear) · [CMP](#cmp---compare)

**D** — [DBCC](#dbcc---decrement-and-branch-conditionally) · [DBCS](#dbcc---decrement-and-branch-conditionally) · [DBEQ](#dbcc---decrement-and-branch-conditionally) · [DBGE](#dbcc---decrement-and-branch-conditionally) · [DBGT](#dbcc---decrement-and-branch-conditionally) · [DBHI](#dbcc---decrement-and-branch-conditionally) · [DBLE](#dbcc---decrement-and-branch-conditionally) · [DBLS](#dbcc---decrement-and-branch-conditionally) · [DBLT](#dbcc---decrement-and-branch-conditionally) · [DBMI](#dbcc---decrement-and-branch-conditionally) · [DBNE](#dbcc---decrement-and-branch-conditionally) · [DBPL](#dbcc---decrement-and-branch-conditionally) · [DBRA](#dbcc---decrement-and-branch-conditionally) · [DBT](#dbcc---decrement-and-branch-conditionally) · [DBVC](#dbcc---decrement-and-branch-conditionally) · [DBVS](#dbcc---decrement-and-branch-conditionally) · [DIVS](#div---divide) · [DIVU](#div---divide)

**E** — [EXT](#ext---sign-extend)

**J** — [JSR](#jsr---jump-to-subroutine)

**L** — [LEA](#lea---load-effective-address) · [LSL](#lsllsr---logical-shift) · [LSR](#lsllsr---logical-shift)

**M** — [MOVE](#move---move-data) · [MOVEA](#movea---move-address) · [MOVEQ](#moveq---move-quick) · [MULS](#mul---multiply) · [MULU](#mul---multiply)

**N** — [NEG](#neg---negate) · [NOP](#nop---no-operation) · [NOT](#not---bitwise-not)

**O** — [OR](#or---bitwise-or)

**P** — [PEA](#pea---push-effective-address)

**R** — [ROL](#rolror---rotate) · [ROR](#rolror---rotate) · [RTS](#rts---return-from-subroutine)

**S** — [SCC](#scc---set-conditionally) · [SEQ](#scc---set-conditionally) · [SF](#scc---set-conditionally) · [SGE](#scc---set-conditionally) · [SGT](#scc---set-conditionally) · [SHI](#scc---set-conditionally) · [SLE](#scc---set-conditionally) · [SLS](#scc---set-conditionally) · [SLT](#scc---set-conditionally) · [SMI](#scc---set-conditionally) · [SNE](#scc---set-conditionally) · [SPL](#scc---set-conditionally) · [ST](#scc---set-conditionally) · [SUB](#sub---subtract) · [SUBQ](#addqsubq---addsubtract-quick) · [SVC](#scc---set-conditionally) · [SVS](#scc---set-conditionally) · [SWAP](#swap---swap-register-halves)

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
