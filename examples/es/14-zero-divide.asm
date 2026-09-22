; ============================================================
; 14 - División por cero
; DIVU/DIVS lanzan la excepción Zero Divide si el divisor es
; cero, en vez de fallar: instala un manejador en $40 (su
; vector) antes de que ocurra, y la CPU saltará allí. Un
; manejador termina con RTS (no RTE, ver la Referencia) y la
; ejecución continúa justo después del DIVU que falló.
; Resultado: D0 = 20 (100/5), luego D0 = -1 (división por cero
; capturada), luego fin del programa.
; ============================================================

        ORG     $2000

START:
        MOVEA.L #$40,A0         ; A0 -> vector Zero Divide
        MOVE.L  #HANDLER,(A0)   ; instala el manejador

        MOVE.L  #100,D0         ; D0 = 100
        MOVE.W  #5,D1           ; D1 = 5
        DIVU.W  D1,D0           ; D0 = 20 (100 / 5)

        MOVE.L  #100,D0         ; D0 = 100 de nuevo
        MOVE.W  #0,D1           ; D1 = 0 -> dispara la excepción
        DIVU.W  D1,D0           ; salta a HANDLER en su lugar

        TRAP    #0              ; fin (el RTS de HANDLER vuelve aquí)

HANDLER:
        MOVEQ   #-1,D0          ; centinela: división fallida
        RTS                     ; continúa justo después de DIVU

        END     START
