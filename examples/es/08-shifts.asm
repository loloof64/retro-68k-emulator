; ============================================================
; 08 - Desplazamientos y rotaciones
; Un desplazamiento de n multiplica (izquierda) o divide (derecha) por 2^n.
; Resultados: D0 = 640, D1 = -4 ($FFFFFFFC), D2 = $3FFFFFFC.
; ============================================================

        ORG     $2000

START:
        MOVEQ   #10,D0
        ASL.L   #3,D0           ; 10 * 8 = 80
        ASR.L   #1,D0           ; 80 / 2 = 40
        ; rotación a la izquierda de 4 bits: 40 * 16 = 640
        ROL.L   #4,D0

        ; El desplazamiento aritmético conserva el signo, el lógico no.
        MOVEQ   #-16,D1
        ; -16 / 4 = -4 (se copia el bit de signo)
        ASR.L   #2,D1
        MOVEQ   #-16,D2
        LSR.L   #2,D2           ; entran ceros: $3FFFFFFC

        TRAP    #0              ; fin del programa

        END     START
