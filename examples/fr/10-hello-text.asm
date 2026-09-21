; ============================================================
; 10 - Bonjour, texte
; TRAP #1 dessine la chaîne terminée par un zéro pointée par A0 au pixel
; (D0, D1) dans la couleur D2 (caractères 8x8).
; ============================================================

        ORG     $2000

START:
        LEA     HELLO,A0        ; A0 = la chaîne
        MOVEQ   #10,D0          ; x = 10
        MOVEQ   #10,D1          ; y = 10
        MOVE.L  #$FFFFFFFF,D2   ; blanc
        TRAP    #1

        LEA     WORLD,A0
        MOVEQ   #10,D0
        MOVEQ   #24,D1          ; deux lignes de 8 pixels plus bas
        MOVE.L  #$FFFF00FF,D2   ; jaune
        TRAP    #1

        TRAP    #0              ; fin du programme

HELLO:
        DC.B    "Hello 68K!",0  ; l'octet 0 termine la chaîne
WORLD:
        DC.B    "Retro fantasy console",0

        END     START
