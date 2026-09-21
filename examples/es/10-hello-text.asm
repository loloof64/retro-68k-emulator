; ============================================================
; 10 - Hola, texto
; TRAP #1 dibuja la cadena terminada en cero apuntada por A0 en el píxel
; (D0, D1) con el color D2 (caracteres 8x8).
; ============================================================

        ORG     $2000

START:
        LEA     HELLO,A0        ; A0 = la cadena
        MOVEQ   #10,D0          ; x = 10
        MOVEQ   #10,D1          ; y = 10
        MOVE.L  #$FFFFFFFF,D2   ; blanco
        TRAP    #1

        LEA     WORLD,A0
        MOVEQ   #10,D0
        MOVEQ   #24,D1          ; dos líneas de 8 píxeles más abajo
        MOVE.L  #$FFFF00FF,D2   ; amarillo
        TRAP    #1

        TRAP    #0              ; fin del programa

HELLO:
        DC.B    "Hello 68K!",0  ; el byte 0 termina la cadena
WORLD:
        DC.B    "Retro fantasy console",0

        END     START
