; ============================================================
; 01 - Addition
; Additionne deux nombres et range le résultat en mémoire.
; Résultat : D0 = 150, et le mot long à $3000 = 150.
; ============================================================

        ORG     $2000           ; le programme commence à $2000

START:
        MOVE.L  #50,D0          ; D0 = 50
        MOVE.L  #100,D1         ; D1 = 100
        ADD.L   D1,D0           ; D0 = D0 + D1 = 150

        MOVE.L  #$3000,A0       ; A0 = adresse mémoire $3000
        ; range D0 à l'adresse contenue dans A0
        MOVE.L  D0,(A0)

        TRAP    #0              ; fin du programme

        END     START
