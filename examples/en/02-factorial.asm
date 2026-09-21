; ============================================================
; 02 - Factorial
; Computes 5! = 5 * 4 * 3 * 2 * 1 with a loop.
; Result: D1 = 120.
; A loop is just a label plus a branch back to it.
; ============================================================

        ORG     $2000

START:
        MOVEQ   #5,D0           ; N = 5
        MOVEQ   #1,D1           ; result = 1

LOOP:
        ; result = result * N (16 x 16 -> 32 bits)
        MULU.W  D0,D1
        ; N = N - 1 (sets the Z flag when N reaches 0)
        SUBQ.L  #1,D0
        BNE     LOOP            ; not zero yet: go round again

        TRAP    #0              ; exit (D1 = 120)

        END     START
