; ============================================================
; 10 - Hello, text
; TRAP #1 draws the null-terminated string at A0 at pixel
; (D0, D1) in the color D2 (8x8 characters).
; ============================================================

        ORG     $2000

START:
        LEA     HELLO,A0        ; A0 = the string
        MOVEQ   #10,D0          ; x = 10
        MOVEQ   #10,D1          ; y = 10
        MOVE.L  #$FFFFFFFF,D2   ; white
        TRAP    #1

        LEA     WORLD,A0
        MOVEQ   #10,D0
        MOVEQ   #24,D1          ; two 8-pixel lines further down
        MOVE.L  #$FFFF00FF,D2   ; yellow
        TRAP    #1

        TRAP    #0              ; exit

HELLO:
        DC.B    "Hello 68K!",0  ; the 0 byte ends the string
WORLD:
        DC.B    "Retro fantasy console",0

        END     START
