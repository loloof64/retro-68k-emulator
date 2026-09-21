; ============================================================
; 02 - Factorielle
; Calcule 5! = 5 * 4 * 3 * 2 * 1 avec une boucle.
; Résultat : D1 = 120.
; Une boucle n'est qu'une étiquette et un branchement qui y revient.
; ============================================================

        ORG     $2000

START:
        MOVEQ   #5,D0           ; N = 5
        MOVEQ   #1,D1           ; résultat = 1

LOOP:
        ; résultat = résultat * N (16 x 16 -> 32 bits)
        MULU.W  D0,D1
        ; N = N - 1 (met le drapeau Z à 1 quand N atteint 0)
        SUBQ.L  #1,D0
        BNE     LOOP            ; pas encore zéro : on refait un tour

        TRAP    #0              ; fin du programme (D1 = 120)

        END     START
