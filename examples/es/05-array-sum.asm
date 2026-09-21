; ============================================================
; 05 - Suma de un array
; Suma cinco palabras largas almacenadas tras el código.
; Resultado: D0 = 150.
; ============================================================

        ORG     $2000

START:
        ; A0 = dirección del primer elemento
        LEA     ARRAY,A0
        MOVEQ   #0,D0           ; suma = 0
        MOVEQ   #4,D1           ; DBRA se ejecuta D1+1 = 5 veces

LOOP:
        ADD.L   (A0)+,D0        ; suma += elemento, luego A0 += 4
        DBRA    D1,LOOP

        TRAP    #0              ; fin del programa

ARRAY:
        DC.L    10, 20, 30, 40, 50

        END     START
