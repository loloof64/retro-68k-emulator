; ============================================================
; 03 - Draw a line
; Writes 100 white pixels at the top-left of the screen.
; The framebuffer starts at $40000; each pixel is one long word
; ($RRGGBBAA), so (A0)+ walks from one pixel to the next.
; ============================================================

        ORG     $2000

START:
        MOVE.L  #$40000,A0      ; A0 = framebuffer base
        MOVE.L  #$FFFFFFFF,D7   ; D7 = opaque white
        MOVE.W  #99,D0          ; DBRA runs the body D0+1 times

LOOP:
        MOVE.L  D7,(A0)+        ; write a pixel, then A0 += 4
        ; D0 -= 1, then loop until D0 = -1 (100 passes)
        DBRA    D0,LOOP

        TRAP    #0              ; exit

        END     START
