; ============================================================
; 02 - Factorial
; Calcula 5! = 5 * 4 * 3 * 2 * 1 con un bucle.
; Resultado: D1 = 120.
; Un bucle es solo una etiqueta y un salto de vuelta a ella.
; ============================================================

        ORG     $2000

START:
        MOVEQ   #5,D0           ; N = 5
        MOVEQ   #1,D1           ; resultado = 1

LOOP:
        ; resultado = resultado * N (16 x 16 -> 32 bits)
        MULU.W  D0,D1
        ; N = N - 1 (activa el indicador Z cuando N llega a 0)
        SUBQ.L  #1,D0
        BNE     LOOP            ; aún no es cero: otra vuelta

        TRAP    #0              ; fin del programa (D1 = 120)

        END     START
