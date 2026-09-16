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

### EXG - Exchange Registers
```
EXG Dx,Dy
EXG Ax,Ay
EXG Dx,Ay
```

Swaps two full 32-bit registers in one instruction — any combination of
data and address registers, in either order (`EXG Ax,Dy` assembles to
the same `Dx,Ay` encoding with the operands swapped). No flags touched.

Shares its top nibble (`$C1xx`) with `ABCD` (bit 8 = `1` there too), but
`ABCD`'s fixed `0000`/`0001` opmode never overlaps `EXG`'s three exact
opmode values (`01000`/`01001`/`10001`), so the two never collide with
each other directly. `EXG` *does* collide with `AND`'s `Dn,<ea>`
memory-destination form (below, under Logical Operations), though —
that entry's mask only fixes bit 8, wildcarding the rest, so it would
otherwise swallow `EXG`'s words too. `EXG`'s three narrower
`opcodeTable` entries (mask `0xf1f8`, one exact pattern each) have to
be listed before it for that reason.

**Sizes**: L (always)
**Cycles**: 6
**Flags**: None

**Examples**:
```asm
EXG     D0,D1            ; D0 and D1 trade places
EXG     A0,A1            ; A0 and A1 trade places
EXG     D0,A0            ; D0 and A0 trade places
```

### MOVEM - Move Multiple Registers
```
MOVEM.size <register list>,<ea>
MOVEM.size <ea>,<register list>
```

Moves any subset of the 16 registers to or from memory in one instruction.
The register list is its own 16-bit extension word right after the opcode
word — read *before* any `<ea>` extension word (a `d16` displacement, an
absolute address, ...) — with one bit per register.

Two real-68000 quirks this reproduces (see `MOVEM` in
`src/cpu/opcodes.ts`):
- The list is bit0=`D0`..bit7=`D7`,bit8=`A0`..bit15=`A7` for every
  addressing mode *except* predecrement (`-(An)`), where it's **reversed**:
  bit0=`A7`..bit7=`A0`,bit8=`D7`..bit15=`D0`. Predecrement stores backward
  through memory as it decrements `An`, so listing the *last*-stored
  register (`A7`) at bit0 is what makes a later, forward re-read (e.g. a
  matching postincrement `MOVEM` restoring these registers) come back out
  in `D0`..`A7` order — see the round-trip example below.
- Loading (memory-to-register) at word size **sign-extends** each 16-bit
  value into the full 32-bit register, unlike a plain word `MOVE` (which
  only overwrites the low word). Storing at word size just truncates — no
  extension needed, since only the low word is written out.

Addressing modes split by direction: register-to-memory allows the control
modes (`(An)`, `d16(An)`, `d8(An,Xn)`, `xxx.W`, `xxx.L`, `d16(PC)`,
`d8(PC,Xn)` — see `decodeControlAddress` in `src/cpu/addressing.ts`) plus
predecrement; memory-to-register allows the control modes plus
postincrement. `Dn`, `An` direct, and `#imm` are invalid either way
(reserved encodings). `mode=000` (`Dn`) with the register-to-memory
direction bit also doubles as `EXT`'s opcode — the exact `SWAP`/`PEA` and
`DBcc`/`Scc` situation, so `EXT`'s narrower, already-earlier `opcodeTable`
entry has to keep matching first for that one mode.

**Sizes**: W, L
**Cycles**: register-to-memory: `8 + 4n` (W) / `8 + 8n` (L); memory-to-register: `12 + 4n` (W) / `12 + 8n` (L) — `n` = number of registers transferred
**Flags**: None

**Examples**:
```asm
MOVEM.L D0-D2/A0,-(A7)     ; push D0,D1,D2,A0 onto the stack
; ... subroutine body, free to clobber D0-D2/A0 ...
MOVEM.L (A7)+,D0-D2/A0     ; pop them back, same order pushed
```

### MOVEP - Move Peripheral Data
```
MOVEP.size Dx,(d16,Ay)
MOVEP.size (d16,Ay),Dx
```

Transfers 2 (`.W`) or 4 (`.L`) bytes between `Dx` and alternating bytes of
memory starting at `(d16,Ay)`, stepping the address by 2 each byte, most
significant byte first. Built for wiring an 8-bit peripheral onto the
68000's 16-bit data bus — the classic case is a memory-mapped chip that
only decodes every other address.

**Addressing**: always exactly `(d16,Ay)` — there's no addressing-mode
field to decode, unlike every other data-movement instruction. Reuses
`decodeControlAddress`'s `d16(An)` case (mode `0b101`) directly for the
address rather than hand-rolling the displacement extension word.
`.W` only touches `Dx`'s low word (upper word untouched on load, same
merge rule a plain word `MOVE` into `Dn` follows); `.L` overwrites the
full register.

**Opcode space**: shares its top-nibble/bit-8 space with `BTST`/`BCHG`/
`BCLR`/`BSET`'s dynamic `Dn,<ea>` form (never implemented in this
codebase — see the [Bit Instructions](#bit-instructions) section). Mode
field bits 5-3 fixed to `001` is the one combination that form can never
produce for a valid destination (`001` is `An` direct, invalid for a bit
destination), which is exactly the slot real 68000 hardware repurposes
for `MOVEP`.

**Sizes**: W, L
**Cycles**: 16 (W), 24 (L) — same either direction
**Flags**: None

**Example**:
```asm
LEA     PERIPHERAL,A0
MOVEP.W D0,$0(A0)          ; write D0's low word, byte by byte
MOVEP.W $0(A0),D1          ; read it back the same way
```

### MOVE SR - Read the Status Register
```
MOVE SR,dst
```

Writes a word to `dst`: the low byte is the 5 flags packed the way real
hardware's CCR is (`X` at bit 4 down to `C` at bit 0); the high byte —
the supervisor bit, interrupt mask, trace bit real hardware would report
— is always `0` here, since this emulator doesn't model any of that (see
["Why doesn't this emulator implement RTE/STOP/RESET/MOVE SR?"](#why-doesnt-this-emulator-implement-rtestopresetmove-sr)).
**Not privileged** on the real MC68000 this codebase targets — that only
started with the 68010 — so it's implemented like any other
data-movement instruction, unlike `MOVE <ea>,SR` (not implemented).

**Sizes**: W
**Cycles**: 6 (`Dn`), 8 (memory)
**Flags**: None

**Example**:
```asm
MOVE    SR,D0          ; D0's low byte = the 5 flags, CCR-packed
```

### MOVE to CCR - Load the Condition Codes
```
MOVE src,CCR
```

Reads a word from `src` and sets the 5 flags from its low 5 bits
(`X`/`N`/`Z`/`V`/`C` from bit 4 down to bit 0), ignoring the rest. Never
privileged on any 68000-family part.

**Sizes**: W
**Cycles**: 12
**Flags**: X, N, Z, V, C (loaded from `src`)

**Example**:
```asm
MOVE    D0,CCR         ; flags <- D0's low 5 bits
```

## Arithmetic Operations

### ADD - Add
```
ADD <ea>,Dn
ADD Dn,<ea>
```

Adds source to destination: `dst = dst + src`. Two directions share the
one mnemonic: `<ea>,Dn` reads a value from anywhere and adds it into a
data register (any addressing mode, including `#imm`); `Dn,<ea>` is the
mirror image, adding a data register's value into memory instead - `<ea>`
there must be a *memory-alterable* mode (not `Dn`, not `An`, no `#imm`,
no PC-relative), the same restriction the shift/rotate memory form
below uses (`decodeMemAlterableEA` in `src/cpu/opcodes.ts`, shared by
both).

**Sizes**: B, W, L
**Cycles**: 4 (`<ea>,Dn`), 8/12 byte-word/long (`Dn,<ea>`)
**Flags**: N, Z, V, C, X

**Examples**:
```asm
ADD.L   D1,D0          ; D0 += D1
ADD.W   #10,D0         ; D0 += 10
ADD.L   (A0),D1        ; D1 += Memory[A0]
ADD.B   D0,(A1)        ; Memory[A1] += D0 (memory destination)
```

### ADDI - Add Immediate
```
ADDI #<data>,<ea>
```

A different opcode from `ADD #imm,Dn` above, despite reading identically
in assembly: `ADD`'s `<ea>,Dn` form only ever targets a data register,
so an immediate added directly to memory - no register involved at all -
needs its own encoding. `<ea>` can be `Dn` or a writable memory address.
The immediate is read right after the opcode word, before any `<ea>`
extension word (a displacement, an absolute address, ...).

**Sizes**: B, W, L
**Cycles**: 8 (`Dn`, byte/word), 16 (`Dn`, long); 16 (memory, byte/word),
28 (memory, long)
**Flags**: N, Z, V, C, X

**Example**:
```asm
ADDI.W  #10,D0         ; D0 += 10
ADDI.B  #1,(A0)        ; Memory[A0] += 1, no register involved
```

### ADDA - Add Address
```
ADDA src,An
```

`ADD`'s `An`-destination form — exactly `MOVEA`'s relationship to `MOVE`:
always a full 32-bit operation on `An` regardless of source size, and it
never touches the flags at all (not even the ones a same-size `ADD`
would set). A word-sized `src` is sign-extended to 32 bits before being
added.

**Sizes**: W, L
**Cycles**: 8 (word), 6 (long)
**Flags**: None

**Examples**:
```asm
ADDA.W  D0,A0          ; A0 += D0 (sign-extended)
ADDA.L  #$1000,A1      ; A1 += $1000
```

### ADDX - Add Extended
```
ADDX Dy,Dx
ADDX -(Ay),-(Ax)
```

`ADD`'s extend-carry sibling: `dst = dst + src + X`, threading the `X`
flag through so several bytes/words/longs can be chained into one wider
addition, one piece at a time - the binary counterpart to `ABCD`'s
packed-BCD chaining (see [above](#binary-coded-decimal-bcd)). Same two forms
`ABCD`/`SBCD` have - register (`Dy,Dx`) or dual-predecrement memory
(`-(Ay),-(Ax)`, source before destination) - but with a real size field,
since there's no BCD-style byte-only restriction here.

Shares opcode space with `ADD Dn,<ea>` (the memory-destination
direction) at the bit level, the same way `ABCD` shares space with
`AND`'s own memory-destination form: `ADD Dn,<ea>`'s `<ea>` is
memory-alterable only (never `Dn`/`An` direct), and real hardware
reserves exactly that excluded mode `000`/`001` slot for `ADDX` - not
incidental, a genuine hardware split. `ADDX`'s narrower opcodeTable
entry has to be listed before `ADD`'s memory-destination one for that
reason.

`Z` follows the same chaining rule `ABCD`/`SBCD` use: cleared if the
result is non-zero, left alone if it's zero - so a multi-piece chain can
clear `Z` once up front and read it back true only if every piece came
out zero. Unlike `ABCD`/`SBCD`, `N`/`V` *are* well-defined here (this is
ordinary binary arithmetic, not packed BCD), computed by chaining two
ordinary additions (`dst + src`, then that result `+ X`) and OR-ing each
step's own carry/overflow - either step overflowing means the real
three-operand operation does too.

**Sizes**: B, W, L
**Cycles**: 4 (register, byte/word), 8 (register, long), 18 (memory,
byte/word), 30 (memory, long)
**Flags**: N, Z (see above), V, C, X

**Example** — add two 32-bit numbers stored across 4 bytes each, one
byte at a time:
```asm
; A0/A1 point one past the low byte of each 4-byte number
; clear X first (e.g. MOVEQ #0,D0 / ADD.B D0,D0 sets X=0 and Z=1)
ADDX.B  -(A0),-(A1)    ; byte 3 (lowest), X <- carry out
ADDX.B  -(A0),-(A1)    ; byte 2, carries in via X
ADDX.B  -(A0),-(A1)    ; byte 1
ADDX.B  -(A0),-(A1)    ; byte 0 (highest)
```

### SUB - Subtract
```
SUB <ea>,Dn
SUB Dn,<ea>
```

Subtracts source from destination: `dst = dst - src`. Same two
directions `ADD` has: `<ea>,Dn` into a data register (any addressing
mode), or `Dn,<ea>` into memory (memory-alterable modes only - see
`ADD` above for the exact restriction).

**Sizes**: B, W, L
**Cycles**: 4 (`<ea>,Dn`), 8/12 byte-word/long (`Dn,<ea>`)
**Flags**: N, Z, V, C, X

**Examples**:
```asm
SUB.L   D1,D0          ; D0 -= D1
SUB.W   #5,D0          ; D0 -= 5
SUB.B   D0,(A1)        ; Memory[A1] -= D0 (memory destination)
```

### SUBI - Subtract Immediate
```
SUBI #<data>,<ea>
```

`ADDI`'s subtraction counterpart, same relationship `SUB` has to `ADD` -
a different opcode from `SUB #imm,Dn` above, needed for subtracting an
immediate directly from memory with no register involved. `<ea>` can be
`Dn` or a writable memory address; the immediate is read right after the
opcode word, before any `<ea>` extension word.

**Sizes**: B, W, L
**Cycles**: 8 (`Dn`, byte/word), 16 (`Dn`, long); 16 (memory, byte/word),
28 (memory, long)
**Flags**: N, Z, V, C, X

**Example**:
```asm
SUBI.W  #5,D0          ; D0 -= 5
SUBI.B  #1,(A0)        ; Memory[A0] -= 1, no register involved
```

### SUBA - Subtract Address
```
SUBA src,An
```

`SUB`'s `An`-destination form — same rules `ADDA` follows (32-bit,
word source sign-extended, no flags touched).

**Sizes**: W, L
**Cycles**: 8 (word), 6 (long)
**Flags**: None

**Examples**:
```asm
SUBA.W  D0,A0          ; A0 -= D0 (sign-extended)
SUBA.L  #$100,A1       ; A1 -= $100
```

### SUBX - Subtract Extended
```
SUBX Dy,Dx
SUBX -(Ay),-(Ax)
```

`SUB`'s extend-carry sibling: `dst = dst - src - X`, same relationship
`ADDX` has to `ADD` - see `ADDX` above for the chaining idiom, the `Z`
rule, and the opcode-space split with `SUB Dn,<ea>` (identical here,
just in `SUB`'s own top nibble).

**Sizes**: B, W, L
**Cycles**: 4 (register, byte/word), 8 (register, long), 18 (memory,
byte/word), 30 (memory, long)
**Flags**: N, Z (see `ADDX` above), V, C, X

**Example**:
```asm
SUBX.B  -(A0),-(A1)    ; one byte of a chained subtraction
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
**Flags**: N, Z, V, C (`X` untouched, unlike `SUB`)

**Examples**:
```asm
CMP.L   D1,D0          ; Compare D0 with D1
CMP.W   #100,D0        ; Compare D0 with 100
BEQ     EQUAL          ; Branch if equal
```

### CMPI - Compare Immediate
```
CMPI #<data>,<ea>
```

`CMP`'s immediate counterpart - a different opcode from `CMP #imm,Dn`
above, needed for comparing an immediate directly against memory with no
register involved. Like `CMP`, only sets flags: `dst - src` is computed
but never written back. `<ea>` can be `Dn` or a writable memory address;
the immediate is read right after the opcode word, before any `<ea>`
extension word.

**Sizes**: B, W, L
**Cycles**: 8 (`Dn`, byte/word), 14 (`Dn`, long); 12 (memory, byte/word),
20 (memory, long)
**Flags**: N, Z, V, C (`X` untouched, same as `CMP`)

**Example**:
```asm
CMPI.W  #100,D0        ; compare D0 with 100
BEQ     EQUAL
CMPI.B  #0,(A0)        ; compare Memory[A0] with 0, no register
```

### CMPM - Compare Memory
```
CMPM (Ay)+,(Ax)+
```

`CMP`'s dedicated memory-to-memory form: no register involved on either
side, both addresses postincrement. Computes `(Ax) - (Ay)` — same
`src,dst` order as everywhere else on this page — and only sets flags,
same as `CMP`/`CMPI`.

**Addressing**: always postincrement on both operands — this is the one
addressing mode `CMPM` supports, there's no room in the opcode for
anything else.
**Sizes**: B, W, L
**Cycles**: 12 (byte/word), 20 (long)
**Flags**: N, Z, V, C (`X` untouched, same as `CMP`)

**Example** — compare one byte pair from two buffers and branch on it
(each `CMPM` overwrites the flags, so comparing a whole multi-byte
buffer needs a branch after *every* pair, not just the last):
```asm
CMPM.B  (A1)+,(A0)+    ; compare a byte, advance both pointers
BNE     DIFFERENT      ; branches if this pair didn't match
```

### CMPA - Compare Address
```
CMPA src,An
```

`CMP`'s `An`-destination form: compares the full 32-bit `An` against
`src` (sign-extended to 32 bits if word-sized), the same way `CMP`
compares `Dn` — sets flags, doesn't modify `An`.

**Sizes**: W, L
**Cycles**: 6
**Flags**: N, Z, V, C (`X` untouched, same as `CMP`)

**Examples**:
```asm
CMPA.W  D0,A0          ; compare A0 with D0 (sign-extended)
CMPA.L  #$2000,A1      ; compare A1 with $2000
BEQ     MATCH
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

### NEGX - Negate Extended
```
NEGX dst
```

`NEG`'s extend-carry sibling, `ADDX`/`SUBX`'s single-operand relative:
`dst = 0 - dst - X`. Same use case as `ADDX`/`SUBX` - negating a value
wider than one register, one piece at a time, `X` threading the borrow
between pieces - applied to `NEG`'s one-operand shape. `Z` follows the
same chaining rule (see [ADDX](#addx---add-extended) above): cleared if
the result is non-zero, left alone if it's zero.

**Sizes**: B, W, L
**Cycles**: 4 (flat, same simplification `CLR`/`NEG`/`NOT`/`TST` already
use for this family - real hardware's per-size/per-mode split isn't
modeled by any of those four either)
**Flags**: N, Z (see above), V, C, X

**Example**:
```asm
NEGX.B  D0             ; D0 = -D0 - X, one piece of a chain
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

### TAS - Test and Set an Operand
```
TAS dst
```

Reads `dst` as a byte, sets flags exactly like `TST.B` would (`N`/`Z`
from the value read, `V`/`C` cleared), then writes the value back with
bit 7 forced to `1` — a "busy" flag other code can poll later with a
plain `TST`/`BTST`. On real 68000 hardware the read-modify-write is one
indivisible bus cycle, meant for a multiprocessor mutex/semaphore; this
emulator has no concurrency to race against, so a plain read-then-write
already behaves identically.

Shares `TST`'s `$4A00`-`$4AFF` byte: `TAS` reuses the size `11` bits
`TST`'s own byte/word/long encoding never produces, the same "reserved
size slot" trick `EXT`/`MOVEM` and the `<ea>` shift/rotate memory form
use, so `TAS`'s narrower `opcodeTable` entry has to stay listed before
`TST`'s broader one. `An` direct is a genuinely reserved encoding here
(there's no such thing as test-and-setting an address register) —
rejected the same way `BTST`/`CHK` reject it.

**Sizes**: B (always)
**Cycles**: 4 (`Dn`), 14 (memory)
**Flags**: N, Z (from the value read), V (0), C (0)

**Example**:
```asm
LOOP:
  TAS     FLAG           ; N = old bit 7, then sets FLAG's bit 7
  BMI     LOOP           ; N set: was already busy - spin
  ; N clear: lock acquired, critical section entered
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

## Binary Coded Decimal (BCD)

Packed BCD stores two decimal digits (`0`-`9` each) per byte, one per
nibble, rather than treating the byte as a plain binary number. `ADD`ing
`$09` and `$01` as binary gives `$0A` — not a valid two-digit decimal
value — but `ABCD` corrects for that, producing `$10` (the decimal digits
"1" and "0"), the same result you'd get adding the decimal numbers 9 and
1 by hand. All three instructions below are byte-only and thread the `X`
flag through as a carry/borrow, so a multi-byte decimal number can be
processed one byte at a time, low byte first, chaining through `X`
exactly like `ADDX`/`SUBX`/`NEGX` would for plain binary.

Real 68000 hardware leaves `N` and `V` genuinely undefined for a BCD
result (a packed-decimal byte's top bit isn't a sign bit) — this
emulator leaves them untouched rather than inventing a value, the same
choice `CHK` makes for its own undefined flags. `Z` also works
differently than usual here: it's *cleared* if the result is non-zero,
but *left alone* if the result is zero — so a chain of BCD instructions
across multiple bytes only reads `Z=1` at the end if every byte in the
chain came out zero, exactly the accumulate-across-bytes behavior a
multi-byte "is the whole number zero?" check needs.

### ABCD - Add Decimal with Extend
```
ABCD Dy,Dx
ABCD -(Ay),-(Ax)
```

`Dx = Dx + Dy + X`, as packed BCD. The `-(Ay),-(Ax)` form predecrements
*two* address registers — source (`Ay`) before destination (`Ax`), same
order the general `<ea>`-then-`Dn` instructions already decode in —
letting a multi-byte BCD number be walked backward through memory one
byte at a time, low byte first.

**Sizes**: B (always)
**Cycles**: 6 (register), 18 (memory)
**Flags**: X, C (see above); N, V undefined (untouched); Z (see above)

**Example**:
```asm
MOVE.B  #$09,D0
MOVE.B  #$01,D1
ABCD    D0,D1          ; D1 = 9 + 1 = $10 (decimal 10)
```

### SBCD - Subtract Decimal with Extend
```
SBCD Dy,Dx
SBCD -(Ay),-(Ax)
```

`Dx = Dx - Dy - X`, as packed BCD — the same addressing/chaining rules
`ABCD` uses, just subtracting.

**Sizes**: B (always)
**Cycles**: 6 (register), 18 (memory)
**Flags**: X, C (see above); N, V undefined (untouched); Z (see above)

**Example**:
```asm
MOVE.B  #$10,D1
MOVE.B  #$01,D0
SBCD    D0,D1          ; D1 = 10 - 1 = $09 (decimal 9)
```

### NBCD - Negate Decimal with Extend
```
NBCD dst
```

`dst = 0 - dst - X`, as packed BCD — `SBCD`'s single-operand sibling,
implemented as the same subtraction with `0` as the left-hand side. A
real consequence of that: negating a zero byte with `X` already set
doesn't stay zero — it borrows, producing `$99` with `C`/`X` set — which
is exactly what's needed to propagate a borrow through a multi-byte
negate (negate the low byte first, then each higher byte's `NBCD` sees
the previous byte's borrow via `X`).

**Addressing**: any data addressing mode except `An` direct (mode `001`)
— a genuinely reserved encoding here, rejected the same way `BTST`/`CHK`/
`TAS` reject their own restricted addressing modes.

**Sizes**: B (always)
**Cycles**: 6 (`Dn`), 8 (memory)
**Flags**: X, C (see above); N, V undefined (untouched); Z (see above)

**Example**:
```asm
MOVE.B  #$01,D0
NBCD    D0              ; D0 = 0 - 1 = $99, decimal "-1"
```

## Logical Operations

### AND - Bitwise AND
```
AND <ea>,Dn
AND Dn,<ea>
```

Performs bitwise AND: `dst = dst & src`. Same two directions `ADD` has:
`<ea>,Dn` into a data register (any addressing mode), or `Dn,<ea>` into
memory (memory-alterable modes only - see `ADD` above). `Dn,<ea>`'s
mode `000`/`001` slot in this particular top nibble is reserved for
`ABCD`'s register form instead (a real hardware split, not incidental -
see `ABCD` above), which is exactly the set `Dn,<ea>` never uses anyway
since its `<ea>` excludes `Dn`/`An` already.

**Sizes**: B, W, L
**Cycles**: 4 (`<ea>,Dn`), 8/12 byte-word/long (`Dn,<ea>`)
**Flags**: N, Z, C (0), V (0)

**Examples**:
```asm
AND.L   D1,D0          ; D0 &= D1
AND.W   #$FF,D0        ; D0 &= 0xFF (mask low byte)
AND.B   D0,(A1)        ; Memory[A1] &= D0 (memory destination)
```

### ANDI - AND Immediate
```
ANDI #<data>,<ea>
```

`AND`'s immediate counterpart - a different opcode from `AND #imm,Dn`
above, needed for AND-ing an immediate directly into memory with no
register involved. `<ea>` can be `Dn` or a writable memory address; the
immediate is read right after the opcode word, before any `<ea>`
extension word.

**Sizes**: B, W, L
**Cycles**: 8 (`Dn`, byte/word), 16 (`Dn`, long); 16 (memory, byte/word),
28 (memory, long)
**Flags**: N, Z, C (0), V (0)

**Example**:
```asm
ANDI.W  #$FF,D0        ; D0 &= 0xFF (mask low byte)
ANDI.B  #%1110,(A0)    ; Memory[A0] &= %1110, no register involved
```

### OR - Bitwise OR
```
OR <ea>,Dn
OR Dn,<ea>
```

Performs bitwise OR: `dst = dst | src`. Same two directions `AND` has,
including the same `SBCD`-reserved mode `000`/`001` split in `Dn,<ea>`'s
top nibble (see `AND` above).

**Sizes**: B, W, L
**Cycles**: 4 (`<ea>,Dn`), 8/12 byte-word/long (`Dn,<ea>`)
**Flags**: N, Z, C (0), V (0)

**Examples**:
```asm
OR.L    D1,D0          ; D0 |= D1
OR.W    #$FF00,D0      ; D0 |= 0xFF00
OR.B    D0,(A1)        ; Memory[A1] |= D0 (memory destination)
```

### ORI - OR Immediate
```
ORI #<data>,<ea>
```

`OR`'s immediate counterpart - a different opcode from `OR #imm,Dn`
above, needed for OR-ing an immediate directly into memory with no
register involved. `<ea>` can be `Dn` or a writable memory address; the
immediate is read right after the opcode word, before any `<ea>`
extension word.

**Sizes**: B, W, L
**Cycles**: 8 (`Dn`, byte/word), 16 (`Dn`, long); 16 (memory, byte/word),
28 (memory, long)
**Flags**: N, Z, C (0), V (0)

**Example**:
```asm
ORI.W   #$FF00,D0      ; D0 |= 0xFF00
ORI.B   #1,(A0)        ; Memory[A0] |= 1, no register involved
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

### EORI - Exclusive-OR Immediate
```
EORI #<data>,<ea>
```

`XOR`'s immediate counterpart (`XOR` is this codebase's name for what
Motorola's manual calls `EOR` - `EORI` keeps the real mnemonic since
there's no ambiguity to avoid here the way there is between `EOR` and
plain `OR`) - a different opcode from `XOR #imm,Dn`, needed for XOR-ing
an immediate directly into memory with no register involved. `<ea>` can
be `Dn` or a writable memory address; the immediate is read right after
the opcode word, before any `<ea>` extension word.

**Sizes**: B, W, L
**Cycles**: 8 (`Dn`, byte/word), 16 (`Dn`, long); 16 (memory, byte/word),
28 (memory, long)
**Flags**: N, Z, C (0), V (0)

**Example**:
```asm
EORI.W  #$FFFF,D0      ; D0 ^= 0xFFFF (flip all bits)
EORI.B  #1,(A0)        ; Memory[A0] ^= 1, no register involved
```

### ANDI/ORI/EORI to CCR - Combine an Immediate into the Condition Codes
```
ANDI #<data>,CCR
ORI  #<data>,CCR
EORI #<data>,CCR
```

The `<ea>` = `#imm` (mode 111, reg 100) encodings `ANDI`/`ORI`/`EORI`
repurpose as three completely different, fixed-opcode instructions,
rather than combining the immediate into a memory/register `<ea>` the
way their general form above does: this combines it directly into the
condition codes, treating the 5 flags (`X`/`N`/`Z`/`V`/`C`, bit 4 down to
bit 0, same packing `MOVE to CCR` uses) as one 5-bit value. Real hardware
still fetches a full extension word for the immediate here, but only its
low byte is significant — the high byte is reserved and ignored. Never
privileged on any 68000-family part, unlike their `,SR` siblings (not
implemented - see
["Why doesn't this emulator implement RTE/STOP/RESET/MOVE SR?"](#why-doesnt-this-emulator-implement-rtestopresetmove-sr)).

**Sizes**: B
**Cycles**: 20
**Flags**: X, N, Z, V, C (combined with the immediate; `ANDI`/`ORI` don't
force V/C to 0 here the way their general `<ea>` form does — CCR's own
V/C bits are themselves part of the combine)

**Examples**:
```asm
ANDI    #%11110,CCR    ; clear C, leave X/N/Z/V as they are
ORI     #%00001,CCR    ; set C, leave the rest as they are
EORI    #%00100,CCR    ; toggle Z, leave the rest as they are
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

### BCHG/BCLR/BSET - Change/Clear/Set Bit
```
BCHG #n,dst
BCLR #n,dst
BSET #n,dst
```

`BTST`'s write-back siblings: each tests bit `n` of `dst` exactly like
`BTST` (same Z-flag rule, from the bit's state *before* the write), then
writes the modified value back to `dst`. `BCHG` toggles the bit, `BCLR`
clears it, `BSET` sets it.

**Sizes**: Same rule as `BTST` — a data register destination is a full
long (bit number 0-31), a memory destination is a byte (bit number 0-7).
An address register isn't a valid destination either way — that raises
the [Illegal Instruction exception](#cpu-exception-vector-table).
**Cycles**: `BCHG`: 12 (register), 12 (memory). `BCLR`: 14 (register), 12
(memory). `BSET`: 12 (register), 12 (memory).
**Flags**: Z only

**Examples**:
```asm
BSET    #0,D0          ; set bit 0, Z <- old state of that bit
BCLR    #7,(A0)        ; clear bit 7 of a byte in memory
BCHG    #3,D1          ; flip bit 3
```

## Shift and Rotate Operations

Two forms exist for every shift/rotate mnemonic below: a **register form**
(`Dn` shifted/rotated in place, by an immediate count of 1-8 or a dynamic
count from another `Dn`, mod 64) and a **memory-operand form** (`<ea>`
shifted/rotated in place, always by exactly one bit — there's no room left
in the opcode for a count or a size field once `<ea>` is encoded, so it's
word-sized only). The two share a mnemonic but not an opcode shape:
`src/cpu/opcodes.ts`'s `decodeShiftRotate` handles the register form; the
memory form has its own six `OpcodeDefinition`s (`ASL_MEM` etc.) built
around `decodeMemAlterableEA`.

The memory form reuses the register form's opcode space at the bit level:
bits 7-6 there are a size field that only ever takes `00`/`01`/`10` — the
register form's `decodeByteWordLongSize` throws on `11` — and the memory
form sets exactly that otherwise-reserved value to mean "this is the
memory-operand form" instead. That makes the memory form's `opcodeTable`
entries (mask `0xffc0`) far more specific than the register form's (mask
`0xf118`), so — same trick as `EXT`/`MOVEM` and `SWAP`/`PEA` — they're
listed first in `opcodeTable` for that reserved size value to resolve to
the memory form rather than misrouting into the register form's decoder.

Valid `<ea>` for the memory form: the "memory alterable" modes — anything
except `Dn`, `An`, `#imm`, and PC-relative. `Dn`/`An` are a genuinely
reserved encoding here (the register form is what shifts a `Dn`, and
there's no such thing as shifting an address register), so both raise the
[Illegal Instruction exception](#cpu-exception-vector-table) — `decodeEA`
can't reject `An` on its own the way it does the PC-relative modes, since
`An` is a perfectly normal writable destination for every *other*
instruction, so `decodeMemAlterableEA` checks for it explicitly.

### ASL/ASR - Arithmetic Shift
```
ASL #n,Dn     ; Shift left by n bits (1-8; 0 encodes 8)
ASR #n,Dn     ; Shift right by n bits
ASL Dx,Dn     ; Shift left by the count in Dx, mod 64
ASR Dx,Dn     ; Shift right by the count in Dx, mod 64
ASL <ea>      ; Shift left 1 bit (memory, word only)
ASR <ea>      ; Shift right by exactly 1 bit
```

Arithmetic shifts preserve sign bit: `ASR` copies the original sign back in
at each step, `ASL` sets V if the sign bit changes value at any point
during the shift.

**Cycles**: 6 + 2*n (register form); 8 flat (memory form)
**Flags**: N, Z, V, C, X (a dynamic count of 0 clears C but leaves X
untouched — no shift happened)

**Examples**:
```asm
ASL #1,D0              ; D0 <<= 1 (multiply by 2)
ASR #2,D1              ; D1 >>= 2 (divide by 4, signed)
ASL (A0)                ; Memory[A0] <<= 1
```

### LSL/LSR - Logical Shift
```
LSL #n,Dn     ; Shift left by n bits (1-8; 0 encodes 8)
LSR #n,Dn     ; Shift right by n bits
LSL Dx,Dn     ; Shift left by the count in Dx, mod 64
LSR Dx,Dn     ; Shift right by the count in Dx, mod 64
LSL <ea>      ; Shift left 1 bit (memory, word only)
LSR <ea>      ; Shift right by exactly 1 bit
```

Logical shifts don't preserve sign — both directions fill with `0`.

**Cycles**: 6 + 2*n (register form); 8 flat (memory form)
**Flags**: N, Z, V (0), C, X (a dynamic count of 0 clears C but
leaves X untouched)

**Examples**:
```asm
LSL #3,D0              ; D0 <<= 3 (multiply by 8)
LSR #1,D1              ; D1 >>= 1 (unsigned divide by 2)
LSR $1000.W             ; Memory[$1000] >>= 1
```

### ROL/ROR - Rotate
```
ROL #n,Dn     ; Rotate left (1-8; 0 encodes 8)
ROR #n,Dn     ; Rotate right
ROL Dx,Dn     ; Rotate left by the count in Dx, mod 64
ROR Dx,Dn     ; Rotate right by the count in Dx, mod 64
ROL <ea>      ; Rotate left 1 bit (memory, word only)
ROR <ea>      ; Rotate right by exactly 1 bit
```

Rotates bits in a circular manner — the bit that rotates out one end comes
back in the other. Unlike the shifts above, `X` is never affected by a
rotate on real 68000 hardware.

**Cycles**: 6 + 2*n (register form); 8 flat (memory form)
**Flags**: N, Z, V (0), C

**Examples**:
```asm
ROL #4,D0              ; Rotate D0 left by 4 bits
ROR #1,D1              ; Rotate D1 right by 1 bit
ROL (A0)                ; Rotate Memory[A0] left by 1 bit
```

### ROXL/ROXR - Rotate through Extend
```
ROXL #n,Dn    ; Rotate left through X (1-8; 0=8)
ROXR #n,Dn    ; Rotate right through X
ROXL Dx,Dn    ; Rotate left through X, count in Dx
ROXR Dx,Dn    ; Rotate right through X, count in Dx
ROXL <ea>     ; Rotate left 1 bit through X (memory, word)
ROXR <ea>     ; Rotate right 1 bit through X
```

Like `ROL`/`ROR`, but the extend bit (`X`) is part of the rotation instead
of being left out of it — an N+1-bit rotate, not an N-bit one. The bit
shifted out becomes the new `X` (and `C`; the two always end up equal
here), and the bit shifted *in* is whatever `X` held *before* this
instruction ran, not a wraparound of the bit that just left (which is
what makes this different from `ROL`/`ROR` — see the worked example
below). A rotate count of `0` still sets `C` to `X`'s value — every other
instruction in this family either leaves both flags alone (`ASx`/`LSx`)
or clears `C` (`ROx`) when nothing actually shifted.

**Cycles**: 6 + 2*n (register form); 8 flat (memory form)
**Flags**: N, Z, V (0), C, X (`C` and `X` always end up equal, and both
are set even when the rotate count is `0`)

**Examples**:
```asm
; D0 = %0000_0010, X = 1
ROXL    #1,D0            ; D0 = %0000_0101 (X into bit 0 -
                          ; a plain ROL would give %0000_0100)
ROXR    (A0)              ; rotates Memory[A0] through X
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

### JMP - Jump
```
JMP target
```

Unconditional jump to `target` — no return address is pushed, unlike
`JSR`.

**Addressing**: all control addressing modes — `(An)`, `d16(An)`,
`d8(An,Xn)`, `xxx.W`, `xxx.L`, `d16(PC)`, `d8(PC,Xn)`. Not `Dn`, `An`,
`(An)+`, `-(An)`, or `#imm`, which the 68000 doesn't allow here either.
Same set `JSR`/`LEA`/`PEA` validate via `decodeControlAddress`.
**Cycles**: 8
**Flags**: None

**Example**:
```asm
JMP     (A0)           ; Jump to the address held in A0
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

### CHK - Check Register Against Bounds
```
CHK <ea>,Dn
```

Bounds-checks `Dn`'s low word (as a signed value) against the range `0`
to `<ea>` (also read as a signed word — the upper bound). If `Dn` is
negative or greater than the bound, raises the CHK exception instead of
falling through to the next instruction — see [CHK Exception](#chk-exception)
below. In range, execution just continues.

**Addressing**: any data addressing mode except `An` direct (mode `001`)
— that's a genuinely reserved encoding here (there's no such thing as
bounds-checking against an address register), so it raises the Illegal
Instruction exception instead, the same as `BTST` targeting `An`.

**Sizes**: W (always — no size field left in the opcode once `<ea>` and
`Dn` are encoded)
**Cycles**: 10 (no trap), 40 (trap taken, either reason)
**Flags**: N (set if `Dn < 0`, cleared if `Dn >` bound, unaffected if in
range); Z/V/C undefined on real hardware, so untouched here too

The 10/40 split isn't arbitrary: 10 is just the fetch-and-compare cost of
the check itself; the extra 30 cycles only get spent when it actually
traps, covering the same exception-stacking work (pushing the return
state, reading the vector, jumping to the handler) every other exception
in this emulator pays for — compare the flat 34-cycle cost `TRAP`,
`ILLEGAL`, and `TRAPV`'s trap-taken case all charge for that same work on
its own, with nothing else to do first.

**Example**:
```asm
MOVE.W  #99,D0         ; array index to validate
CHK     #99,D0         ; trap if D0 < 0 or D0 > 99 (valid: 0-99)
; only reached if D0 was in range
```

### CHK Exception

`CHK`'s bounds check failing jumps through its own vector, `$48`, the
same mechanism `DIVU`/`DIVS`'s Zero Divide and reserved encodings'
Illegal Instruction already use — see [CPU Exception Vector Table](./MEMORY.md#cpu-exception-vector-table)
for the full layout and how to install a handler.

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

### RTR - Return and Restore Condition Codes
```
RTR
```

`RTS`'s sibling: pops a 16-bit word into the flags (only the low 5
bits are used — `X`/`N`/`Z`/`V`/`C` from bit 4 down to bit 0, the real
68000 CCR bit layout), then pops PC exactly like `RTS`. Not tied to the
exception mechanism or supervisor mode at all — an ordinary,
unprivileged instruction for restoring flags a routine saved earlier
(e.g. with `MOVE <ea>,CCR` building the word by hand, since there's no
"push flags" instruction of its own).

**Cycles**: 20
**Flags**: X, N, Z, V, C (loaded from the popped word)

**Example**:
```asm
MOVE.W  #0b10101,-(A7)  ; hand-build a flags word (X,Z,C set)
MOVE.L  #MY_FUNC,-(A7)  ; hand-build a return address
RTR                     ; pop flags, then pc = MY_FUNC
```

### LINK - Link and Allocate
```
LINK An,#<displacement>
```

Stack-frame prologue: pushes `An` onto the stack, points `An` at the
pushed value (the new frame pointer), then adds the 16-bit signed
`displacement` (an extension word right after the opcode) to `SP` —
negative to reserve that many bytes of locals below the frame. Coded as
Motorola's exact micro-op order (`SP-4->SP`; `An->(SP)`; `SP->An`;
`SP+d->SP`), reading each register fresh at every step rather than
caching `An`'s value up front, so the documented `LINK A7` special case
— the value actually pushed is the *already-decremented* `SP`, not `A7`'s
value before the instruction ran, since `An` and `SP` are the same
register there — falls out for free.

**Cycles**: 16

**Example**:
```asm
LINK    A6,#-8         ; A6 = frame pointer, 8 bytes of locals
MOVE.L  D0,-8(A6)      ; use the reserved space
UNLK    A6             ; tear the frame back down
RTS
```

### UNLK - Unlink
```
UNLK An
```

Stack-frame epilogue, `LINK`'s inverse (`SP<-An`; `An<-(SP)`; `SP<-SP+4`).
Same register-order trick as `LINK` reproduces the `UNLK A7` special
case automatically: `SP<-An` is a no-op there, so `An<-(SP)` overwrites
`A7`/`SP` itself with the popped value, and the final `SP+4` is computed
from *that* new value rather than the original frame pointer.

**Cycles**: 12

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

### ILLEGAL - Deliberately Raise an Illegal Instruction
```
ILLEGAL
```

A reserved opcode ($4AFC) that always raises the
[Illegal Instruction exception](./MEMORY.md#cpu-exception-vector-table) —
a portable, explicit "trap here" marker, rather than relying on whatever
an actually-unassigned opcode happens to do (this emulator's own decoder
rejects those with a plain JS error instead, not a catchable CPU
exception).

**Cycles**: 34
**Flags**: None

### TRAPV - Trap on Overflow
```
TRAPV
```

Raises the [TRAPV exception](./MEMORY.md#cpu-exception-vector-table) if
`V` is set, otherwise falls through as a no-op — checks for overflow
right after an `ADD`/`SUB` without hand-coding a separate `BVC`/`TRAP`
pair.

**Cycles**: 4 (V clear), 34 (V set)
**Flags**: None (reads V, doesn't set it)

See
[Why doesn't this emulator implement RTE/STOP/RESET/MOVE SR?](#why-doesnt-this-emulator-implement-rtestopresetmove-sr)
for why `ILLEGAL`/`TRAPV` made the cut but the rest of the real 68000's
system/privileged group didn't.

### NOP - No Operation
```
NOP
```

Does nothing, useful for timing/padding.

**Cycles**: 4

### Why doesn't this emulator implement RTE/STOP/RESET/MOVE SR?

Real 68000 hardware has two privilege levels, user and supervisor,
controlled by a bit in the Status Register (`SR`) — a 16-bit register
this emulator only partially models. `SR`'s low byte is the
[Status Flags](#flag-notation) every arithmetic/logic instruction on this
page reads or sets (`N`/`Z`/`V`/`C`, plus `X`). `SR`'s high byte — the
supervisor bit, an interrupt priority mask, a trace bit — doesn't exist
in `CPUState` at all, and neither does the separate supervisor stack
pointer (`SSP`) hardware switches to alongside it. See `raiseException` in
`src/cpu/opcodes.ts` and `docs/MEMORY.md`'s
[CPU Exception Vector Table](./MEMORY.md#cpu-exception-vector-table)
section for the resulting "push PC only, no SR" exception model.

That's a deliberate simplification: supervisor mode exists to protect a
multi-program OS kernel from untrusted user code sharing one CPU. This
emulator runs one program at a time with nothing to protect it from, so
the privilege boundary has no job to do here. Concretely, that leaves:

- `MOVE to SR`, `MOVE USP` — genuinely privileged on real hardware, and
  there's no separate `USP` register to move either.
- `STOP` — loads an immediate into `SR` (interrupt mask included) before
  halting; the "immediate into `SR`" part has no home.
- `RESET` — pulses a hardware reset line to external peripherals; there's
  no peripheral bus to reset.
- `RTE` — pops `SR` and `PC` off the supervisor stack, possibly returning
  to user mode; `raiseException` only ever pushes `PC`, so there's no
  `SR` for `RTE` to pop either.

`ILLEGAL` and `TRAPV` don't touch any of this — both are just alternate
ways to *raise* an exception, through the exact same PC-only mechanism
every other exception in this emulator already uses.

**Correction worth being explicit about:** `MOVE from SR` and `MOVE to
CCR` are *not* privileged on the real MC68000 this codebase targets —
`MOVE from SR` only became privileged starting with the 68010, and `MOVE
to CCR`/`RTR` were never privileged on any 68000-family part. None of
the three are blocked by anything above; they're simply not implemented
yet, same as the instructions below.

### Which opcodes aren't implemented, and what happens if you use one anyway?

Beyond the privileged group above, everything originally listed here has
since been implemented, including the last remaining gap: `ANDI`/`ORI`/
`EORI`'s own `#imm,CCR` special-case sub-forms (three exact opcodes,
e.g. `ORI #imm,CCR` at `$003C`) — see
[ANDI/ORI/EORI to CCR](#andiorieori-to-ccr---combine-an-immediate-into-the-condition-codes)
above.

`ADDI`/`SUBI`/`ANDI`/`ORI`/`EORI`/`CMPI` (immediate operand directly
against `<ea>`, no register involved), `ADDX`/`SUBX`/`NEGX`
(extend-carry arithmetic), `CMPM` (memory-to-memory compare), `RTR`
(like `RTS`, but also restores the flags), `MOVE SR`/`MOVE to CCR`
(reading/loading the flags as a word), and `ANDI`/`ORI`/`EORI #imm,CCR`
(combining an immediate directly into the flags) are all implemented now
— see [Arithmetic Operations](#arithmetic-operations),
[Logical Operations](#logical-operations),
[Subroutine Control](#subroutine-control), and
[Data Movement](#data-movement) above. **Correction from an earlier
version of this section**: `MOVE from CCR` was listed here too, but
that instruction doesn't exist on the real MC68000 this codebase
targets at all — Motorola only added it in the 68010, to compensate for
`MOVE from SR` becoming privileged there. Nothing to implement.

`ANDI`/`ORI`/`EORI #imm,SR` (the privileged sibling of the now-implemented
`#imm,CCR` forms) is a genuine gap, but falls under the privileged group
above rather than this one — same reasoning as `MOVE to SR`. It doesn't
fail cleanly either: with no dedicated opcodeTable entry of its own, it
still reaches `ANDI`/`ORI`/`EORI`'s general form (their `<ea>` decode
treats the `#imm,SR` bit pattern as an ordinary, if strange, addressing
mode), which throws `decodeEA`'s generic immediate-write error rather
than raising a catchable
[Illegal Instruction exception](./MEMORY.md#cpu-exception-vector-table).
**Don't hand-encode `ANDI`/`ORI`/`EORI #imm,SR`** for this reason.

## Instruction Summary Table

| Category | Instructions |
|----------|--------------|
| Data Movement | MOVE, MOVEA, MOVEQ, MOVEM, MOVEP, MOVE SR, MOVE to CCR, LEA, PEA, SWAP, EXG |
| Arithmetic | ADD, ADDI, ADDX, ADDA, SUB, SUBI, SUBX, SUBA, ADDQ, SUBQ, MUL, DIV, CMP, CMPI, CMPM, CMPA, CLR, NEG, NEGX, TST, TAS, EXT |
| BCD | ABCD, SBCD, NBCD |
| Logical | AND, ANDI, OR, ORI, XOR, EORI, NOT |
| Bit | BTST, BCHG, BCLR, BSET |
| Shift/Rotate | ASL, ASR, LSL, LSR, ROL, ROR, ROXL, ROXR |
| Branches | BRA, JMP, BEQ, BNE, BLT, BLE, BGT, BGE, BHI, BLS, BCS, BCC, BVS, BVC, BPL, BMI, DBcc (DBRA/DBF, DBT, DBEQ, DBNE, ...), Scc (SEQ, SNE, ST, SF, ...), CHK |
| Subroutines | JSR, BSR, RTS, RTR, LINK, UNLK |
| System | TRAP, NOP, ILLEGAL, TRAPV |

## Alphabetical Index

Every mnemonic documented above, A-Z, linking back to its section. The
conditional `Bcc` variants (`BEQ`, `BNE`, ...) all share the one
[Conditional Branches](#conditional-branches) table, the conditional
`DBcc` variants (`DBEQ`, `DBNE`, ...) all share the one
[DBcc](#dbcc---decrement-and-branch-conditionally) section, and the
conditional `Scc` variants (`SEQ`, `SNE`, ...) all share the one
[Scc](#scc---set-conditionally) section, rather than having a section
each.

**A** — [ABCD](#abcd---add-decimal-with-extend) · [ADD](#add---add) · [ADDA](#adda---add-address) · [ADDI](#addi---add-immediate) · [ADDQ](#addqsubq---addsubtract-quick) · [ADDX](#addx---add-extended) · [AND](#and---bitwise-and) · [ANDI](#andi---and-immediate) · [ANDI to CCR](#andiorieori-to-ccr---combine-an-immediate-into-the-condition-codes) · [ASL](#aslasr---arithmetic-shift) · [ASR](#aslasr---arithmetic-shift)

**B** — [BCC](#conditional-branches) · [BCHG](#bchgbclrbset---changeclearset-bit) · [BCLR](#bchgbclrbset---changeclearset-bit) · [BCS](#conditional-branches) · [BEQ](#conditional-branches) · [BGE](#conditional-branches) · [BGT](#conditional-branches) · [BHI](#conditional-branches) · [BLE](#conditional-branches) · [BLS](#conditional-branches) · [BLT](#conditional-branches) · [BMI](#conditional-branches) · [BNE](#conditional-branches) · [BPL](#conditional-branches) · [BRA](#bra---branch-always) · [BSET](#bchgbclrbset---changeclearset-bit) · [BSR](#bsr---branch-to-subroutine) · [BTST](#btst---test-bit) · [BVC](#conditional-branches) · [BVS](#conditional-branches)

**C** — [CHK](#chk---check-register-against-bounds) · [CLR](#clr---clear) · [CMP](#cmp---compare) · [CMPA](#cmpa---compare-address) · [CMPI](#cmpi---compare-immediate) · [CMPM](#cmpm---compare-memory)

**D** — [DBCC](#dbcc---decrement-and-branch-conditionally) · [DBCS](#dbcc---decrement-and-branch-conditionally) · [DBEQ](#dbcc---decrement-and-branch-conditionally) · [DBGE](#dbcc---decrement-and-branch-conditionally) · [DBGT](#dbcc---decrement-and-branch-conditionally) · [DBHI](#dbcc---decrement-and-branch-conditionally) · [DBLE](#dbcc---decrement-and-branch-conditionally) · [DBLS](#dbcc---decrement-and-branch-conditionally) · [DBLT](#dbcc---decrement-and-branch-conditionally) · [DBMI](#dbcc---decrement-and-branch-conditionally) · [DBNE](#dbcc---decrement-and-branch-conditionally) · [DBPL](#dbcc---decrement-and-branch-conditionally) · [DBRA](#dbcc---decrement-and-branch-conditionally) · [DBT](#dbcc---decrement-and-branch-conditionally) · [DBVC](#dbcc---decrement-and-branch-conditionally) · [DBVS](#dbcc---decrement-and-branch-conditionally) · [DIVS](#div---divide) · [DIVU](#div---divide)

**E** — [EORI](#eori---exclusive-or-immediate) · [EORI to CCR](#andiorieori-to-ccr---combine-an-immediate-into-the-condition-codes) · [EXG](#exg---exchange-registers) · [EXT](#ext---sign-extend)

**I** — [ILLEGAL](#illegal---deliberately-raise-an-illegal-instruction)

**J** — [JMP](#jmp---jump) · [JSR](#jsr---jump-to-subroutine)

**L** — [LEA](#lea---load-effective-address) · [LINK](#link---link-and-allocate) · [LSL](#lsllsr---logical-shift) · [LSR](#lsllsr---logical-shift)

**M** — [MOVE](#move---move-data) · [MOVEA](#movea---move-address) · [MOVEM](#movem---move-multiple-registers) · [MOVEP](#movep---move-peripheral-data) · [MOVEQ](#moveq---move-quick) · [MOVE SR](#move-sr---read-the-status-register) · [MOVE to CCR](#move-to-ccr---load-the-condition-codes) · [MULS](#mul---multiply) · [MULU](#mul---multiply)

**N** — [NBCD](#nbcd---negate-decimal-with-extend) · [NEG](#neg---negate) · [NEGX](#negx---negate-extended) · [NOP](#nop---no-operation) · [NOT](#not---bitwise-not)

**O** — [OR](#or---bitwise-or) · [ORI](#ori---or-immediate) · [ORI to CCR](#andiorieori-to-ccr---combine-an-immediate-into-the-condition-codes)

**P** — [PEA](#pea---push-effective-address)

**R** — [ROL](#rolror---rotate) · [ROR](#rolror---rotate) · [ROXL](#roxlroxr---rotate-through-extend) · [ROXR](#roxlroxr---rotate-through-extend) · [RTR](#rtr---return-and-restore-condition-codes) · [RTS](#rts---return-from-subroutine)

**S** — [SBCD](#sbcd---subtract-decimal-with-extend) · [SCC](#scc---set-conditionally) · [SEQ](#scc---set-conditionally) · [SF](#scc---set-conditionally) · [SGE](#scc---set-conditionally) · [SGT](#scc---set-conditionally) · [SHI](#scc---set-conditionally) · [SLE](#scc---set-conditionally) · [SLS](#scc---set-conditionally) · [SLT](#scc---set-conditionally) · [SMI](#scc---set-conditionally) · [SNE](#scc---set-conditionally) · [SPL](#scc---set-conditionally) · [ST](#scc---set-conditionally) · [SUB](#sub---subtract) · [SUBA](#suba---subtract-address) · [SUBI](#subi---subtract-immediate) · [SUBQ](#addqsubq---addsubtract-quick) · [SUBX](#subx---subtract-extended) · [SVC](#scc---set-conditionally) · [SVS](#scc---set-conditionally) · [SWAP](#swap---swap-register-halves)

**T** — [TAS](#tas---test-and-set-an-operand) · [TRAP](#trap---software-trap) · [TRAPV](#trapv---trap-on-overflow) · [TST](#tst---test)

**U** — [UNLK](#unlk---unlink)

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
