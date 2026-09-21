; ============================================================
; 09 - Damier
; Remplit tout l'écran 320x200 de pixels alternativement blancs et
; noirs. NOT.L bascule $FFFFFFFF <-> $00000000 (l'écran
; affiche toujours les pixels opaques, donc 0 paraît noir).
; 320 pixels par ligne est pair, donc un NOT de plus par ligne décale
; le motif et transforme les rayures en damier.
; Astuce : augmentez la vitesse, cela exécute ~190 000 instructions.
; ============================================================

        ORG     $2000

START:
        MOVE.L  #$40000,A0      ; base du framebuffer
        MOVE.L  #$FFFFFFFF,D1   ; couleur courante
        MOVE.W  #199,D2         ; 200 lignes

ROW:
        MOVE.W  #319,D3         ; 320 pixels par ligne

PIXEL:
        MOVE.L  D1,(A0)+        ; écrit un pixel
        NOT.L   D1              ; pixel suivant : l'autre couleur
        DBRA    D3,PIXEL

        ; décale le motif pour la ligne suivante
        NOT.L   D1
        DBRA    D2,ROW

        TRAP    #0              ; fin du programme

        END     START
