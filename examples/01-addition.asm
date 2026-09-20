; ============================================================
; 01 - Addition
; Adds two numbers and stores the result in memory.
; Result: D0 = 150, and the long word at $3000 = 150.
; ============================================================

        ORG     $2000           ; program starts at $2000 (user RAM)

START:
        MOVE.L  #50,D0          ; D0 = 50
        MOVE.L  #100,D1         ; D1 = 100
        ADD.L   D1,D0           ; D0 = D0 + D1 = 150

        MOVE.L  #$3000,A0       ; A0 = memory address $3000
        MOVE.L  D0,(A0)         ; store D0 at the address held in A0

        TRAP    #0              ; exit

        END     START
