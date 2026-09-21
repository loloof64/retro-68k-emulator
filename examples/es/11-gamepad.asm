; ============================================================
; 11 - Leer el mando
; TRAP #5 pone la máscara de botones en D0 (bit 0 = A, 1 = B,
; 8 = Start). La pantalla es negra; mantén A para rojo, B para verde,
; pulsa Start para salir. Funciona con el mando en pantalla o uno real.
; ============================================================

        ORG     $2000

START:
        ; color actual en pantalla (ninguno todavía)
        MOVEQ   #0,D2

LOOP:
        TRAP    #5              ; D0 = botones
        MOVE.L  D0,D1           ; los guarda: TRAP #4 necesitará D0
        MOVE.L  #$000000FF,D0   ; color por defecto: negro

        ; ¿botón A pulsado? (Z = 1 cuando el bit es 0)
        BTST    #0,D1
        BEQ     NOT_A
        MOVE.L  #$FF0000FF,D0   ; rojo
NOT_A:
        BTST    #1,D1           ; ¿botón B pulsado?
        BEQ     NOT_B
        MOVE.L  #$00FF00FF,D0   ; verde
NOT_B:
        CMP.L   D2,D0           ; ¿ya se muestra este color?
        BEQ     SAME
        MOVE.L  D0,D2
        ; borra la pantalla con D0 (solo si cambió el color)
        TRAP    #4
SAME:
        BTST    #8,D1           ; ¿Start pulsado?
        BEQ     LOOP
        TRAP    #0              ; fin del programa

        END     START
