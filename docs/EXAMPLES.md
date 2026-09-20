# Examples

> **Outdated.** The verified, runnable examples are the files in
> `examples/` (also presented in the user guide, `docs/user/EXAMPLES.md`).
> The programs below predate the real CPU and contain known bugs.

Practical examples for learning 68000 assembly with the Retro 68K Emulator.

## Example 1: Simple Addition

Add two numbers and store the result:

```asm
        ORG     $1000           ; Program starts at $1000

START:
        MOVE.L  #50,D0          ; D0 = 50
        MOVE.L  #100,D1         ; D1 = 100
        ADD.L   D1,D0           ; D0 = D0 + D1 = 150
        
        ; Store result in memory
        MOVE.L  #$2000,A0       ; A0 = memory address $2000
        MOVE.L  D0,(A0)         ; Memory[$2000] = 150
        
        TRAP    #0              ; Exit
        
        END     START
```

**What happens**:
1. Load 50 into D0
2. Load 100 into D1
3. Add D1 to D0
4. Store result at memory address $2000
5. Exit

## Example 2: Factorial Calculation

Calculate 5! using a loop:

```asm
        ORG     $1000

START:
        MOVE.L  #5,D0           ; N = 5
        MOVE.L  #1,D1           ; Result = 1
        
LOOP:
        MULU.W  D0,D1           ; Result *= N
        SUB.L   #1,D0           ; N--
        DBRA    D0,LOOP         ; Repeat if N > 0
        
        ; D1 now contains 5! = 120
        TRAP    #0
        
        END     START
```

**What happens**:
1. Set N=5, Result=1
2. Loop: multiply Result by N, decrement N
3. Continue until N=0
4. Final result: D1 = 120

**DBRA instruction**:
- Decrements D0
- If D0 ≠ -1, branches to LOOP
- If D0 = -1, continues to next instruction

## Example 3: Drawing on Screen

Fill part of the LCD screen with white pixels:

```asm
        ORG     $1000

START:
        MOVE.L  #$40000,A0      ; A0 = framebuffer base
        MOVE.L  #$FFFFFF,D7     ; D7 = white color
        MOVE.L  #100,D0         ; Counter = 100
        
LOOP:
        MOVE.L  D7,(A0)+        ; Write pixel, A0++
        DBRA    D0,LOOP         ; Repeat 100 times
        
        TRAP    #0
        
        END     START
```

**What happens**:
1. Set framebuffer base address
2. Set color to white
3. Write 100 pixels, auto-incrementing address
4. Each MOVE.L writes 32 bits (1 pixel)

## Example 4: Conditional Branching

Compare two numbers and branch:

```asm
        ORG     $1000

START:
        MOVE.L  #100,D0         ; D0 = 100
        MOVE.L  #50,D1          ; D1 = 50
        
        CMP.L   D1,D0           ; Compare D0 with D1
        BEQ     EQUAL           ; Branch if equal
        BGT     GREATER         ; Branch if D0 > D1
        BLT     LESS            ; Branch if D0 < D1
        
EQUAL:
        ; Code if D0 == D1
        MOVEQ   #1,D2
        BRA     END_COMP
        
GREATER:
        ; Code if D0 > D1
        MOVEQ   #2,D2
        BRA     END_COMP
        
LESS:
        ; Code if D0 < D1
        MOVEQ   #3,D2
        
END_COMP:
        ; D2 contains: 1=equal, 2=greater, 3=less
        TRAP    #0
        
        END     START
```

**Flags after CMP**:
- Z=1 if values equal
- N=1 if result negative
- C=1 if underflow

## Example 5: Array Sum

Sum an array of numbers:

```asm
        ORG     $1000

        ; Data section
DATA:
        ORG     $2000
ARRAY:
        DC.L    10              ; Array element 0
        DC.L    20              ; Array element 1
        DC.L    30              ; Array element 2
        DC.L    40              ; Array element 3
        DC.L    50              ; Array element 4
        
        END_ARRAY:

CODE:
        ORG     $1000
START:
        MOVE.L  #ARRAY,A0       ; A0 = array start
        MOVE.L  #0,D0           ; D0 = sum = 0
        MOVE.L  #5,D1           ; D1 = count = 5
        
LOOP:
        ADD.L   (A0)+,D0        ; D0 += *A0++
        DBRA    D1,LOOP         ; Repeat 5 times
        
        ; D0 now contains sum = 150
        TRAP    #0
        
        END     START
```

**Key technique**: Post-increment addressing `(A0)+`
- Reads from address in A0
- Automatically increments A0 by 4 (long) after access

## Example 6: Subroutine Call

Define and call a subroutine:

```asm
        ORG     $1000

START:
        MOVE.L  #12,D0          ; Argument = 12
        JSR     SQUARE          ; Call SQUARE
        ; D0 now contains 144
        
        TRAP    #0
        
; ============= SUBROUTINE =============
SQUARE:
        MULU.W  D0,D0           ; D0 = D0 * D0
        RTS                     ; Return from subroutine
        
        END     START
```

**JSR/RTS mechanism**:
1. JSR pushes return address (PC) onto stack
2. Subroutine executes with A7 updated
3. RTS pops return address back to PC
4. Execution continues after JSR

## Example 7: Bitwise Operations

Manipulate individual bits:

```asm
        ORG     $1000

START:
        MOVE.L  #$FF00FF00,D0   ; Pattern: 1111111100000000...
        
        AND.L   #$0F0F0F0F,D0   ; Mask low nibbles
        ; D0 = $0F000F00
        
        OR.L    #$00FF00FF,D0   ; Set low bytes
        ; D0 = $0FFFFFFF
        
        XOR.L   #$F0F0F0F0,D0   ; Invert alternate nibbles
        ; D0 = $F00F0F0F
        
        NOT.L   D0              ; Bitwise NOT
        ; D0 = $0FF0F0F0
        
        TRAP    #0
        
        END     START
```

## Example 8: Shift Operations

Multiply/divide using shifts:

```asm
        ORG     $1000

START:
        MOVE.L  #10,D0          ; D0 = 10
        
        ASL.L   #3,D0           ; D0 <<= 3 (multiply by 8)
        ; D0 = 80
        
        ASR.L   #1,D0           ; D0 >>= 1 (divide by 2)
        ; D0 = 40
        
        ROL.L   #4,D0           ; Rotate left by 4 bits
        
        ; For example:
        ; Binary of 40: 00000000 00000000 00000000 00101000
        ; After ROL #4: 00000000 00000000 00101000 00000000
        
        TRAP    #0
        
        END     START
```

**Shift speeds**:
- ASL/LSL: Multiply by 2^n
- ASR/LSR: Divide by 2^n
- Faster than MUL/DIV instructions

## Example 9: Screen Clear Pattern

Draw a checkerboard pattern:

```asm
        ORG     $1000

START:
        MOVE.L  #$40000,A0      ; Framebuffer base
        MOVE.L  #10000,D0       ; 10000 pixels
        MOVE.L  #0,D1           ; Counter
        
LOOP:
        MOVE.L  D1,D2
        LSRL    #1,D2           ; D2 = D1 >> 1
        AND.L   #1,D2           ; D2 &= 1
        
        BEQ     BLACK
        
        ; White pixel
        MOVE.L  #$FFFFFF,(A0)+
        BRA     NEXT
        
BLACK:
        ; Black pixel
        MOVE.L  #$000000,(A0)+
        
NEXT:
        ADD.L   #1,D1
        CMP.L   #10000,D1
        BLT     LOOP
        
        TRAP    #0
        
        END     START
```

## Example 10: String Output

Print a string using TRAP #1:

```asm
        ORG     $1000

START:
        LEA     MESSAGE,A0      ; Load effective address
        TRAP    #1              ; Print string
        
        TRAP    #0              ; Exit
        
        ; Data section
        ORG     $2000
MESSAGE:
        DC.B    "Hello 68K!",0  ; Null-terminated string
        
        END     START
```

**Note**: TRAP #1 requires A0 to point to null-terminated string.

## Tips for Assembly Programming

1. **Always initialize registers** before use
2. **Label important addresses** for clarity
3. **Use comments** liberally
4. **Test small pieces** before combining
5. **Check flags** after arithmetic operations
6. **Save/restore registers** in subroutines
7. **Use meaningful labels** (LOOP1, END_CHECK, etc.)

## Debugging Techniques

1. **Single-step** with the debugger
2. **Watch registers** to see changes
3. **Add intermediate MOVEs** to inspect values
4. **Use breakpoints** at key locations
5. **Monitor memory** for data corruption

---

See [Opcode Reference](./OPCODES.md) for instruction details.
