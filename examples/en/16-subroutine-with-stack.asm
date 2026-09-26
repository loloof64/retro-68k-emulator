; ============================================================
; 16 - Subroutine with stack parameters
; Calls a routine that adds two words from the stack.
; Result: D0 = 15 (0x0000000F as a long).
; ============================================================

        ORG     $2000

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
