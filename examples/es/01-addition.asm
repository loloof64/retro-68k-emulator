; ============================================================
; 01 - Suma
; Suma dos números y guarda el resultado en memoria.
; Resultado: D0 = 150, y la palabra larga en $3000 = 150.
; ============================================================

        ORG     $2000           ; el programa empieza en $2000

START:
        MOVE.L  #50,D0          ; D0 = 50
        MOVE.L  #100,D1         ; D1 = 100
        ADD.L   D1,D0           ; D0 = D0 + D1 = 150

        MOVE.L  #$3000,A0       ; A0 = dirección de memoria $3000
        ; guarda D0 en la dirección contenida en A0
        MOVE.L  D0,(A0)

        TRAP    #0              ; fin del programa

        END     START
