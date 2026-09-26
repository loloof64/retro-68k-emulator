# Example Programs

This chapter documents each of the 16 built-in example programs available in the Debugger's "Load an example" dropdown. Each example demonstrates a specific feature or technique.

## 16 - Subroutine with Stack Parameters

Demonstrates calling a subroutine that receives parameters via the stack and returns a result in a register. A critical pattern for building larger programs.

```asm
; Routine: add two words and return a long.
; Stack layout after JSR:
;   [A7+0] = return PC (4 bytes, DON'T read this!)
;   [A7+4] = word1 (first parameter)
;   [A7+6] = word2 (second parameter)
; Return value: D0 (long result).
add_words:
        MOVE.W  4(A7), D0        ; D0 = word1 (skip return address)
        MOVE.W  6(A7), D1        ; D1 = word2
        ADD.L   D1, D0           ; D0 = word1 + word2
        RTS                      ; return to caller

START:
        ; push parameters in reverse order
        MOVE.W  #10, -(A7)       ; push 10 (word2)
        MOVE.W  #5, -(A7)        ; push 5 (word1)
        JSR     add_words        ; D0 = 5 + 10 = 15

        TRAP    #0               ; exit

        END     START
```

**Key concept:** When `JSR` executes, it automatically pushes a 4-byte return address onto the stack. Inside the routine, parameters are offset by 4: `4(A7)` is the first parameter, `6(A7)` is the second, etc. Always account for the return address when reading from the stack.
