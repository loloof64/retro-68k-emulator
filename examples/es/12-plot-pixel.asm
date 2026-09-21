; ============================================================
; 12 - Borrar la pantalla y dibujar un píxel
; TRAP #4 rellena la pantalla con D0; TRAP #3 escribe D0 en la dirección
; del framebuffer dada por A0, así que (x, y) debe convertirse antes en
; $40000 + (y * 320 + x) * 4.
; Resultado: pantalla azul con un píxel blanco en (50, 10).
; ============================================================

        ORG     $2000

START:
        MOVE.L  #$0000FFFF,D0   ; azul opaco
        TRAP    #4              ; borra la pantalla

        MOVE.L  #10,D0          ; y
        MULU.W  #320,D0         ; y * 320
        ADD.L   #50,D0          ; + x
        ASL.L   #2,D0           ; * 4 bytes por píxel
        ADD.L   #$40000,D0      ; + base del framebuffer
        MOVE.L  D0,A0
        MOVE.L  #$FFFFFFFF,D0   ; blanco
        TRAP    #3              ; escribe el píxel

        TRAP    #0              ; fin del programa

        END     START
