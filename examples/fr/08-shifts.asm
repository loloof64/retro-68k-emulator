; ============================================================
; 08 - Décalages et rotations
; Un décalage de n multiplie (gauche) ou divise (droite) par 2^n.
; Résultats : D0 = 640, D1 = -4 ($FFFFFFFC), D2 = $3FFFFFFC.
; ============================================================

        ORG     $2000

START:
        MOVEQ   #10,D0
        ASL.L   #3,D0           ; 10 * 8 = 80
        ASR.L   #1,D0           ; 80 / 2 = 40
        ; rotation à gauche de 4 bits : 40 * 16 = 640
        ROL.L   #4,D0

        ; Le décalage arithmétique conserve le signe, le logique non.
        MOVEQ   #-16,D1
        ; -16 / 4 = -4 (le bit de signe est recopié)
        ASR.L   #2,D1
        MOVEQ   #-16,D2
        LSR.L   #2,D2           ; des zéros entrent : $3FFFFFFC

        TRAP    #0              ; fin du programme

        END     START
