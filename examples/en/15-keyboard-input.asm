; ============================================================
; 15 - Reading the keyboard
; TRAP #8 pops one typed character into D0 (0 if none pending).
; This builds a short string from what you type - up to 10
; characters - redrawing it with TRAP #1 after every key, then
; exits once the buffer is full. Only visible ASCII and accented
; characters are recognized (see the Reference).
; ============================================================

        ORG     $2000

MAXLEN  EQU     10

START:
        LEA     BUFFER,A1       ; A1 = next free byte
        MOVEQ   #0,D3           ; D3 = characters typed so far

POLL:
        TRAP    #8              ; D0 = next key (0 = none)
        TST.B   D0
        BEQ     POLL            ; nothing typed yet - keep polling

        MOVE.B  D0,(A1)+        ; store the character, advance
        CLR.B   (A1)            ; keep the string null-terminated
        ADDQ.L  #1,D3

        LEA     BUFFER,A0       ; A0 = the string so far
        MOVEQ   #10,D0          ; x
        MOVEQ   #10,D1          ; y
        MOVE.L  #$FFFFFFFF,D2   ; white
        TRAP    #1

        CMPI.L  #MAXLEN,D3
        BLT     POLL            ; keep going until MAXLEN chars

        TRAP    #0              ; exit once the buffer is full

BUFFER: DS.B    MAXLEN+1        ; +1 for the null terminator

        END     START
