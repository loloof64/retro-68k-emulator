; ============================================================
; 12 - Clear the screen and plot a pixel
; TRAP #4 fills the screen with D0; TRAP #3 writes D0 to the
; framebuffer address in A0, so (x, y) must be turned into
; $40000 + (y * 320 + x) * 4 first.
; Result: blue screen with a white pixel at (50, 10).
; ============================================================

        ORG     $2000

START:
        MOVE.L  #$0000FFFF,D0   ; opaque blue
        TRAP    #4              ; clear the screen

        MOVE.L  #10,D0          ; y
        MULU.W  #320,D0         ; y * 320
        ADD.L   #50,D0          ; + x
        ASL.L   #2,D0           ; * 4 bytes per pixel
        ADD.L   #$40000,D0      ; + framebuffer base
        MOVE.L  D0,A0
        MOVE.L  #$FFFFFFFF,D0   ; white
        TRAP    #3              ; write the pixel

        TRAP    #0              ; exit

        END     START
