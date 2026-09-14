; ============================================================
; Exemple simple : Calcul et affichage écran
; ============================================================

        ORG     $1000           ; Origine du programme

; Constantes
SCREEN_BASE EQU $40000         ; Adresse du framebuffer
EXIT_TRAP   EQU 0              ; Trap pour exit

START:
        ; Initialiser les registres
        MOVE.L  #0,D0           ; D0 = 0 (compteur)
        MOVE.L  #10,D1          ; D1 = 10 (limite)
        MOVE.L  #SCREEN_BASE,A0 ; A0 = adresse écran
        
        ; Boucle
LOOP:
        ; D0 = D0 + 1
        ADD.L   #1,D0
        
        ; Écrire pixel blanc
        MOVE.L  #$FFFFFF,(A0)+  ; Écrire et incrémenter A0
        
        ; Comparer D0 avec D1
        CMP.L   D1,D0
        BNE     LOOP            ; Si pas égal, continuer
        
        ; Terminer
        TRAP    #0              ; Exit

        END     START
