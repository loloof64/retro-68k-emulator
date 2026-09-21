; ============================================================
; 04 - Compare and branch
; Compares two numbers and records the outcome in D2:
; 1 = equal, 2 = first is greater, 3 = first is smaller.
; Result: D2 = 2 (100 > 50).
; ============================================================

        ORG     $2000

START:
        MOVE.L  #100,D0         ; D0 = 100
        MOVE.L  #50,D1          ; D1 = 50

        ; computes D0 - D1 and sets the flags, nothing else
        CMP.L   D1,D0
        BEQ     EQUAL           ; Z set: D0 = D1
        BGT     GREATER         ; signed D0 > D1

        MOVEQ   #3,D2           ; otherwise D0 < D1
        BRA     DONE

EQUAL:
        MOVEQ   #1,D2
        BRA     DONE

GREATER:
        MOVEQ   #2,D2

DONE:
        TRAP    #0              ; exit

        END     START
