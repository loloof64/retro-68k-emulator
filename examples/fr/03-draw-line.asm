; ============================================================
; 03 - Tracer une ligne
; Écrit 100 pixels blancs en haut à gauche de l'écran.
; Le framebuffer commence à $40000 ; chaque pixel est un mot long
; ($RRGGBBAA), donc (A0)+ passe d'un pixel au suivant.
; ============================================================

        ORG     $2000

START:
        MOVE.L  #$40000,A0      ; A0 = base du framebuffer
        MOVE.L  #$FFFFFFFF,D7   ; D7 = blanc opaque
        MOVE.W  #99,D0          ; DBRA exécute le corps D0+1 fois

LOOP:
        MOVE.L  D7,(A0)+        ; écrit un pixel, puis A0 += 4
        ; D0 -= 1, puis boucle jusqu'à D0 = -1 (100 tours)
        DBRA    D0,LOOP

        TRAP    #0              ; fin du programme

        END     START
