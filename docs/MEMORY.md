# Memory Layout

Reference for the Retro 68K Emulator's memory organization.

## Memory Map

The emulator provides 64KB of addressable memory space:

```
Address Range    Size      Purpose
─────────────────────────────────────────────
$00000-$01FFF    8 KB      System Area (vectors, TRAP handlers)
$02000-$3FFFF    56 KB     User RAM (program code & data)
$40000-$5FFFF    128 KB    Framebuffer (320×200 pixels)
```

## System Area ($00000-$01FFF)

Reserved for interrupt vectors and system-level data:

```
$00000-$0003F    64 bytes   Interrupt/TRAP vector table
$00040-$01FFF    8 KB-64B   Reserved for future use
```

### TRAP Vector Table

Each TRAP has a 4-byte vector:

```
Offset   TRAP #   Address
────────────────────────────
$00      0        Exit program
$04      1        Print string
$08      2        Read pixel
$0C      3        Write pixel
$10      4        Clear screen
$14-$7F  5-31     (reserved for future)
```

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

## Framebuffer ($40000-$5FFFF)

Screen display memory for the 320×200 LCD.

### Layout

- **Resolution**: 320 × 200 pixels
- **Format**: 32-bit RGBA per pixel
- **Total Size**: 320 × 200 × 4 bytes = 256 KB
- **Actual Used**: 256 KB (occupies $40000-$5FFFF)

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

Currently, the emulator does NOT implement:
- Read-only memory regions
- Memory protection exceptions
- Out-of-bounds access detection

All memory locations are readable and writable.

## Performance Characteristics

- **Random access**: O(1)
- **Sequential access**: O(1)
- **No caching**: Direct memory simulation
- **No virtual memory**: All 64KB is physical memory

## Tips for Efficient Memory Use

1. **Framebuffer location**: Place graphics code after $40000
2. **Stack allocation**: Keep stack pointer reasonable
3. **Data alignment**: 4-byte alignment for best performance
4. **Minimize memory copies**: Use indirect addressing when possible

---

See [Architecture](./ARCHITECTURE.md) for system design details.
