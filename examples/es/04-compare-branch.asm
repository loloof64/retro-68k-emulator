; ============================================================
; 04 - Comparar y saltar
; Compara dos números y anota el resultado en D2:
; 1 = iguales, 2 = el primero es mayor, 3 = el primero es menor.
; Resultado: D2 = 2 (100 > 50).
; ============================================================

        ORG     $2000

START:
        MOVE.L  #100,D0         ; D0 = 100
        MOVE.L  #50,D1          ; D1 = 50

        ; calcula D0 - D1 y actualiza los indicadores, nada más
        CMP.L   D1,D0
        BEQ     EQUAL           ; Z activo: D0 = D1
        BGT     GREATER         ; D0 > D1 (con signo)

        MOVEQ   #3,D2           ; si no, D0 < D1
        BRA     DONE

EQUAL:
        MOVEQ   #1,D2
        BRA     DONE

GREATER:
        MOVEQ   #2,D2

DONE:
        TRAP    #0              ; fin del programa

        END     START
