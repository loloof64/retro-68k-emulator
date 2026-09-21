; ============================================================
; 11 - Lire la manette
; TRAP #5 place le masque des boutons dans D0 (bit 0 = A, 1 = B,
; 8 = Start). L'écran est noir ; maintenez A pour rouge, B pour vert,
; appuyez sur Start pour quitter. Fonctionne avec la manette à l'écran ou une vraie.
; ============================================================

        ORG     $2000

START:
        ; couleur actuellement à l'écran (aucune pour l'instant)
        MOVEQ   #0,D2

LOOP:
        TRAP    #5              ; D0 = boutons
        MOVE.L  D0,D1           ; les garde : TRAP #4 aura besoin de D0
        MOVE.L  #$000000FF,D0   ; couleur par défaut : noir

        ; bouton A enfoncé ? (Z = 1 quand le bit vaut 0)
        BTST    #0,D1
        BEQ     NOT_A
        MOVE.L  #$FF0000FF,D0   ; rouge
NOT_A:
        BTST    #1,D1           ; bouton B enfoncé ?
        BEQ     NOT_B
        MOVE.L  #$00FF00FF,D0   ; vert
NOT_B:
        CMP.L   D2,D0           ; déjà cette couleur à l'écran ?
        BEQ     SAME
        MOVE.L  D0,D2
        ; efface l'écran avec D0 (seulement si la couleur a changé)
        TRAP    #4
SAME:
        BTST    #8,D1           ; Start appuyé ?
        BEQ     LOOP
        TRAP    #0              ; fin du programme

        END     START
