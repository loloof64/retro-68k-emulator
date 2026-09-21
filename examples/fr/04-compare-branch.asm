; ============================================================
; 04 - Comparer et brancher
; Compare deux nombres et note le résultat dans D2 :
; 1 = égaux, 2 = le premier est plus grand, 3 = le premier est plus petit.
; Résultat : D2 = 2 (100 > 50).
; ============================================================

        ORG     $2000

START:
        MOVE.L  #100,D0         ; D0 = 100
        MOVE.L  #50,D1          ; D1 = 50

        ; calcule D0 - D1 et positionne les drapeaux, rien d'autre
        CMP.L   D1,D0
        BEQ     EQUAL           ; Z à 1 : D0 = D1
        BGT     GREATER         ; D0 > D1 (signé)

        MOVEQ   #3,D2           ; sinon D0 < D1
        BRA     DONE

EQUAL:
        MOVEQ   #1,D2
        BRA     DONE

GREATER:
        MOVEQ   #2,D2

DONE:
        TRAP    #0              ; fin du programme

        END     START
