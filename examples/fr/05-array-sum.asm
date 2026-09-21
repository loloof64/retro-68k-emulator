; ============================================================
; 05 - Somme d'un tableau
; Additionne cinq mots longs stockés après le code.
; Résultat : D0 = 150.
; ============================================================

        ORG     $2000

START:
        ; A0 = adresse du premier élément
        LEA     ARRAY,A0
        MOVEQ   #0,D0           ; somme = 0
        MOVEQ   #4,D1           ; DBRA s'exécute D1+1 = 5 fois

LOOP:
        ADD.L   (A0)+,D0        ; somme += élément, puis A0 += 4
        DBRA    D1,LOOP

        TRAP    #0              ; fin du programme

ARRAY:
        DC.L    10, 20, 30, 40, 50

        END     START
