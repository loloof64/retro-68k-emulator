; ============================================================
; 06 - Sous-programme
; JSR empile l'adresse de retour sur la pile (A7) et saute ;
; RTS la dépile et revient.
; Résultat : D0 = 144 (12 au carré).
; ============================================================

        ORG     $2000

START:
        MOVEQ   #12,D0          ; argument dans D0
        JSR     SQUARE          ; appelle le sous-programme
        TRAP    #0              ; fin du programme (D0 = 144)

SQUARE:
        MULU.W  D0,D0           ; D0 = D0 * D0
        ; retour à l'instruction après le JSR
        RTS

        END     START
