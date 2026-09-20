; ============================================================
; 08 - Shifts and rotates
; A shift by n multiplies (left) or divides (right) by 2^n.
; Results: D0 = 640, D1 = -4 ($FFFFFFFC), D2 = $3FFFFFFC.
; ============================================================

        ORG     $2000

START:
        MOVEQ   #10,D0
        ASL.L   #3,D0           ; 10 * 8 = 80
        ASR.L   #1,D0           ; 80 / 2 = 40
        ROL.L   #4,D0           ; rotate left 4 bits: 40 * 16 = 640

        ; Arithmetic shift keeps the sign, logical shift does not.
        MOVEQ   #-16,D1
        ASR.L   #2,D1           ; -16 / 4 = -4 (sign bit copied in)
        MOVEQ   #-16,D2
        LSR.L   #2,D2           ; zeros shifted in: $3FFFFFFC

        TRAP    #0              ; exit

        END     START
