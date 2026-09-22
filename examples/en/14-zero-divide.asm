; ============================================================
; 14 - Division by zero
; DIVU/DIVS raise the Zero Divide exception on a zero divisor
; instead of crashing: install a handler's address at $40 (its
; vector) before it can happen, and the CPU jumps there. A
; handler ends with RTS (not RTE, see the Reference) and
; execution resumes right after the DIVU that faulted.
; Result: D0 = 20 (100/5), then D0 = -1 (the zero divide was
; caught), then exit.
; ============================================================

        ORG     $2000

START:
        MOVEA.L #$40,A0         ; A0 -> Zero Divide vector
        MOVE.L  #HANDLER,(A0)   ; install the handler

        MOVE.L  #100,D0         ; D0 = 100
        MOVE.W  #5,D1           ; D1 = 5
        DIVU.W  D1,D0           ; D0 = 20 (100 / 5)

        MOVE.L  #100,D0         ; D0 = 100 again
        MOVE.W  #0,D1           ; D1 = 0 -> triggers the fault
        DIVU.W  D1,D0           ; jumps to HANDLER instead

        TRAP    #0              ; exit (HANDLER's RTS resumes here)

HANDLER:
        MOVEQ   #-1,D0          ; sentinel: division failed
        RTS                     ; resume right after DIVU

        END     START
