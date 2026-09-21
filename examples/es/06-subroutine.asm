; ============================================================
; 06 - Subrutina
; JSR apila la dirección de retorno en la pila (A7) y salta;
; RTS la desapila y vuelve.
; Resultado: D0 = 144 (12 al cuadrado).
; ============================================================

        ORG     $2000

START:
        MOVEQ   #12,D0          ; argumento en D0
        JSR     SQUARE          ; llama a la subrutina
        TRAP    #0              ; fin del programa (D0 = 144)

SQUARE:
        MULU.W  D0,D0           ; D0 = D0 * D0
        ; vuelve a la instrucción tras el JSR
        RTS

        END     START
