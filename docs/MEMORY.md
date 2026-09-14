# Memory Layout

Reference for the Retro 68K Emulator's memory organization.

## Memory Map

```
Address Range        Size       Purpose
──────────────────────────────────────────────────────
$00000-$01FFF         8 KB      System Area (vectors, TRAP handlers)
$02000-$3FFFF        248 KB     User RAM (program code & data)
$40000-$7E7FF       ~244 KB     Framebuffer (320×200 pixels, 32bpp)
$7E800-$7E803          4 B      Controller Input (button state)
$7E804-$7E80B          8 B      Sound (tone generator — layout only, not wired to audio yet)
```

320×200 pixels at 32 bits per pixel needs 250,000 bytes, not the 128KB a
flat `$40000-$5FFFF` range would give — the framebuffer is sized to fit
exactly, and the Controller Input and Sound registers sit right after it.

## System Area ($00000-$01FFF)

Reserved for interrupt vectors and system-level data:

```
$00000-$0003F    64 bytes   TRAP vector table (16 vectors x 4 bytes)
$00040-$00047     8 bytes   CPU exception vector table (2 vectors so far)
$00048-$01FFF    8 KB-72B   Reserved for future use
```

### TRAP Vector Table

`TRAP #n`'s vector number is a 4-bit field in the opcode itself
(`$4E40`-`$4E4F`), so `n` only ever ranges `0`-`15` — there's no `TRAP
#16` or higher to reserve space for. **This table describes the vector
layout conceptually; the current implementation dispatches each `TRAP #n`
directly (a small lookup by number in `src/cpu/opcodes.ts`'s
`trapHandlers`) rather than actually reading a handler address out of
memory at these offsets.** So writing your own address into, say, `$14`
does not change what `TRAP #5` does today.

```
Offset   TRAP #   Address
────────────────────────────
$00      0        Exit program
$04      1        Print string
$08      2        Read pixel
$0C      3        Write pixel
$10      4        Clear screen
$14      5        Read controller state
$18      6        Play tone
$1C-$3F  7-15     (reserved for future)
```

### CPU Exception Vector Table

Unlike the TRAP table above, this one is real: it's how the CPU signals a
fault it hits on its own (as opposed to a program explicitly calling
`TRAP #n`). Each vector is a 4-byte slot your program fills in with a
handler routine's address *before* the fault can happen; the CPU reads it
back and jumps there when it does.

Only genuinely reserved/invalid encodings and runtime faults raise one —
never an instruction or addressing mode this emulator simply hasn't
implemented yet, which would run fine on real 68000 hardware and has
nothing to do with its actual exception model.

```
Offset   Exception            Raised by
────────────────────────────────────────────────────────
$40      Zero Divide          DIVU / DIVS with a zero divisor
$44      Illegal Instruction  MOVE.B to An; BTST targeting An
```

Real 68000 hardware pushes the status register and PC onto a *supervisor*
stack on any exception, then jumps through the vector. This emulator has
no supervisor-mode/status-register concept at all, so raising an
exception only pushes PC — onto the one stack there is, A7 — exactly like
`JSR`. That means a handler routine should end with `RTS`, not the real
68000's `RTE`, to return to right after the instruction that faulted:

```asm
MOVEA.L #$40,A0           ; the Zero Divide vector
MOVE.L  #HANDLER,(A0)     ; install the handler
...
DIVU.W  D1,D0             ; if D1 is 0, jumps to HANDLER instead
; execution resumes here after HANDLER's RTS

HANDLER:
; handle the fault, e.g. TRAP #0 to just halt
RTS
```

*(`HANDLER:` is illustrative — there's no assembler yet, so its address has to be hand-encoded, same as every other label on this page.)*

If a program never writes a handler address into a vector and the fault
happens anyway, the emulator throws a JS error naming the missing vector
rather than jumping to address `$0` (which real hardware would actually
do, typically crashing into whatever garbage code happens to be there).

## User RAM ($02000-$3FFFF)

Program code and data space. Typically:

```
$02000-$027FF    2 KB      Stack (grows downward from $03FFF)
$02800-$3FFFF    226 KB    Heap & program data
```

### Stack Usage

- Stack Pointer (A7) points to the top of stack
- Grows downward (decreasing addresses)
- Each PUSH decrements A7
- Each POP increments A7

**Example**:
```asm
MOVE.L  D0,-(A7)    ; Push D0 (A7 -= 4)
MOVE.L  (A7)+,D0    ; Pop to D0 (A7 += 4)
```

## Framebuffer ($40000-$7E7FF)

Screen display memory for the 320×200 LCD.

### Layout

- **Resolution**: 320 × 200 pixels
- **Format**: 32-bit RGBA per pixel
- **Total Size**: 320 × 200 × 4 bytes = 250,000 bytes (~244 KB)
- **Actual Used**: occupies $40000-$7E7FF

### Pixel Storage

Each pixel occupies 4 bytes (32-bit):

```
Bits:   31-24      23-16      15-8       7-0
        ─────────────────────────────────────
        Alpha      Blue       Green      Red
```

Example 32-bit colors:

| Color | Hex Value | Notes |
|-------|-----------|-------|
| Black | `0x000000FF` | Red=0, Green=0, Blue=0, Alpha=255 |
| White | `0xFFFFFFFF` | Red=255, Green=255, Blue=255, Alpha=255 |
| Red | `0x0000FFFF` | Pure red |
| Green | `0x00FF00FF` | Pure green |
| Blue | `0xFF0000FF` | Pure blue |

### Calculating Pixel Address

To access pixel at (x, y):

```
offset = (y * 320 + x) * 4
address = $40000 + offset
```

**Example: Pixel at (50, 10)**

```
offset = (10 * 320 + 50) * 4 = 12,800
address = $40000 + $3200 = $43200
```

### Drawing Operations

**Write pixel**:
```asm
MOVE.L  #$40000,A0       ; Base address
MOVE.L  #50,D0           ; X coordinate
MOVE.L  #10,D1           ; Y coordinate
MOVE.L  #$FFFFFF,D2      ; White color

; Calculate offset: (y * 320 + x) * 4
MOVE.L  D1,D3
MULU.W  #320,D3          ; D3 = y * 320
ADD.L   D0,D3            ; D3 += x
ASL.L   #2,D3            ; D3 *= 4 (multiply by 4 bytes/pixel)

; Write pixel
MOVE.L  D2,(A0,D3)       ; Memory[A0 + D3] = color
```

**Read pixel**:
```asm
MOVE.L  #$40000,A0
; ... calculate offset in D3 ...
MOVE.L  (A0,D3),D0       ; D0 = pixel color
```

**Fill rectangle**:
```asm
; Fill 10x10 square starting at (x=50, y=10)
MOVE.L  #$40000,A0
MOVE.L  #$FFFFFF,D7      ; Color: white

MOVE.L  #10,D0           ; Width counter
LOOP_X:
  MOVE.L  #10,D1         ; Height counter
  
  LOOP_Y:
    ; Calculate offset...
    MOVE.L  D7,(A0,D3)
    DBRA    D1,LOOP_Y
    
  DBRA    D0,LOOP_X
```

## Controller Input ($7E800-$7E803)

A single 32-bit, read-oriented register holding the current gamepad button
state as a bitmask. It's live: the UI writes the current state into it
continuously (from the on-screen retro control pad, or from a real gamepad
once physical controller support is added — see [Presentation](./user/PRESENTATION.md)),
so a running program always sees the latest state just by reading the word.

### Button Bit Layout

```
Bit   Button
──────────────
0     A
1     B
2     X
3     Y
4     D-Pad Up
5     D-Pad Down
6     D-Pad Left
7     D-Pad Right
8     Start
9     Select
10-31 (reserved)
```

A bit is `1` while its button is held down, `0` otherwise.

### Reading Controller State

Either read the memory-mapped register directly, or use the `TRAP #5`
convenience wrapper, which does the same read and drops the result in D0:

```asm
; Direct memory-mapped read
MOVE.L  #$7E800,A0
MOVE.L  (A0),D0          ; D0 = current button state

; Equivalent, via TRAP
TRAP    #5               ; D0 = current button state
```

### Polling a Single Button

Use `BTST` to test one bit without disturbing the rest of the word — unlike
`AND`, it only affects the Z flag:

```asm
TRAP    #5                ; D0 = button state
BTST    #0,D0              ; test bit 0 (button A)
BEQ     A_NOT_PRESSED      ; Z=1 -> bit was clear
  ; ... button A is held ...
A_NOT_PRESSED:
```

### Writing to the Input Register

Like the rest of memory, writes to this region aren't blocked by the
emulator (see [Memory Protection](#memory-protection) below) — but a
program that writes here only overwrites the value until the next UI
update, so there's no reason to.

## Sound ($7E804-$7E80B)

**The registers and `TRAP #6` are wired up — actual audio output isn't
yet.** A program can set frequency/duration/volume/waveform and trigger
playback, and that state lands correctly in memory (tested), but no host
backend currently reads the trigger and calls the Web Audio API to make a
sound. That's the same relationship the framebuffer has to a real
screen redraw today, or the controller input has to a real gamepad —
the CPU-side contract is real, the host-side device isn't hooked up yet.

The design deliberately isn't a PCM sample buffer: 8 bytes (or even the
full ~250 KB the framebuffer gets) couldn't hold more than a few seconds
of digital audio, and it wouldn't fit the retro-console feel of the rest
of the emulator. Instead it's modeled as a single-voice tone generator —
the same idea as a PC speaker, or the piezo buzzer in a TI-89 — driven by
frequency, duration, volume, and waveform, the way period-accurate sound
chips like the SN76489 (Sega Master System / Genesis) work.

```
Offset  Field       Size  Purpose
──────────────────────────────────────────────────
+0      Frequency   word  Hz; 0 = silence
+2      Duration    word  milliseconds
+4      Volume      byte  0-255
+5      Waveform    byte  0=square 1=sine 2=triangle 3=sawtooth 4=noise
+6      Trigger     byte  nonzero after TRAP #6; a host backend would clear it once consumed
+7      (reserved)  byte  padding, keeps the region 8 bytes wide
```

### Playing a Tone

Either write the fields directly and set the trigger byte yourself, or use
`TRAP #6`, which does both in one step from D0-D3:

```asm
; Direct memory-mapped write (post-increment through the fields in order)
MOVE.L  #$7E804,A0
MOVE.W  #440,(A0)+         ; frequency = 440 Hz (A4)
MOVE.W  #250,(A0)+         ; duration = 250 ms
MOVE.B  #200,(A0)+         ; volume = 200
MOVE.B  #0,(A0)+           ; waveform = square
MOVE.B  #1,(A0)            ; trigger

; Equivalent, via TRAP
MOVE.W  #440,D0            ; frequency
MOVE.W  #250,D1            ; duration
MOVE.B  #200,D2            ; volume
MOVE.B  #0,D3              ; waveform (0 = square)
TRAP    #6
```

Both leave the registers set and the trigger byte `1` — nothing audible
happens yet, since no audio backend is wired to read them (see above).

## Memory Access Instructions

### Reading from Memory

```asm
MOVE.L  $40000,D0        ; Read long (4 bytes)
MOVE.W  $40000,D0        ; Read word (2 bytes)
MOVE.B  $40000,D0        ; Read byte (1 byte)

; Indirect addressing
MOVE.L  (A0),D0          ; Read from address in A0
MOVE.L  $1000(A0),D0     ; Read from A0 + $1000
```

### Writing to Memory

```asm
MOVE.L  D0,$40000        ; Write long
MOVE.W  D0,$40000        ; Write word
MOVE.B  D0,$40000        ; Write byte

; Indirect addressing
MOVE.L  D0,(A0)          ; Write to address in A0
MOVE.L  D0,(A0)+         ; Write and post-increment
MOVE.L  D0,-(A0)         ; Pre-decrement and write
```

## Stack Operations

The stack (A7) starts at `$03FFF` and grows downward.

### PUSH (pre-decrement)

```asm
MOVE.L  D0,-(A7)         ; A7 -= 4, then Memory[A7] = D0
```

### POP (post-increment)

```asm
MOVE.L  (A7)+,D0         ; D0 = Memory[A7], then A7 += 4
```

### Subroutine Call (JSR/BSR)

Return address is automatically pushed:

```asm
JSR     MY_FUNC
; At MY_FUNC, (A7) contains return address
RTS                      ; Pop return address to PC
```

## Memory Protection

Everything described on this page — system area, user RAM, framebuffer,
controller input — lives inside one plain `Uint8Array` owned by the
emulator, not in any memory your host machine actually uses for anything
else. A program running in the emulator cannot read or write your real
computer's memory: there's nothing to sandbox, because there's no bridge
from emulated address space to host address space to begin with. The
worst a buggy program can do is corrupt *its own* simulated RAM, which a
reset clears.

Within that simulated address space:
- **Out-of-bounds accesses are caught**: reading or writing an address
  outside `$00000`–`$7E803` throws immediately (see `SystemMemory.checkBounds`
  in `src/memory/index.ts`) and stops execution.
- **There is no protection *inside* that range**: a program can read or
  write any address in it, including the system area, the TRAP vector
  table, or its own code — nothing stops a bug from overwriting them.

That second point matches real Motorola 68000 hardware, not just this
emulator: the base 68000 has no MMU and no memory protection built in —
the Mac 128K, the Sega Genesis, the Atari ST, and the TI-89 all ran (and
could all crash) exactly this way. Memory protection only arrived with
later chips (68030+) paired with an MMU. So a program stomping on its own
vector table here is the emulator being accurate to 1979-era hardware,
not a gap to close.

## Performance Characteristics

- **Random access**: O(1)
- **Sequential access**: O(1)
- **No caching**: Direct memory simulation
- **No virtual memory**: The whole address space is physical memory

## Tips for Efficient Memory Use

1. **Framebuffer location**: Place graphics code after $40000
2. **Stack allocation**: Keep stack pointer reasonable
3. **Data alignment**: 4-byte alignment for best performance
4. **Minimize memory copies**: Use indirect addressing when possible

---

See [Architecture](./ARCHITECTURE.md) for system design details.
