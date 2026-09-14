# Quick Reference Card

## Basic Instruction Set

### Movement (4 cycles)
```
MOVE    src,dst      Move data
MOVEA   src,An       Move to address register
MOVEQ   #n,Dn        Move quick (8-bit)
```

### Arithmetic (4-6 cycles)
```
ADD     src,dst      Add
SUB     src,dst      Subtract
MULU    src,Dn       Unsigned multiply
DIVS    src,Dn       Signed divide
CMP     src,dst      Compare
```

### Logical (4-6 cycles)
```
AND     src,dst      Bitwise AND
OR      src,dst      Bitwise OR
XOR     src,dst      Bitwise XOR
NOT     dst          Bitwise NOT
```

### Shifts/Rotates (6+ cycles)
```
ASL #n,Dn   Arithmetic shift left
ASR #n,Dn   Arithmetic shift right
LSL #n,Dn   Logical shift left
LSR #n,Dn   Logical shift right
ROL #n,Dn   Rotate left
ROR #n,Dn   Rotate right
```

### Branches (8-10 cycles)
```
BRA     label       Branch always
BEQ     label       Branch if equal
BNE     label       Branch if not equal
BLT     label       Branch if less than
BGT     label       Branch if greater than
BGE     label       Branch if greater/equal
BLE     label       Branch if less/equal
DBRA    Dn,label    Decrement and branch
```

### Subroutines (16-18 cycles)
```
JSR     label       Jump to subroutine
BSR     label       Branch to subroutine
RTS                 Return from subroutine
```

### System (34 cycles)
```
TRAP    #n          Software trap
NOP                 No operation
```

## Registers

**Data Registers**: D0, D1, D2, D3, D4, D5, D6, D7 (32-bit)  
**Address Registers**: A0, A1, A2, A3, A4, A5, A6, A7 (32-bit)  
**Special**: A7 = Stack Pointer (SP)

## Flags (Set by CMP, arithmetic ops)

| Flag | Meaning | When Set |
|------|---------|----------|
| N | Negative | Result < 0 |
| Z | Zero | Result = 0 |
| V | Overflow | Signed overflow |
| C | Carry | Unsigned carry |
| X | Extend | Multiply/divide carry |

## Sizes

- `.B` = Byte (8-bit)
- `.W` = Word (16-bit) [default]
- `.L` = Long (32-bit)

## Common Addressing Modes

| Mode | Syntax | Example |
|------|--------|---------|
| Immediate | `#value` | `MOVE.L #100,D0` |
| Register | `Dn, An` | `ADD.L D1,D0` |
| Indirect | `(An)` | `MOVE.L (A0),D1` |
| Post-inc | `(An)+` | `MOVE.L (A0)+,D1` |
| Pre-dec | `-(An)` | `MOVE.L -(A0),D1` |
| Address | `$addr` | `MOVE.L $1000,D0` |

## Memory Map

```
$00000-$01FFF    8 KB     System area
$02000-$3FFFF    56 KB    User RAM
$40000-$5FFFF    128 KB   Framebuffer (320×200)
```

## TRAP Numbers

- **TRAP #0**: Exit program
- **TRAP #1**: Print string (A0 = pointer)
- **TRAP #2**: Read pixel from framebuffer
- **TRAP #3**: Write pixel to framebuffer  
- **TRAP #4**: Clear screen

## Program Template

```asm
        ORG     $1000           ; Program origin

START:
        ; Your code here
        
        TRAP    #0              ; Exit
        
        END     START
```

## Quick Tips

1. **Use MOVEQ** for -128 to 127 values (faster)
2. **Use shifts** instead of multiply/divide by powers of 2
3. **Use DBRA** for loops, not BRA
4. **Always TRAP #0** to exit cleanly
5. **Check flags** after CMP before branching
6. **Use A7** carefully (it's the stack pointer)

## Common Patterns

### Simple Loop
```asm
MOVE.L  #10,D0          ; Counter = 10
LOOP:
  ; Code to repeat
  DBRA    D0,LOOP
```

### Subroutine Call
```asm
JSR     MY_FUNC
; Code continues here

MY_FUNC:
  ; Do work
  RTS                   ; Return
```

### Conditional Execution
```asm
CMP.L   D1,D0
BEQ     IF_EQUAL
  ; Not equal code
  BRA     END_IF
IF_EQUAL:
  ; Equal code
END_IF:
```

### Array Access
```asm
MOVE.L  #ARRAY,A0       ; A0 = array pointer
MOVE.L  (A0)+,D0        ; D0 = array[0], A0++
MOVE.L  (A0)+,D0        ; D0 = array[1], A0++
```

---

**Print this card for quick reference while coding!**
