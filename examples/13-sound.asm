; ============================================================
; 13 - Play a scale
; TRAP #6 plays one tone: D0 = frequency (Hz), D1 = duration
; (ms), D2 = volume (0-255), D3 = waveform (0 = square,
; 1 = sine, 2 = triangle, 3 = sawtooth, 4 = noise).
; The CPU does not wait for a tone to finish, and a new tone
; cuts the previous one, so a countdown loop waits between
; notes (about 250 ms at the default 2000 instr/frame; slower
; or faster speeds stretch or shrink it).
; Result: C major scale, then exit.
; ============================================================

        ORG     $2000

START:
        LEA     NOTES,A0        ; A0 -> first frequency
        MOVE.W  #7,D5           ; 8 notes, DBRA counts down to -1

NEXT:
        MOVE.W  (A0)+,D0        ; frequency, then A0 moves on
        MOVE.W  #250,D1         ; 250 ms
        MOVE.B  #200,D2         ; volume
        MOVE.B  #1,D3           ; sine wave
        TRAP    #6              ; play it

        MOVE.W  #30000,D4       ; wait: one DBRA per pass
WAIT:
        DBRA    D4,WAIT
        DBRA    D5,NEXT         ; next note

        TRAP    #0              ; exit

NOTES:  DC.W    262,294,330,349,392,440,494,523

        END     START
