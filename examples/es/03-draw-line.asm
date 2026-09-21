; ============================================================
; 03 - Dibujar una línea
; Escribe 100 píxeles blancos arriba a la izquierda de la pantalla.
; El framebuffer empieza en $40000; cada píxel es una palabra larga
; ($RRGGBBAA), así que (A0)+ pasa de un píxel al siguiente.
; ============================================================

        ORG     $2000

START:
        MOVE.L  #$40000,A0      ; A0 = base del framebuffer
        MOVE.L  #$FFFFFFFF,D7   ; D7 = blanco opaco
        MOVE.W  #99,D0          ; DBRA ejecuta el cuerpo D0+1 veces

LOOP:
        MOVE.L  D7,(A0)+        ; escribe un píxel, luego A0 += 4
        ; D0 -= 1, y repite hasta D0 = -1 (100 vueltas)
        DBRA    D0,LOOP

        TRAP    #0              ; fin del programa

        END     START
