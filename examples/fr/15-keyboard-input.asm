; ============================================================
; 15 - Lire le clavier
; TRAP #8 dépile un caractère tapé dans D0 (0 si rien en
; attente). Construit une chaîne avec ce que vous tapez (10
; caractères max), redessinée avec TRAP #1 après chaque
; touche, puis quitte une fois le buffer plein. Seuls les
; caractères ASCII visibles et accentués sont reconnus.
; ============================================================

        ORG     $2000

MAXLEN  EQU     10

START:
        LEA     BUFFER,A1       ; A1 = prochain octet libre
        MOVEQ   #0,D3           ; D3 = nb de caractères tapés

POLL:
        TRAP    #8              ; D0 = touche suivante (0 = rien)
        TST.B   D0
        BEQ     POLL            ; rien tapé encore - on continue

        MOVE.B  D0,(A1)+        ; stocke le caractère, avance
        CLR.B   (A1)            ; garde la chaîne terminée par 0
        ADDQ.L  #1,D3

        LEA     BUFFER,A0       ; A0 = la chaîne pour l'instant
        MOVEQ   #10,D0          ; x
        MOVEQ   #10,D1          ; y
        MOVE.L  #$FFFFFFFF,D2   ; blanc
        TRAP    #1

        CMPI.L  #MAXLEN,D3
        BLT     POLL            ; continue jusqu'à MAXLEN

        TRAP    #0              ; quitte une fois le buffer plein

BUFFER: DS.B    MAXLEN+1        ; +1 pour l'octet de fin (0)

        END     START
