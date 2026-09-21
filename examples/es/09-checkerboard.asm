; ============================================================
; 09 - Tablero de ajedrez
; Rellena toda la pantalla 320x200 con píxeles alternos blancos y
; negros. NOT.L alterna $FFFFFFFF <-> $00000000 (la pantalla
; siempre muestra los píxeles opacos, así que 0 se ve negro).
; 320 píxeles por fila es par, así que un NOT extra por fila desplaza
; el patrón y convierte las rayas en un tablero.
; Consejo: sube la velocidad, esto ejecuta ~190.000 instrucciones.
; ============================================================

        ORG     $2000

START:
        MOVE.L  #$40000,A0      ; base del framebuffer
        MOVE.L  #$FFFFFFFF,D1   ; color actual
        MOVE.W  #199,D2         ; 200 filas

ROW:
        MOVE.W  #319,D3         ; 320 píxeles por fila

PIXEL:
        MOVE.L  D1,(A0)+        ; escribe un píxel
        NOT.L   D1              ; siguiente píxel: el otro color
        DBRA    D3,PIXEL

        ; desplaza el patrón para la fila siguiente
        NOT.L   D1
        DBRA    D2,ROW

        TRAP    #0              ; fin del programa

        END     START
