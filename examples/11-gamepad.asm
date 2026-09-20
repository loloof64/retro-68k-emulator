; ============================================================
; 11 - Reading the gamepad
; TRAP #5 puts the button bitmask in D0 (bit 0 = A, 1 = B,
; 8 = Start). The screen is black; hold A for red, B for green,
; press Start to quit. Works with the on-screen pad or a real one.
; ============================================================

        ORG     $2000

START:
        ; color currently on screen (none yet)
        MOVEQ   #0,D2

LOOP:
        TRAP    #5              ; D0 = buttons
        MOVE.L  D0,D1           ; keep them: TRAP #4 will need D0
        MOVE.L  #$000000FF,D0   ; default color: black

        ; button A held? (Z = 1 when the bit is 0)
        BTST    #0,D1
        BEQ     NOT_A
        MOVE.L  #$FF0000FF,D0   ; red
NOT_A:
        BTST    #1,D1           ; button B held?
        BEQ     NOT_B
        MOVE.L  #$00FF00FF,D0   ; green
NOT_B:
        CMP.L   D2,D0           ; already showing this color?
        BEQ     SAME
        MOVE.L  D0,D2
        ; clear the screen to D0 (only when the color changed)
        TRAP    #4
SAME:
        BTST    #8,D1           ; Start pressed?
        BEQ     LOOP
        TRAP    #0              ; exit

        END     START
