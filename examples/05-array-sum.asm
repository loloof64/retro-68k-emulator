; ============================================================
; 05 - Array sum
; Adds up five long words stored after the code.
; Result: D0 = 150.
; ============================================================

        ORG     $2000

START:
        LEA     ARRAY,A0        ; A0 = address of the first element
        MOVEQ   #0,D0           ; sum = 0
        MOVEQ   #4,D1           ; DBRA runs D1+1 = 5 times

LOOP:
        ADD.L   (A0)+,D0        ; sum += element, then A0 += 4
        DBRA    D1,LOOP

        TRAP    #0              ; exit

ARRAY:
        DC.L    10, 20, 30, 40, 50

        END     START
