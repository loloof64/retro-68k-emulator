; ============================================================
; 14 - Division par zéro
; DIVU/DIVS déclenchent l'exception Zero Divide si le diviseur
; est zéro, au lieu de planter : installez un gestionnaire à
; $40 (son vecteur) avant que ça arrive, et le CPU y sautera.
; Un gestionnaire se termine par RTS (pas RTE, voir la
; Référence) et l'exécution reprend juste après le DIVU fautif.
; Résultat : D0 = 20 (100/5), puis D0 = -1 (division par zéro
; interceptée), puis fin du programme.
; ============================================================

        ORG     $2000

START:
        MOVEA.L #$40,A0         ; A0 -> vecteur Zero Divide
        MOVE.L  #HANDLER,(A0)   ; installe le gestionnaire

        MOVE.L  #100,D0         ; D0 = 100
        MOVE.W  #5,D1           ; D1 = 5
        DIVU.W  D1,D0           ; D0 = 20 (100 / 5)

        MOVE.L  #100,D0         ; D0 = 100 à nouveau
        MOVE.W  #0,D1           ; D1 = 0 -> déclenche l'exception
        DIVU.W  D1,D0           ; saute vers HANDLER à la place

        TRAP    #0              ; fin (RTS de HANDLER revient ici)

HANDLER:
        MOVEQ   #-1,D0          ; sentinelle : division échouée
        RTS                     ; reprend juste après DIVU

        END     START
