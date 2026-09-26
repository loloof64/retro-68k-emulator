; ============================================================
; 16 - Subrutina con parámetros en pila
; Llama una rutina que suma dos palabras desde la pila.
; Resultado : D0 = 15 (0x0000000F como long).
; ============================================================

        ORG     $2000

; Rutina : suma dos palabras y devuelve un long.
; Parámetros en pila : word2 en 6(A7), word1 en 4(A7).
; Valor retornado : D0 (resultado long).
add_words:
        MOVE.W  4(A7), D0        ; D0 = word1
        MOVE.W  6(A7), D1        ; D1 = word2
        ADD.L   D1, D0           ; D0 = word1 + word2
        RTS                      ; volver al llamador

START:
        ; empuja los parámetros en orden inverso
        MOVE.W  #10, -(A7)       ; empuja 10 (word2)
        MOVE.W  #5, -(A7)        ; empuja 5 (word1)
        JSR     add_words        ; D0 = 5 + 10 = 15

        TRAP    #0               ; terminar

        END     START
