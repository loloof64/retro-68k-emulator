# Opcode Reference

Complete reference for Motorola 68000 instructions supported by the TI-89 Emulator.

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
| Address | `$addr` | `MOVE.L D0,$1000` | Direct memory address |
| Indexed | `$addr(An)` | `MOVE.L $1000(A0),D0` | Address + register offset |

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

Special MOVE for address registers. No flags updated.

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

Divides Dn by source. Result in Dn (quotient:remainder).

**Sizes**: W (source)
**Cycles**: 138 (DIVU), 158 (DIVS)
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

## Shift and Rotate Operations

### ASL/ASR - Arithmetic Shift
```
ASL #n,Dn     ; Shift left by n bits
ASR #n,Dn     ; Shift right by n bits
```

Arithmetic shifts preserve sign bit.

**Cycles**: 6 + 2*n
**Flags**: N, Z, V, C, X

**Examples**:
```asm
ASL #1,D0              ; D0 <<= 1 (multiply by 2)
ASR #2,D1              ; D1 >>= 2 (divide by 4, signed)
```

### LSL/LSR - Logical Shift
```
LSL #n,Dn     ; Shift left by n bits
LSR #n,Dn     ; Shift right by n bits
```

Logical shifts don't preserve sign.

**Cycles**: 6 + 2*n
**Flags**: N, Z, V (always 0), C, X

**Examples**:
```asm
LSL #3,D0              ; D0 <<= 3 (multiply by 8)
LSR #1,D1              ; D1 >>= 1 (unsigned divide by 2)
```

### ROL/ROR - Rotate
```
ROL #n,Dn     ; Rotate left
ROR #n,Dn     ; Rotate right
```

Rotates bits in a circular manner.

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

### DBRA - Decrement and Branch
```
DBRA Dn,label
```

Decrement Dn, branch if not -1.

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
| Data Movement | MOVE, MOVEA, MOVEQ |
| Arithmetic | ADD, SUB, MUL, DIV, CMP |
| Logical | AND, OR, XOR, NOT |
| Shift/Rotate | ASL, ASR, LSL, LSR, ROL, ROR |
| Branches | BRA, BEQ, BNE, BLT, BLE, BGT, BGE, BHI, BLS, BCS, BCC, BVS, BVC, BPL, BMI, DBRA |
| Subroutines | JSR, BSR, RTS |
| System | TRAP, NOP |

## TRAP Handlers

| TRAP # | Function | Description |
|--------|----------|-------------|
| 0 | Exit | Terminate program |
| 1 | Print String | Print null-terminated string to console |
| 2 | Read Pixel | Read pixel from framebuffer at (A0) |
| 3 | Write Pixel | Write pixel to framebuffer at (A0) |
| 4 | Clear Screen | Clear entire LCD screen |

---

For examples using these instructions, see [Examples](./EXAMPLES.md).
