; ============================================================
; 13 - Tocar una escala
; TRAP #6 toca una nota: D0 = frecuencia (Hz), D1 = duración
; (ms), D2 = volumen (0-255), D3 = forma de onda (0 = cuadrada,
; 1 = seno, 2 = triángulo, 3 = diente de sierra, 4 = ruido).
; La CPU no espera a que termine una nota, y una nota nueva
; corta la anterior, así que un bucle de cuenta atrás espera entre
; las notas (unos 250 ms con 2000 instr/(1/60 s) por defecto; una velocidad
; más lenta o más rápida lo alarga o lo acorta).
; Resultado: escala de do mayor, y luego fin.
; ============================================================

        ORG     $2000

START:
        LEA     NOTES,A0        ; A0 -> primera frecuencia
        MOVE.W  #7,D5           ; 8 notas, DBRA cuenta hasta -1

NEXT:
        MOVE.W  (A0)+,D0        ; frecuencia, luego A0 avanza
        MOVE.W  #250,D1         ; 250 ms
        MOVE.B  #200,D2         ; volumen
        MOVE.B  #1,D3           ; onda senoidal
        TRAP    #6              ; la toca

        MOVE.W  #30000,D4       ; espera: un DBRA por vuelta
WAIT:
        DBRA    D4,WAIT
        DBRA    D5,NEXT         ; nota siguiente

        TRAP    #0              ; fin del programa

NOTES:  DC.W    262,294,330,349,392,440,494,523

        END     START
