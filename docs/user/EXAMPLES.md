# Example Programs

Fifteen small, complete programs to read, paste into the editor and run. Each one lives as a file in the `examples/` folder of the repository (`en`, `fr`, `es` subfolders) and can be loaded from the "Load an example" list above the editor, and each is assembled and executed by the project's automated tests, so they are known to work.

To try one, copy its code into the editor, then press **Run** (or **Step** to follow it instruction by instruction). New to assembly? Read them in order: each builds on the ones before. Instruction details are in the [Reference](./REFERENCE.md).

## Example 1: Adding two numbers

The smallest useful program: put two numbers in *data registers* (`D0`–`D7`, the CPU's eight general-purpose 32-bit variables), add them, and store the result in memory. `A0` is an *address register*: `(A0)` means "the memory at the address held in `A0`".

File: `examples/en/01-addition.asm`

```asm
        ORG     $2000           ; program starts at $2000

START:
        MOVE.L  #50,D0          ; D0 = 50
        MOVE.L  #100,D1         ; D1 = 100
        ADD.L   D1,D0           ; D0 = D0 + D1 = 150

        MOVE.L  #$3000,A0       ; A0 = memory address $3000
        ; store D0 at the address held in A0
        MOVE.L  D0,(A0)

        TRAP    #0              ; exit

        END     START
```

**Result:** `D0` = 150, and the long word at `$3000` is 150.

## Example 2: Factorial with a loop

The 68000 has no loop instruction: a loop is a *label* (a name for an address) plus a *branch* back to it. `SUBQ` sets the Zero flag when the counter reaches 0, and `BNE` ("branch if not equal to zero") keeps looping until then.

File: `examples/en/02-factorial.asm`

```asm
        ORG     $2000

START:
        MOVEQ   #5,D0           ; N = 5
        MOVEQ   #1,D1           ; result = 1

LOOP:
        ; result = result * N (16 x 16 -> 32 bits)
        MULU.W  D0,D1
        ; N = N - 1 (sets the Z flag when N reaches 0)
        SUBQ.L  #1,D0
        BNE     LOOP            ; not zero yet: go round again

        TRAP    #0              ; exit (D1 = 120)

        END     START
```

**Result:** `D1` = 120.

## Example 3: Drawing a line

The screen is memory: the framebuffer starts at `$40000` and each pixel is one long word, `$RRGGBBAA`. `(A0)+` writes at `A0` and then moves `A0` on by 4 bytes (*post-increment*). `DBRA` decrements its register and branches until it reaches -1, so a counter of `N - 1` runs the body `N` times.

File: `examples/en/03-draw-line.asm`

```asm
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
```

**Result:** 100 white pixels along the top of the screen.

## Example 4: Comparing and branching

`CMP` subtracts without storing the result; it only sets the flags, which the following `Bcc` (conditional branch) instructions test. See [Which Bcc do I want?](#which-bcc-do-i-want) in the reference.

File: `examples/en/04-compare-branch.asm`

```asm
        ORG     $2000

START:
        MOVE.L  #100,D0         ; D0 = 100
        MOVE.L  #50,D1          ; D1 = 50

        ; computes D0 - D1 and sets the flags, nothing else
        CMP.L   D1,D0
        BEQ     EQUAL           ; Z set: D0 = D1
        BGT     GREATER         ; signed D0 > D1

        MOVEQ   #3,D2           ; otherwise D0 < D1
        BRA     DONE

EQUAL:
        MOVEQ   #1,D2
        BRA     DONE

GREATER:
        MOVEQ   #2,D2

DONE:
        TRAP    #0              ; exit

        END     START
```

**Result:** `D2` = 2, because 100 is greater than 50.

## Example 5: Summing an array

`DC.L` reserves data in the program itself, and `LEA` (load effective address) puts the address of a label in an address register. With `(A0)+`, each `ADD` reads one element and steps to the next.

File: `examples/en/05-array-sum.asm`

```asm
        ORG     $2000

START:
        ; A0 = address of the first element
        LEA     ARRAY,A0
        MOVEQ   #0,D0           ; sum = 0
        MOVEQ   #4,D1           ; DBRA runs D1+1 = 5 times

LOOP:
        ADD.L   (A0)+,D0        ; sum += element, then A0 += 4
        DBRA    D1,LOOP

        TRAP    #0              ; exit

ARRAY:
        DC.L    10, 20, 30, 40, 50

        END     START
```

**Result:** `D0` = 150.

## Example 6: Calling a subroutine

`JSR` pushes the *return address* onto the stack (pointed to by `A7`) and jumps to the label; `RTS` pops it and resumes just after the `JSR`. Here the argument and the result both travel in `D0`, a common convention.

File: `examples/en/06-subroutine.asm`

```asm
        ORG     $2000

START:
        MOVEQ   #12,D0          ; argument in D0
        JSR     SQUARE          ; call the subroutine
        TRAP    #0              ; exit (D0 = 144)

SQUARE:
        MULU.W  D0,D0           ; D0 = D0 * D0
        ; back to the instruction after the JSR
        RTS

        END     START
```

**Result:** `D0` = 144.

## Example 7: Bitwise operations

`AND` keeps only the bits set in the mask, `OR` forces bits on, `EOR` (exclusive or) flips them, `NOT` inverts everything. Hex digits map to four bits each, so the results can be checked by hand.

File: `examples/en/07-bitwise.asm`

```asm
        ORG     $2000

START:
        MOVE.L  #$FF00FF00,D0

        AND.L   #$0F0F0F0F,D0   ; keep the low nibbles: $0F000F00
        ; force the low bytes on: $0FFF0FFF
        OR.L    #$00FF00FF,D0
        MOVE.L  #$F0F0F0F0,D1
        EOR.L   D1,D0           ; flip the high nibbles: $FF0FFF0F
        NOT.L   D0              ; invert every bit: $00F000F0

        TRAP    #0              ; exit

        END     START
```

**Result:** `D0` = `$00F000F0`.

## Example 8: Shifts and rotates

Shifting left by `n` multiplies by 2^n, shifting right divides. `ASR` (arithmetic) copies the sign bit in, so negative numbers stay negative; `LSR` (logical) shifts in zeros. `ROL` rotates: bits pushed out on the left come back in on the right.

File: `examples/en/08-shifts.asm`

```asm
        ORG     $2000

START:
        MOVEQ   #10,D0
        ASL.L   #3,D0           ; 10 * 8 = 80
        ASR.L   #1,D0           ; 80 / 2 = 40
        ; rotate left by 4 bits: 40 * 16 = 640
        ROL.L   #4,D0

        ; Arithmetic shift keeps the sign, logical shift does not.
        MOVEQ   #-16,D1
        ; -16 / 4 = -4 (the sign bit is copied in)
        ASR.L   #2,D1
        MOVEQ   #-16,D2
        LSR.L   #2,D2           ; zeros shifted in: $3FFFFFFC

        TRAP    #0              ; exit

        END     START
```

**Result:** `D0` = 640, `D1` = -4, `D2` = `$3FFFFFFC`.

## Example 9: Checkerboard

Two nested loops: 200 rows of 320 pixels. `NOT.L` flips the pixel color between opaque white and 0, which the screen shows as black. Because a row has an even number of pixels, one extra `NOT` per row is what makes it a checkerboard rather than stripes. It runs about 190,000 instructions, so pick a high speed in the debugger.

File: `examples/en/09-checkerboard.asm`

```asm
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
```

**Result:** The whole screen covered by a black and white checkerboard.

## Example 10: Printing text

`TRAP #1` draws a null-terminated string (bytes followed by a `0`): `A0` points to it, `D0`/`D1` are the x/y pixel, `D2` is the color. See [Printing Text with TRAP #1](#printing-text-with-trap-1).

File: `examples/en/10-hello-text.asm`

```asm
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
```

**Result:** "Hello 68K!" in white and a second line in yellow.

## Example 11: Reading the gamepad

`TRAP #5` loads the button bitmask into `D0`; `BTST #n,Dn` sets the Zero flag when bit `n` is 0, so `BEQ` skips the code when the button is *not* held. `TRAP #4` overwrites `D0`, so the buttons are first copied to `D1`. The screen is only cleared when the color changes, to keep the loop cheap. See [Reading the Gamepad](#reading-the-gamepad).

File: `examples/en/11-gamepad.asm`

```asm
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
```

**Result:** Hold A for a red screen, B for green; press Start to quit.

## Example 12: Clearing the screen and plotting a pixel

`TRAP #4` fills the screen with `D0`. `TRAP #3` takes a byte address in `A0`, not x/y, so the program computes `$40000 + (y * 320 + x) * 4` first. See [Addressing a Pixel for TRAP #2/#3](#addressing-a-pixel-for-trap-23).

File: `examples/en/12-plot-pixel.asm`

```asm
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
```

**Result:** A blue screen with one white pixel at (50, 10).

## Example 13: Playing a scale

`TRAP #6` plays one tone: `D0` = frequency (Hz), `D1` = duration (ms), `D2` = volume (0-255), `D3` = waveform (0 square, 1 sine, 2 triangle, 3 sawtooth, 4 noise). The CPU does not wait for a tone to end and a new tone cuts the previous one, so the program counts down in a loop between notes — a "loop" here is just a label and a backward `DBRA`. The delay depends on the debugger speed (about 250 ms at 2000 instr/(1/60 s)). See [Reference](./REFERENCE.md) for the sound registers.

File: `examples/en/13-sound.asm`

```asm
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
```

**Result:** The eight notes of a C major scale, then the program exits. Sound only starts after you press **Run** or **Step**.

## Example 14: Handling division by zero

`DIVU`/`DIVS` don't crash on a zero divisor: they raise the *Zero Divide exception* instead, jumping to a handler routine whose address the program installed beforehand at address `$40` (its *vector*, a fixed memory slot the CPU reads when the fault happens). A handler ends with `RTS`, which resumes execution right after the `DIVU` that faulted — see [Exceptions](./REFERENCE.md#exceptions) for the full mechanism and the other three vectors (`Illegal Instruction`, `CHK`, `TRAPV`).

File: `examples/en/14-zero-divide.asm`

```asm
        ORG     $2000

START:
        MOVEA.L #$40,A0         ; A0 -> Zero Divide vector
        MOVE.L  #HANDLER,(A0)   ; install the handler

        MOVE.L  #100,D0         ; D0 = 100
        MOVE.W  #5,D1           ; D1 = 5
        DIVU.W  D1,D0           ; D0 = 20 (100 / 5)

        MOVE.L  #100,D0         ; D0 = 100 again
        MOVE.W  #0,D1           ; D1 = 0 -> triggers the fault
        DIVU.W  D1,D0           ; jumps to HANDLER instead

        TRAP    #0              ; exit (HANDLER's RTS lands here)

HANDLER:
        MOVEQ   #-1,D0          ; sentinel: division failed
        RTS                     ; resume right after DIVU

        END     START
```

**Result:** `D0` = 20 after the first, valid division, then `D0` = -1 (`$FFFFFFFF`) after the handler catches the second, zero-divide one.

## Example 15: Reading the keyboard

`TRAP #8` pops one typed character into `D0` (`0` if none is pending) — see [Reading the Keyboard with TRAP #8](./REFERENCE.md#reading-the-keyboard-with-trap-8). This program polls it in a loop, storing each character into a buffer and redrawing the growing string with `TRAP #1` after every key, until 10 characters have been typed. Only visible ASCII and accented characters are recognized; other keys (Enter, Backspace, arrows...) are silently ignored, as always with `TRAP #8`.

File: `examples/en/15-keyboard-input.asm`

```asm
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
```

**Result:** type up to 10 characters and watch the string grow on screen; the program exits (halts) once the 10th one lands.
