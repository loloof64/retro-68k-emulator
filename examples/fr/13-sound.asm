; ============================================================
; 13 - Jouer une gamme
; TRAP #6 joue une note : D0 = fréquence (Hz), D1 = durée
; (ms), D2 = volume (0-255), D3 = forme d'onde (0 = carré,
; 1 = sinus, 2 = triangle, 3 = dent de scie, 4 = bruit).
; Le CPU n'attend pas la fin d'une note, et une nouvelle note
; coupe la précédente, donc une boucle de compte à rebours attend entre
; les notes (environ 250 ms à 2000 instr/(1/60 s) par défaut ; une vitesse
; plus lente ou plus rapide l'allonge ou la raccourcit).
; Résultat : gamme de do majeur, puis fin.
; ============================================================

        ORG     $2000

START:
        LEA     NOTES,A0        ; A0 -> première fréquence
        MOVE.W  #7,D5           ; 8 notes, DBRA compte jusqu'à -1

NEXT:
        MOVE.W  (A0)+,D0        ; fréquence, puis A0 avance
        MOVE.W  #250,D1         ; 250 ms
        MOVE.B  #200,D2         ; volume
        MOVE.B  #1,D3           ; onde sinusoïdale
        TRAP    #6              ; la joue

        MOVE.W  #30000,D4       ; attente : un DBRA par tour
WAIT:
        DBRA    D4,WAIT
        DBRA    D5,NEXT         ; note suivante

        TRAP    #0              ; fin du programme

NOTES:  DC.W    262,294,330,349,392,440,494,523

        END     START
