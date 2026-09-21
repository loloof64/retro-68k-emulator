; ============================================================
; 07 - Opérations bit à bit
; Résultat : D0 = $00F000F0 après les quatre étapes ci-dessous.
; ============================================================

        ORG     $2000

START:
        MOVE.L  #$FF00FF00,D0

        AND.L   #$0F0F0F0F,D0   ; garde les quartets de poids faible : $0F000F00
        ; force les octets de poids faible à 1 : $0FFF0FFF
        OR.L    #$00FF00FF,D0
        MOVE.L  #$F0F0F0F0,D1
        EOR.L   D1,D0           ; inverse les quartets de poids fort : $FF0FFF0F
        NOT.L   D0              ; inverse tous les bits : $00F000F0

        TRAP    #0              ; fin du programme

        END     START
