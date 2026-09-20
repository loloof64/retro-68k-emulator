; ============================================================
; 06 - Subroutine
; JSR pushes the return address on the stack (A7) and jumps;
; RTS pops it and comes back.
; Result: D0 = 144 (12 squared).
; ============================================================

        ORG     $2000

START:
        MOVEQ   #12,D0          ; argument in D0
        JSR     SQUARE          ; call the subroutine
        TRAP    #0              ; exit (D0 = 144)

SQUARE:
        MULU.W  D0,D0           ; D0 = D0 * D0
        RTS                     ; back to the instruction after JSR

        END     START
