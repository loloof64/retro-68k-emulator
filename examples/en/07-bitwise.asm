; ============================================================
; 07 - Bitwise operations
; Result: D0 = $00F000F0 after the four steps below.
; ============================================================

        ORG     $2000

START:
        MOVE.L  #$FF00FF00,D0

        AND.L   #$0F0F0F0F,D0   ; keep the low nibbles: $0F000F00
        ; force the low bytes on: $0FFF0FFF
        OR.L    #$00FF00FF,D0
        MOVE.L  #$F0F0F0F0,D1
        EOR.L   D1,D0           ; flip the high nibbles: $FF0FFF0F
        NOT.L   D0              ; invert every bit: $00F000F0

        TRAP    #0              ; exit

        END     START
