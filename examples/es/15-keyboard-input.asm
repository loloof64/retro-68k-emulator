; ============================================================
; 15 - Leer el teclado
; TRAP #8 extrae un carácter tecleado en D0 (0 si no hay
; ninguno pendiente). Construye una cadena con lo que
; escribes (máx. 10 caracteres), redibujada con TRAP #1 tras
; cada tecla, y sale al llenar el búfer. Solo se reconocen
; caracteres ASCII visibles y acentuados.
; ============================================================

        ORG     $2000

MAXLEN  EQU     10

START:
        LEA     BUFFER,A1       ; A1 = siguiente byte libre
        MOVEQ   #0,D3           ; D3 = nº de caracteres tecleados

POLL:
        TRAP    #8              ; D0 = siguiente tecla (0=ninguna)
        TST.B   D0
        BEQ     POLL            ; nada tecleado aún - sigue

        MOVE.B  D0,(A1)+        ; guarda el carácter, avanza
        CLR.B   (A1)            ; mantiene la cadena con fin en 0
        ADDQ.L  #1,D3

        LEA     BUFFER,A0       ; A0 = la cadena hasta ahora
        MOVEQ   #10,D0          ; x
        MOVEQ   #10,D1          ; y
        MOVE.L  #$FFFFFFFF,D2   ; blanco
        TRAP    #1

        CMPI.L  #MAXLEN,D3
        BLT     POLL            ; sigue hasta MAXLEN caracteres

        TRAP    #0              ; sale al llenar el búfer

BUFFER: DS.B    MAXLEN+1        ; +1 para el byte final (0)

        END     START
