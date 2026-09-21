; ============================================================
; 12 - Effacer l'écran et tracer un pixel
; TRAP #4 remplit l'écran avec D0 ; TRAP #3 écrit D0 à l'adresse du
; framebuffer donnée par A0, donc (x, y) doit d'abord devenir
; $40000 + (y * 320 + x) * 4.
; Résultat : écran bleu avec un pixel blanc en (50, 10).
; ============================================================

        ORG     $2000

START:
        MOVE.L  #$0000FFFF,D0   ; bleu opaque
        TRAP    #4              ; efface l'écran

        MOVE.L  #10,D0          ; y
        MULU.W  #320,D0         ; y * 320
        ADD.L   #50,D0          ; + x
        ASL.L   #2,D0           ; * 4 octets par pixel
        ADD.L   #$40000,D0      ; + base du framebuffer
        MOVE.L  D0,A0
        MOVE.L  #$FFFFFFFF,D0   ; blanc
        TRAP    #3              ; écrit le pixel

        TRAP    #0              ; fin du programme

        END     START
