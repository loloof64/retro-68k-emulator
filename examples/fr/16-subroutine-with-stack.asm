; ============================================================
; 16 - Sous-routine avec paramètres sur pile
; Appelle une routine qui additionne deux words depuis la pile.
; Résultat : D0 = 15 (0x0000000F comme long).
; ============================================================

        ORG     $2000

; Routine : additionne deux words et retourne un long.
; Paramètres sur pile : word2 à 6(A7), word1 à 4(A7).
; Valeur retournée : D0 (résultat long).
add_words:
        MOVE.W  4(A7), D0        ; D0 = word1
        MOVE.W  6(A7), D1        ; D1 = word2
        ADD.L   D1, D0           ; D0 = word1 + word2
        RTS                      ; retourner à l'appelant

START:
        ; pousse les paramètres en ordre inverse
        MOVE.W  #10, -(A7)       ; pousse 10 (word2)
        MOVE.W  #5, -(A7)        ; pousse 5 (word1)
        JSR     add_words        ; D0 = 5 + 10 = 15

        TRAP    #0               ; terminer

        END     START
