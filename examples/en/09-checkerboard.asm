; ============================================================
; 09 - Checkerboard
; Fills the whole 320x200 screen with alternating white and
; black pixels. NOT.L flips $FFFFFFFF <-> $00000000 (the screen
; always shows pixels opaque, so 0 looks black).
; 320 pixels per row is even, so one extra NOT per row shifts
; the pattern and turns the stripes into a checkerboard.
; Tip: raise the speed selector, this runs ~190,000 instructions.
; ============================================================

        ORG     $2000

START:
        MOVE.L  #$40000,A0      ; framebuffer base
        MOVE.L  #$FFFFFFFF,D1   ; current color
        MOVE.W  #199,D2         ; 200 rows

ROW:
        MOVE.W  #319,D3         ; 320 pixels per row

PIXEL:
        MOVE.L  D1,(A0)+        ; write a pixel
        NOT.L   D1              ; next pixel: the other color
        DBRA    D3,PIXEL

        ; shift the pattern for the next row
        NOT.L   D1
        DBRA    D2,ROW

        TRAP    #0              ; exit

        END     START
