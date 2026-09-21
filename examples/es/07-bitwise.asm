; ============================================================
; 07 - Operaciones bit a bit
; Resultado: D0 = $00F000F0 tras los cuatro pasos siguientes.
; ============================================================

        ORG     $2000

START:
        MOVE.L  #$FF00FF00,D0

        AND.L   #$0F0F0F0F,D0   ; conserva los nibbles bajos: $0F000F00
        ; fuerza a 1 los bytes bajos: $0FFF0FFF
        OR.L    #$00FF00FF,D0
        MOVE.L  #$F0F0F0F0,D1
        EOR.L   D1,D0           ; invierte los nibbles altos: $FF0FFF0F
        NOT.L   D0              ; invierte todos los bits: $00F000F0

        TRAP    #0              ; fin del programa

        END     START
