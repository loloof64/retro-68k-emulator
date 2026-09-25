# The Stack and Local Variables

Understanding the stack and how to manage local variables is critical for writing reliable 68000 assembly routines. This guide covers how the stack works, how to allocate local variables, and common pitfalls.

## The Stack Pointer (A7)

**A7 is the stack pointer** — it holds the memory address of the top of the stack. It is **not constant** during program execution; it changes with every instruction that accesses the stack.

### When Does A7 Change?

A7 decreases (moves to lower addresses) when you:
- Push data: `MOVE.W D0, -(A7)` or `PEA address`
- Allocate local space: `SUB.L #N, A7`
- Call a subroutine: `JSR routine` (pushes return address)

A7 increases (moves to higher addresses) when you:
- Pop data: `MOVE.W (A7)+, D0`
- Free local space: `ADD.L #N, A7`
- Return from a subroutine: `RTS` (pops return address)

### PC vs A7

**PC (Program Counter)** points to the current instruction being executed. It increments automatically as each instruction executes. You cannot directly read or write PC in normal code.

**A7 (Stack Pointer)** holds the address of stack data. You can read and write it explicitly, and it changes based on stack operations.

These are completely separate: PC determines *what* instruction runs next; A7 determines *where* temporary data lives.

## Allocating Local Variables

Instead of wasting registers, allocate space on the stack at the start of a routine.

### Simple Stack Frame

```asm
my_routine:     SUB.L #8, A7        ; allocate 8 bytes for local variables
                
                ; Now you have 8 bytes of local storage
                ; Access via negative offsets from A7:
                ;   -8(A7) = first local (4 bytes, if stored as .L)
                ;   -4(A7) = second local (4 bytes)
                
                MOVE.W D0, -4(A7)   ; store D0 into second local
                MOVE.W D1, -2(A7)   ; store D1 into second local + 2
                
                ; do work here
                
                MOVE.W -4(A7), D0   ; reload from local
                
                ADD.L #8, A7        ; free the 8 bytes
                RTS
```

**Critical rule:** The amount of space you allocate (`SUB.L #8, A7`) must match the amount you free (`ADD.L #8, A7`). Mismatches corrupt the stack and crash the program.

### Offset Calculation

If you allocate `N` bytes, you access them as:
- `-N(A7)` = oldest (lowest address)
- `-N+4(A7)` = one word back
- `-4(A7)` = newest (highest address, just before the old A7 value)

Example: allocate 12 bytes:
```asm
SUB.L #12, A7
MOVE.L D0, -12(A7)   ; word 0-3
MOVE.L D1, -8(A7)    ; word 4-7
MOVE.W D2, -4(A7)    ; word 8-9
```

## JSR and Offsets: Why They Still Work

When you call a subroutine from inside a routine that uses local variables, **the offsets remain valid** because `JSR` and `RTS` cancel each other out:

```asm
my_routine:     SUB.L #4, A7        ; A7 decrements by 4
                MOVE.W D0, -4(A7)   ; local variable
                
                JSR helper          ; A7 decrements (pushes return address)
                                    ; helper runs
                                    ; RTS: A7 increments (pops return address)
                
                MOVE.W -4(A7), D0   ; -4(A7) still valid! A7 is back to its original level
                
                ADD.L #4, A7
                RTS
```

**However:** if you do *other* stack operations between allocating locals and calling a subroutine, the offsets shift and break. Avoid mixing arbitrary stack operations with locals allocated via `SUB.L`.

## Frame Pointers (LINK and UNLK)

For complex routines with multiple subroutine calls, use a **frame pointer** to keep offsets stable regardless of A7's state. A6 is conventionally used as the frame pointer.

### Using LINK and UNLK

```asm
my_routine:     LINK A6, #-12       ; A6 = frame pointer, allocate 12 bytes
                                    ; A6 now points to the start of locals
                
                ; Access locals via A6 (never via A7):
                MOVE.W D0, -12(A6)  ; local 0
                MOVE.W D1, -8(A6)   ; local 1
                MOVE.W D2, -4(A6)   ; local 2
                
                JSR helper          ; safe: A6 doesn't change
                
                MOVE.W -12(A6), D0  ; still valid
                
                UNLK A6             ; restore A6 and A7, free locals
                RTS
```

**How it works:**
- `LINK A6, #-N`: Save the old A6 on the stack, set A6 to point to that saved A6, then allocate N bytes
- `UNLK A6`: Restore A6 and free all locals (reverse of LINK)

**Advantages:**
- Offsets relative to A6 never shift, even if you do arbitrary stack operations
- A7 is free to be modified by subroutines you call
- More robust for complex routines

**Cost:** Two extra instructions (LINK and UNLK) per routine.

## When to Use What

| Situation | Solution |
|-----------|----------|
| Simple routine, no calls to other routines | Use `SUB.L`/`ADD.L` with negative offsets from A7 |
| Need 1–2 temporary values, no calls | Use spare registers (D4, D5, D6) instead |
| Complex routine with many calls | Use `LINK`/`UNLK` with A6 frame pointer |
| Need to save/restore registers across a call | Save them on stack with `MOVE.W D0, -(A7)` and restore with `MOVE.W (A7)+, D0` |

## Common Mistakes

### Mistake 1: Forgetting to Free the Stack

```asm
my_routine:     SUB.L #4, A7
                MOVE.W D0, -4(A7)
                ; ... code ...
                RTS                 ; BUG! Forgot ADD.L #4, A7
```

Result: `RTS` pops the wrong return address and the program crashes or jumps to random code.

### Mistake 2: Changing the Number of Bytes

```asm
my_routine:     SUB.L #4, A7        ; allocate 4 bytes
                MOVE.W D0, -8(A7)   ; access 8 bytes (wrong!)
```

Result: You read/write outside your allocated space, corrupting the return address or other stack data.

### Mistake 3: Using A7 Offsets After Arbitrary Stack Changes

```asm
my_routine:     SUB.L #4, A7
                MOVE.W D0, -4(A7)
                PUSH D1             ; oops, A7 shifts
                MOVE.W -4(A7), D0   ; BUG! -4(A7) no longer points to your local
```

Solution: Either avoid the extra stack operations, or use `LINK`/`UNLK` to stabilize offsets via A6.

### Mistake 4: Mixing Caller and Callee Responsibility

68000 calling conventions are not strict, but a common convention is:
- **Caller saves** D0–D7 and A0–A5 if they need the values after the call
- **Callee saves** A6 and A7 (and restores them before returning)

If a called routine overwrites D0, and you need D0 afterward, push it before calling and pop it after:

```asm
my_routine:     MOVE.W D0, -(A7)    ; caller saves D0
                JSR other_routine   ; D0 might be destroyed here
                MOVE.W (A7)+, D0    ; restore D0
```

## Example: Proper Local Variables

Here's a complete, correct routine:

```asm
add_three_values:   SUB.L #12, A7       ; allocate 3 words (6 bytes)
                                        ; but SUB.L always moves by multiples of 4,
                                        ; so allocate 12 bytes for safety
                    
                    MOVE.W D0, -4(A7)   ; local_0 = first value
                    MOVE.W D1, -6(A7)   ; local_1 = second value
                    MOVE.W D2, -8(A7)   ; local_2 = third value
                    
                    ; sum = local_0 + local_1
                    MOVE.W -4(A7), D3
                    ADD.W -6(A7), D3
                    
                    ; sum += local_2
                    ADD.W -8(A7), D3
                    
                    ; D3 now holds the sum
                    ; return via D0
                    MOVE.W D3, D0
                    
                    ADD.L #12, A7       ; free locals (MUST match SUB.L)
                    RTS
```

## Summary

- **A7 is the stack pointer** and changes with every stack operation
- **Allocate locals** with `SUB.L #N, A7` and free with `ADD.L #N, A7`
- **Access locals** via negative offsets: `-4(A7)`, `-8(A7)`, etc.
- **JSR/RTS pairs are transparent** — offsets survive them
- **For complex routines**, use `LINK A6, #-N` and `UNLK A6` to stabilize offsets via a frame pointer
- **Always free what you allocate** — mismatches crash the program
