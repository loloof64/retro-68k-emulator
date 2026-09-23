# References and Guidelines

This page documents what you can actually *do* today. Everything is covered — the CPU, the assembler, the memory map, the TRAP system calls (including [sound](#sound)) and the debugger. See [Presentation](./PRESENTATION.md) for the full roadmap.

## Registers

The CPU core (registers, status flags, and the fetch-decode-execute loop) is implemented and working.

| Register | Size | Purpose |
|---|---|---|
| `D0`–`D7` | 32-bit | Data registers — general-purpose, for values and arithmetic |
| `A0`–`A7` | 32-bit | Address registers — hold memory addresses. `A7` doubles as the Stack Pointer (SP) |
| `PC` | 32-bit | Program Counter — address of the next instruction to fetch |

`D0`–`D7` and `A0`–`A7` are ordinary registers: any instruction that takes a register operand can freely read or write them (`MOVE D1,D0`, `ADD.L D1,A2`, and so on). `PC` cannot be read or written directly — there's no instruction that `MOVE`s a value into or out of it — it only changes as a side effect of control-flow instructions (`JMP`, `JSR`, `Bcc`, `RTS`, ...).

A freshly created CPU — internally, `createCPU()`/`reset()` in the emulator's core — starts with every register at `0` except `A7`, which starts at `$03FFF` (the top of the default stack, which grows downward). The Debugger panel's "⟲ Reset" button does exactly this, then reloads the assembled program and points the CPU at its entry address.

## The Stack

The stack is a region of memory used as a last-in-first-out (LIFO) buffer: the last value pushed onto it is the first one popped back off, like a stack of plates you can only add to or take from at the top. The CPU uses it for return addresses (`JSR`/`RTS`), for saving registers around a subroutine call, and for anything a program wants to stash temporarily.

There's no dedicated push/pop instruction — "push" and "pop" are just `MOVE` (or `MOVEM`, `PEA`, `JSR`) targeting `A7` through two addressing modes (see [Addressing Modes](#addressing-modes)):

- **Push** = `-(A7)`: decrement `A7` by the operand's size, *then* write the value there (`MOVE.L D0,-(A7)`).
- **Pop** = `(A7)+`: read the value at `A7`, *then* increment `A7` by the operand's size (`MOVE.L (A7)+,D0`).

Because a push decrements first, **the stack grows downward**, from high addresses toward low ones — the opposite of how User RAM is normally read top-to-bottom. That's why a freshly reset CPU starts `A7` at `$03FFF`, the *top* of the default stack (see [Registers](#registers) above): nothing has been pushed yet, and each push eats into User RAM from that high end down.

```
 $03FFF  +----------------+  <- A7 starts here, stack empty
         |                |
         |   free RAM     |
         |                |
 $02000  +----------------+
```

After `MOVE.L D0,-(A7)` pushes a 4-byte value:

```
 $03FFF  +----------------+
         |   free RAM     |
         +----------------+  <- A7 now points here
         |  D0's 4 bytes  |
 $02000  +----------------+
```

`A7` — the Stack Pointer — is what makes this "the" stack rather than just memory: every pushing/popping instruction always targets it specifically, never another address register. `JSR`/`BSR` push a return address and `RTS` pops it back off (see [What is a return address?](#what-is-a-return-address)); `PEA` pushes a computed address; `MOVEM list,-(A7)` / `MOVEM (A7)+,list` push or pop several registers in one instruction (see [How does MOVEM's register list work?](#how-does-movems-register-list-work)); `LINK`/`UNLK` build and tear down a whole stack frame (see [below](#how-do-link-and-unlk-handle-a7)).

## Status Flags

The status flags aren't something a program sets directly — they're a side effect: each instruction that "affects flags" updates them to reflect the result it just produced (a subtraction that hit zero sets `Z`, one that went negative sets `N`, and so on), and they simply hold that value until the next instruction that touches them runs.

| Flag | Name | Meaning |
|---|---|---|
| `N` | Negative | Set when the result's sign bit is `1` |
| `Z` | Zero | Set when the result is `0` |
| `V` | Overflow | Set on signed overflow |
| `C` | Carry | Set on unsigned carry/borrow |
| `X` | Extend | Mirrors `C` for most operations; used in multi-precision arithmetic |

Which flags a given instruction touches is listed per-instruction below, in the "Flags affected" column, using three notations: a flag on its own (e.g. `N, Z`) is set or cleared to reflect what the instruction actually produced; a flag followed by `(0)` (e.g. `V (0)`) is unconditionally cleared to `0`, regardless of the result — real hardware does this where the flag has no meaningful value for that instruction (multiply/divide can't overflow the way add/sub can, so `MULU`/`MULS` always clear `V`); and a flag missing from the list entirely is left untouched, keeping whatever value it had before the instruction ran. So "none" (or a missing flag) does **not** mean the flags are reset to `0`: they simply keep their previous values (for example, `DBRA` never touches them, so a flag set by the previous instruction stays lit through the whole loop).

### What are SR and CCR?

The five flags live together in one register, the **Status Register**, written `SR`. It is 16 bits wide: the flags occupy its low 5 bits (`X` is bit 4, `N` bit 3, `Z` bit 2, `V` bit 1, `C` bit 0), and the high byte holds things this emulator doesn't model (supervisor mode, interrupt mask, trace). The **Condition Code Register**, written `CCR`, is simply the low byte of `SR`: the flags and nothing else. That is why some instructions target `CCR` (`MOVE src,CCR`, `ANDI #data,CCR`) to set or clear flags directly, while `MOVE SR,dst` reads them back out into a register or memory. You never need either to write ordinary programs: arithmetic and comparisons set the flags for you, and branches read them.

### What does cc mean?

In `Bcc`, `DBcc` and `Scc` op-codes, `cc` is a placeholder for a *condition*: a two-letter test on the flags, such as `EQ` (equal, `Z=1`), `NE` (not equal), `GT` (greater than, signed) or `CS` (carry set). Replace `cc` with one to get an actual instruction: `BEQ`, `DBNE`, `SGT`. The full list, and which ones to use after a `CMP`, is in [Which Bcc do I want?](#which-bcc-do-i-want). (Motorola's manuals also call the flags themselves "condition codes", hence the name `CCR`; here, `cc` only ever means one of these tests.)

## Instruction Format

Every instruction in the tables below is written using the same template:

```
MNEMONIC.SIZE src,dst
```

- **MNEMONIC** is the instruction's name — `MOVE`, `ADD`, `BRA`, and so
  on. It's what tells the CPU *what* to do.
- **.SIZE** is an optional suffix controlling how many bits of data the
  instruction touches: `.B` for a byte (8 bits), `.W` for a word (16
  bits), or `.L` for a long word (32 bits). Not every instruction
  supports every size — the "Sizes" column in each instruction table
  below lists which ones a given mnemonic accepts. Leaving the suffix
  off entirely defaults to `.W` (word) for instructions that support
  it.
  The assembler rejects a suffix the instruction cannot take
  (`NOP.L`, `MULU.L`) rather than ignoring it, and `.S` (a short
  branch) exists only on `BRA`, `BSR` and `Bcc`.
  When `dst` is a data register (`Dn`), `.B`/`.W` only overwrite the
  low byte/word — the rest of the register keeps whatever it held
  before, it isn't cleared. An address register (`An`) destination
  works differently: there's no partial write, a `.W` source is
  sign-extended to fill the full 32 bits instead (see `MOVEA` in
  [Instruction Set (Opcodes)](#instruction-set-opcodes)).
- **src** and **dst** are the operands — "source" (where a value comes
  from) and "destination" (where it goes). Each one is written using
  one of the addressing modes described just below, e.g. a register
  (`D0`), a memory location (`(A0)`), or a constant (`#100`).

Not every instruction takes both a source and a destination — some take
only one operand (e.g. `NOT.L D0`, which flips every bit of `D0` in
place), and some take none at all (e.g. `RTS`, which just returns from
a subroutine). The exact operands each instruction accepts are spelled
out in its own "Syntax" column further down this page, in [Instruction
Set (Opcodes)](#instruction-set-opcodes) — the template above is just
the general shape they all follow.

The 68000 is **big-endian**: for a `.W` or `.L` value, the most
significant byte is stored at the lowest memory address. Writing
`$1234` as a word therefore leaves the bytes `$12` then `$34`, in that
order, at increasing addresses — see [Inspecting Memory](#inspecting-memory)
for a worked example.

## Addressing Modes

An addressing mode is how an instruction says where an operand lives — a register, a memory address, or a constant baked right into the instruction. Elsewhere on this page, `<ea>` ("effective address") stands for "any operand written using one of the addressing modes below" — it shows up in syntax like `ADD <ea>,Dn` to mean the source can be *any* of them (a register, `(A0)`, `#5`, ...), as opposed to a fixed operand like `Dn`, which only ever means a data register. Not every instruction accepts every mode as its `<ea>` — restrictions (e.g. no `#imm` as a destination) are called out per instruction in [Instruction Set (Opcodes)](#instruction-set-opcodes) and [Instruction Usage Guidance](#instruction-usage-guidance). These are the modes wired in today:

| Mode | Syntax | Example | Description |
|---|---|---|---|
| Data register | `Dn` | `MOVE.L D0,D1` | The value in a data register |
| Address register | `An` | `MOVE.L A0,A1` | The value in an address register |
| Register indirect | `(An)` | `MOVE.L (A0),D0` | The value in memory at the address held in `An` |
| Post-increment | `(An)+` | `MOVE.L (A0)+,D0` | `An` is used as the address first, *then* bumped by the operand's size |
| Pre-decrement | `-(An)` | `MOVE.L D0,-(A0)` | `An` is decremented by the operand's size first, then used as the address |
| Displacement | `d16(An)` | `MOVE.L $10(A0),D0` | `An` plus a 16-bit displacement — `An` itself is left unchanged |
| Immediate | `#value` | `MOVE.L #100,D0` | A constant baked into the instruction (source only — can't be a destination) |
| Absolute short | `xxx.W` | `MOVE.L $100.W,D0` | A 16-bit address, sign-extended — can only point at `$0000`-`$7FFF`: the whole [System area](#memory-map) (`$0000`-`$1FFF`) plus the first 24 KB of User RAM, not far enough to reach the Framebuffer, Controller Input, or Sound (or, on real hardware, the top of memory too; this emulator's address space doesn't extend that far) |
| Absolute long | `xxx.L` | `MOVE.L $40000.L,D0` | A full 32-bit address, written directly into the instruction — can point at any [region](#memory-map): System area, User RAM, Framebuffer, Controller Input, or Sound |
| Indexed | `d8(An,Xn)` | `MOVE.L $10(A0,D1.W),D0` | `An` plus an index register (`Dn` or `An`, `.W` sign-extended or `.L`) plus an 8-bit displacement — like Displacement above, both `An` and `Xn` are only read, neither is changed |
| PC displacement | `d16(PC)` | `MOVE.L $10(PC),D0` | The program counter (at the displacement's own extension word) plus a 16-bit displacement — source only, can't be a destination; like Displacement above, `PC` is only read, not changed by this addressing mode itself (it still advances normally past the extension word, same as fetching any other instruction) |
| PC indexed | `d8(PC,Xn)` | `MOVE.L $10(PC,D1.W),D0` | Like Indexed, but based on the program counter instead of an address register — source only; neither `PC` nor `Xn` is changed by this addressing mode itself |

Absolute addressing works either as shown above or, for an address you'll reuse, by loading it into an address register first with `MOVEA` (e.g. `MOVEA.L #$40000,A0` then `(A0)`) — most examples on this page still use the `MOVEA` style since it's what the addressing modes actually looked like before absolute addressing landed, but either works today.

Displacement (`d16(An)`) only ever *reads* `An` to compute the address — unlike post-increment and pre-decrement, it never writes a new value back into it. Use it when you want to reach an offset from `An` without moving `An` itself (e.g. `MOVE.L 4(A0),D0` to read the second long word of a struct pointed to by `A0`, leaving `A0` where it was for the next access); use post-increment/pre-decrement instead when you're walking through memory one element at a time and want `An` to advance (or retreat) as you go.

## Memory Map

The emulator's memory system is implemented and working. It's entirely simulated inside the app — a plain in-memory buffer, never your computer's actual RAM:

| Region | Address range | Size | Purpose |
|---|---|---|---|
| System area | `$00000`–`$01FFF` | 8 KB | Reserved for TRAP vectors and system data |
| User RAM | `$02000`–`$3FFFF` | ~248 KB | Your program's code, data, and stack |
| Framebuffer | `$40000`–`$7E7FF` | 250 KB | The 320×200 screen, 4 bytes per pixel, as a 32-bit `$RRGGBBAA` value (red `$FF0000FF`) |
| Controller Input | `$7E800`–`$7E803` | 4 B | Gamepad button state, as a bitmask (see below) |
| Sound | `$7E804`–`$7E80B` | 8 B | Tone generator registers, written by `TRAP #6` — played through Web Audio (see below) |

To find the address of a given pixel, see [Addressing a Pixel for TRAP #2/#3](#addressing-a-pixel-for-trap-23).

### Colors

A color is one 32-bit value, written `$RRGGBBAA` in hexadecimal: two hex digits (one byte, `$00`–`$FF`) each for red, green, blue and alpha. The same format is used everywhere a color appears: pixels in the framebuffer, the `D2` color of `TRAP #1`, and the `D0` value of `TRAP #2`, `#3` and `#4`.

```
     31      24 23      16 15       8 7        0
    +----------+----------+----------+----------+
    |   RED    |  GREEN   |   BLUE   |  ALPHA   |
    | $00-$FF  | $00-$FF  | $00-$FF  | $00-$FF  |
    +----------+----------+----------+----------+
```

Each component runs from `$00` (none) to `$FF` (full). The 68000 stores the most significant byte first, so in memory a pixel's four bytes are red, green, blue, alpha, in that order, at increasing addresses.

**Alpha is ignored:** the screen has no transparency, so `$FF0000FF` and `$FF000000` both show pure red. By convention programs write `$FF` there (*opaque*). This is also why a pixel of `$00000000` shows as black.

| Color | Value |
|---|---|
| Black | `$000000FF` |
| White | `$FFFFFFFF` |
| Red | `$FF0000FF` |
| Green | `$00FF00FF` |
| Blue | `$0000FFFF` |
| Yellow | `$FFFF00FF` |
| Cyan | `$00FFFFFF` |
| Magenta | `$FF00FFFF` |
| Orange | `$FF8000FF` |

To read one component back out of a color, *shift* it down to the lowest byte, then *mask* off what is above it. A shift moves every bit of a register by a given number of places (`LSR`, "logical shift right", moves bits toward the low end and fills created "holes" with zeros); a mask is an `AND` with `$FF`, which keeps only the low 8 bits and clears the rest. The red byte is already the top one, so shifting by 24 leaves only it:

```
        MOVE.L  #$FF8040FF,D0   ; a color: R=$FF G=$80 B=$40 A=$FF
        MOVE.L  D0,D1
        MOVEQ   #16,D2          ; shift count: 16 bits
        LSR.L   D2,D1           ; D1 = $0000FF80
        ANDI.L  #$FF,D1         ; D1 = $00000080: the green byte
        MOVE.L  D0,D3
        MOVEQ   #24,D2
        LSR.L   D2,D3           ; D3 = $000000FF: the red byte
        MOVE.L  D0,D4
        ANDI.L  #$FF,D4         ; D4 = $000000FF: the alpha byte
```

The blue byte needs a shift by 8 and the same mask. To go the other way and *build* a color from components, shift left (`LSL`) and `OR` the pieces together, or simply write the whole `$RRGGBBAA` value as one immediate, which is what the [example programs](./EXAMPLES.md) do.

### Reading the Gamepad

`$7E800` is a live 32-bit bitmask of the current button state — bit `1`
means held down. The app's Gamepad component keeps it updated from
whichever input is active: the on-screen A/B/X/Y + D-pad + Start/Select
control pad by default, or a real controller's buttons the moment one is
connected (a standard-mapped gamepad takes over automatically — the
on-screen buttons stop doing anything while it's plugged in).

The four face buttons follow their **position**, like on an Xbox
controller: A is the bottom button, B the right one, X the left one and Y
the top one. On a Nintendo-style controller, whose A/B and X/Y are laid out
the other way round, the button printed "A" (on the right) therefore
lights B, and the button printed "X" (at the top) lights Y — the physical
position is what stays the same from one controller to another.

| Bit | Button |
|---|---|
| 0 | A |
| 1 | B |
| 2 | X |
| 3 | Y |
| 4 | D-Pad Up |
| 5 | D-Pad Down |
| 6 | D-Pad Left |
| 7 | D-Pad Right |
| 8 | Start |
| 9 | Select |

```
        TRAP    #5                ; D0 = controller state
        BTST    #0,D0              ; test bit 0 (button A)
        BEQ     A_NOT_PRESSED      ; Z=1 -> button A isn't held
```

### Sound

`$7E804`–`$7E80B` is laid out for a single-voice tone generator —
frequency, duration, volume, waveform — the same idea as a PC speaker or
the TI-89's buzzer, not a sample player.

| Offset | Field | Size | Purpose |
|---|---|---|---|
| `+0` | Frequency | word | Hz; `0` = silence |
| `+2` | Duration | word | milliseconds |
| `+4` | Volume | byte | `0`-`255` |
| `+5` | Waveform | byte | `0`=square `1`=sine `2`=triangle `3`=sawtooth `4`=noise |
| `+6` | Trigger | byte | nonzero after `TRAP #6` |

`TRAP #6` writes D0-D3 into those fields in one step and sets the trigger:

```
        MOVE.W  #440,D0            ; frequency (Hz)
        MOVE.W  #250,D1            ; duration (ms)
        MOVE.B  #200,D2            ; volume
        MOVE.B  #0,D3               ; waveform (0 = square)
        TRAP    #6
```

The debugger watches the trigger after every instruction: it plays the
tone through the Web Audio API and clears the trigger back to 0. Only one
tone plays at a time — a new one cuts the previous. A frequency or
duration of 0 is silence. Sound starts after you press **Run** or
**Step** (browsers refuse audio before a click).

## Instruction Set (Opcodes)

Every non-privileged 68000 instruction is listed below, grouped the way Motorola's own 68000 Programmer's Reference Manual groups them. **Cycles** are how many CPU cycles an instruction takes to run — smaller is faster; they're what the emulator's cycle counter adds up as your program executes.

*(Real 68000 hardware charges different cycle counts per addressing mode, and `Bcc` costs less when the branch isn't taken — this emulator deliberately doesn't model that: each instruction below just charges one flat cycle count, regardless of addressing mode or whether a branch was taken.)*

### Data Movement

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `MOVE` | `MOVE.size src,dst` | byte, word, long | 4 | N, Z, V (0), C (0) | Copies a value from `src` to `dst`. |
| `MOVEA` | `MOVEA.size src,An` | word, long | 4 | none | Loads an address register. Not a separate opcode — a `MOVE` whose destination is `An` *is* `MOVEA`, bit-for-bit, which is exactly why it skips the flags a plain `MOVE` would set. Byte size raises the [Illegal Instruction exception](#exceptions). |
| `MOVEQ` | `MOVEQ #data,Dn` | long | 4 | N, Z, V (0), C (0) | Loads a small immediate (-128 to 127) into a data register. Faster/shorter than `MOVE.L #imm,Dn`. |
| `LEA` | `LEA src,An` | long | 4 | none | Computes an address and loads it into `An`, without reading what's stored there. Same addressing modes as `JSR` — see [below](#which-addressing-modes-can-jsr-target). |
| `PEA` | `PEA src` | long | 12 | none | Like `LEA`, but pushes the address onto the stack instead of loading it into a register. Same addressing modes as `JSR` — see [below](#which-addressing-modes-can-jsr-target). |
| `SWAP` | `SWAP Dn` | long | 4 | N, Z, V (0), C (0) | Swaps the high and low 16-bit halves of `Dn`. |
| `EXG` | `EXG Dx,Dy` / `EXG Ax,Ay` / `EXG Dx,Ay` | long | 6 | none | Swaps two full 32-bit registers — any mix of data and address registers. |
| `MOVEM` | `MOVEM.size list,dst` / `MOVEM.size src,list` | word, long | see below | none | Moves any subset of the 16 registers to or from memory at once, picked by a bitmask. See [below](#how-does-movems-register-list-work) for the addressing modes, the bitmask order, and the cycle formula. |
| `MOVEP` | `MOVEP.size Dx,(d16,Ay)` / `MOVEP.size (d16,Ay),Dx` | word, long | 16 (word), 24 (long) | none | Transfers a data register to/from alternating bytes of memory, for talking to an 8-bit peripheral over the 16-bit bus. See [below](#how-does-movep-transfer-alternating-bytes) for exactly which bytes and in what order. |
| `MOVE SR` | `MOVE SR,dst` | word | 6 (`Dn`), 8 (mem) | none | Writes the 5 flags packed as a word (`X` at bit 4 down to `C` at bit 0) into `dst`. The high byte real hardware would report (supervisor bit, interrupt mask, trace bit) is always `0` here — see [below](#why-doesnt-this-emulator-implement-rtestopresetmove-sr). Not privileged on the real MC68000 this emulator targets, unlike `MOVE to SR`. |
| `MOVE to CCR` | `MOVE src,CCR` | word | 12 | X, N, Z, V, C | Reads a word from `src` and sets the 5 flags from its low 5 bits, ignoring the rest (see [What are SR and CCR?](#what-are-sr-and-ccr)). Never privileged on any 68000-family part. |

### Arithmetic

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `ADD` | `ADD.size src,Dn` / `ADD.size Dn,dst` | byte, word, long | 4 (Dn), 8/12 byte-word/long (mem) | N, Z, V, C, X | Adds `src` into a data register, or a data register into memory — see [below](#how-does-the-memory-destination-direction-work) for the second form's addressing restriction and why the cycle count is higher. |
| `ADDI` | `ADDI.size #data,dst` | byte, word, long | 8/16 byte-word/long (`Dn`), 16/28 (mem) | N, Z, V, C, X | A different opcode from `ADD #imm,Dn` above — adds an immediate directly into `dst` (`Dn` or memory) with no register on the source side at all; see [below](#why-does-addi-exist-when-add-immdn-already-works) for why both exist. An address register isn't a valid `dst` — that raises the [Illegal Instruction exception](#exceptions). |
| `ADDA` | `ADDA.size src,An` | word, long | 8 (word), 6 (long) | none | `ADD`'s `An`-destination form: always a full 32-bit add, word `src` sign-extended first. Same relationship `MOVEA` has to `MOVE` — no flags touched at all, not even the ones a same-size `ADD` would set. |
| `ADDX` | `ADDX Dy,Dx` / `ADDX -(Ay),-(Ax)` | byte, word, long | 4/8 byte-word/long (register), 18/30 (memory) | N, Z (see below), V, C, X | `ADD`'s extend-carry sibling: `dst = dst + src + X`, for chaining an addition wider than one register — the binary counterpart to `ABCD`'s decimal chaining. See [below](#how-does-packed-bcd-arithmetic-work) for the chaining idiom and the `Z` rule (identical here). |
| `SUB` | `SUB.size src,Dn` / `SUB.size Dn,dst` | byte, word, long | 4 (Dn), 8/12 byte-word/long (mem) | N, Z, V, C, X | Subtracts `src` from a data register, or a data register from memory — same two directions `ADD` has, see [below](#how-does-the-memory-destination-direction-work). |
| `SUBI` | `SUBI.size #data,dst` | byte, word, long | 8/16 byte-word/long (`Dn`), 16/28 (mem) | N, Z, V, C, X | `ADDI`'s subtraction counterpart, same relationship `SUB` has to `ADD` — subtracts an immediate directly from `dst`, no register on the source side. Same `An` restriction as `ADDI`. |
| `SUBA` | `SUBA.size src,An` | word, long | 8 (word), 6 (long) | none | `SUB`'s `An`-destination form — same rules `ADDA` follows. |
| `SUBX` | `SUBX Dy,Dx` / `SUBX -(Ay),-(Ax)` | byte, word, long | 4/8 byte-word/long (register), 18/30 (memory) | N, Z (see below), V, C, X | `SUB`'s extend-carry sibling: `dst = dst - src - X`, same relationship `ADDX` has to `ADD`. |
| `ADDQ`/`SUBQ` | `ADDQ #data,dst` / `SUBQ #data,dst` | byte, word, long | 4 | N, Z, V, C, X (`An`: none) | Adds/subtracts a small immediate (`1`-`8`) straight into `dst`, packed into the opcode itself — see [below](#how-does-addqsubq-pack-its-immediate-into-the-opcode) for how. `dst = An` is always a full 32-bit op with no flags touched, regardless of size — same rule `MOVEA` follows. |
| `CMP` | `CMP.size src,Dn` | byte, word, long | 4 | N, Z, V, C | Subtracts `src` from a data register like `SUB`, but only sets flags — the register itself is unchanged. Typically followed by a `Bcc`. |
| `CMPI` | `CMPI.size #data,dst` | byte, word, long | 8/14 byte-word/long (`Dn`), 12/20 (mem) | N, Z, V, C | `CMP`'s immediate counterpart — compares an immediate directly against `dst` (`Dn` or memory), only sets flags, same as `CMP`. Flag `X` untouched. Same `An` restriction as `ADDI`. |
| `CMPM` | `CMPM (Ay)+,(Ax)+` | byte, word, long | 12/20 byte-word/long | N, Z, V, C | `CMP`'s memory-to-memory form — no register involved, both addresses postincrement. Computes `(Ax) - (Ay)`, only sets flags. Flag `X` untouched. |
| `CMPA` | `CMPA.size src,An` | word, long | 6 | N, Z, V, C | `CMP`'s `An`-destination form: compares the full 32-bit `An` against `src` (sign-extended if word), without modifying `An`. |
| `CLR` | `CLR.size dst` | byte, word, long | 4 | N, Z, V (0), C (0) | Sets `dst` to `0`. An address register isn't a valid `dst` — that raises the [Illegal Instruction exception](#exceptions). |
| `NEG` | `NEG.size dst` | byte, word, long | 4 | N, Z, V, C, X | Negates `dst` in place (two's complement: `dst = 0 - dst`). An address register isn't a valid `dst` — that raises the [Illegal Instruction exception](#exceptions). |
| `NEGX` | `NEGX.size dst` | byte, word, long | 4 | N, Z (see below), V, C, X | `NEG`'s extend-carry sibling, `ADDX`/`SUBX`'s single-operand relative: `dst = 0 - dst - X`. |
| `TST` | `TST.size dst` | byte, word, long | 4 | N, Z, V (0), C (0) | Sets flags from `dst`, like `CMP.size #0,dst` — doesn't modify it. An address register isn't a valid `dst` — that raises the [Illegal Instruction exception](#exceptions). |
| `TAS` | `TAS dst` | byte | 4 (`Dn`), 14 (memory) | N, Z (from the value read), V (0), C (0) | Like `TST.B`, but also sets `dst`'s bit 7 to `1` afterward — a "busy" flag for a spinlock. See [below](#how-does-tas-work-as-a-lock) for the idiom. |
| `EXT` | `EXT.size Dn` | word, long | 4 | N, Z, V (0), C (0) | Sign-extends `Dn`: `.W` extends the low byte into the low word (high word untouched); `.L` extends the low word into the full long. |
| `MULU` | `MULU.W src,Dn` | word (source) | 70 | N, Z, V (0), C (0) | Unsigned multiply: `Dn = src × Dn.W`, full 32-bit result in `Dn`. |
| `MULS` | `MULS.W src,Dn` | word (source) | 71 | N, Z, V (0), C (0) | Signed multiply: `Dn = src × Dn.W`, full 32-bit result in `Dn`. |
| `DIVU` | `DIVU.W src,Dn` | word (source) | 138 (10 on overflow, 38 on zero divide) | N, Z, V, C (0) | Unsigned divide: `Dn` (32-bit) ÷ `src` (16-bit) → quotient in `Dn`'s low word, remainder in the high word. If the quotient doesn't fit in 16 bits, `V` is set and `Dn` is left unmodified. Dividing by zero raises the [Zero Divide exception](#exceptions) instead. |
| `DIVS` | `DIVS.W src,Dn` | word (source) | 158 (10 on overflow, 38 on zero divide) | N, Z, V, C (0) | Signed divide, same layout as `DIVU`. Truncates toward zero; the remainder takes the dividend's sign. |

### Binary Coded Decimal

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `ABCD` | `ABCD Dy,Dx` / `ABCD -(Ay),-(Ax)` | byte | 6 (register), 18 (memory) | X, C, Z (see below); N, V undefined | Adds two packed-BCD digits plus `X`: `Dx = Dx + Dy + X`. See [below](#how-does-packed-bcd-arithmetic-work) for what "packed BCD" means and why the flags behave differently here. |
| `SBCD` | `SBCD Dy,Dx` / `SBCD -(Ay),-(Ax)` | byte | 6 (register), 18 (memory) | X, C, Z (see below); N, V undefined | Subtracts two packed-BCD digits plus `X`: `Dx = Dx - Dy - X`. |
| `NBCD` | `NBCD dst` | byte | 6 (`Dn`), 8 (memory) | X, C, Z (see below); N, V undefined | Negates a packed-BCD byte plus `X`: `dst = 0 - dst - X`. `An` direct isn't valid — see [below](#how-does-packed-bcd-arithmetic-work). |

### Logical

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `AND` | `AND.size src,Dn` / `AND.size Dn,dst` | byte, word, long | 4 (Dn), 8/12 byte-word/long (mem) | N, Z, V (0), C (0) | Bitwise ANDs `src` into a data register, or a data register into memory — see [below](#how-does-the-memory-destination-direction-work). |
| `ANDI` | `ANDI.size #data,dst` | byte, word, long | 8/16 byte-word/long (`Dn`), 16/28 (mem) | N, Z, V (0), C (0) | A different opcode from `AND #imm,Dn` above — ANDs an immediate directly into `dst` (`Dn` or memory) with no register on the source side. Same `An` restriction as `ADDI` (see [Arithmetic](#arithmetic)). |
| `ANDI to CCR` | `ANDI #data,CCR` | byte | 20 | X, N, Z, V, C | A fixed opcode `ANDI` repurposes for `<ea>` = `#imm,CCR` — ANDs an immediate directly into the flags, instead of into a memory/register `dst`. See [below](#why-doesnt-this-emulator-implement-rtestopresetmove-sr). |
| `OR` | `OR.size src,Dn` / `OR.size Dn,dst` | byte, word, long | 4 (Dn), 8/12 byte-word/long (mem) | N, Z, V (0), C (0) | Bitwise ORs `src` into a data register, or a data register into memory — see [below](#how-does-the-memory-destination-direction-work). |
| `ORI` | `ORI.size #data,dst` | byte, word, long | 8/16 byte-word/long (`Dn`), 16/28 (mem) | N, Z, V (0), C (0) | `ANDI`'s OR counterpart — ORs an immediate directly into `dst`, no register on the source side. Same `An` restriction as `ADDI`. |
| `ORI to CCR` | `ORI #data,CCR` | byte | 20 | X, N, Z, V, C | `ANDI to CCR`'s OR counterpart — ORs an immediate directly into the flags. |
| `XOR` | `XOR.size Dn,dst` | byte, word, long | 4 | N, Z, V (0), C (0) | Bitwise XORs a data register into `dst` — the one bitwise op where the *source* is always `Dn` and `dst` can be memory. |
| `EORI` | `EORI.size #data,dst` | byte, word, long | 8/16 byte-word/long (`Dn`), 16/28 (mem) | N, Z, V (0), C (0) | `XOR`'s immediate counterpart (real mnemonic `EOR`) — XORs an immediate directly into `dst`, no register on the source side. Same `An` restriction as `ADDI`. |
| `EORI to CCR` | `EORI #data,CCR` | byte | 20 | X, N, Z, V, C | `ANDI to CCR`'s XOR counterpart — XORs an immediate directly into the flags. |
| `NOT` | `NOT.size dst` | byte, word, long | 4 | N, Z, V (0), C (0) | Bitwise inverts `dst` in place (one's complement: `dst = ~dst`). An address register isn't a valid `dst` — that raises the [Illegal Instruction exception](#exceptions). |

### Bit Manipulation

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `BTST` | `BTST #n,dst` / `BTST Dn,dst` | long (register), byte (memory) | see below | Z only | Tests bit `n` of `dst` (Z=1 when clear). Doesn't modify `dst` — the standard way to poll one button out of the [gamepad bitmask](#reading-the-gamepad). `Dn,dst` reads the bit number from a register instead of an immediate. See [below](#what-do-bchgbclrbset-write-back) for the address-register restriction and the static/dynamic cycle difference. |
| `BCHG` | `BCHG #n,dst` / `BCHG Dn,dst` | long (register), byte (memory) | see below | Z only | Like `BTST`, but also toggles bit `n` of `dst` after testing it. See [below](#what-do-bchgbclrbset-write-back) for what "write back" means here. |
| `BCLR` | `BCLR #n,dst` / `BCLR Dn,dst` | long (register), byte (memory) | see below | Z only | Like `BTST`, but also clears bit `n` of `dst` after testing it. See [below](#what-do-bchgbclrbset-write-back). |
| `BSET` | `BSET #n,dst` / `BSET Dn,dst` | long (register), byte (memory) | see below | Z only | Like `BTST`, but also sets bit `n` of `dst` after testing it. See [below](#what-do-bchgbclrbset-write-back). |

### Shift and Rotate

`Dn` shifted/rotated in place by either an immediate count (`#n`, 1-8,
with `#0` meaning 8) or a dynamic count taken from another data register
(mod 64). There's also a second form that shifts/rotates a memory `<ea>`
directly, always by exactly one bit — see [below](#how-does-the-memory-operand-shift-and-rotate-form-work) for its addressing modes, size
restriction, and cycle cost.

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `ASL` | `ASL #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V, C, X | Arithmetic shift left. Sets V if the sign bit changes value at any point during the shift. |
| `ASR` | `ASR #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V (0), C, X | Arithmetic shift right — copies the original sign bit back in at each step. |
| `LSL` | `LSL #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V (0), C, X | Logical shift left, filling with `0`. |
| `LSR` | `LSR #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V (0), C, X | Logical shift right, filling with `0`. |
| `ROL` | `ROL #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V (0), C | Rotates left — the bit rotated out of the top wraps back into bit 0. `X` is never touched. |
| `ROR` | `ROR #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V (0), C | Rotates right — the bit rotated out of bit 0 wraps back into the top. `X` is never touched. |
| `ROXL` | `ROXL #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V (0), C, X | Rotates left *through* `X` — the bit rotated out becomes the new `X`/`C`; the *old* `X` rotates in where `ROL` would wrap the outgoing bit. See [below](#how-does-rotating-through-x-differ-from-a-plain-rotate). |
| `ROXR` | `ROXR #n,Dn / Dx,Dn` | byte, word, long | 6 + 2×count | N, Z, V (0), C, X | Rotates right *through* `X`, mirroring `ROXL`. |

*(A dynamic count of `0` — only possible with the `Dx,Dn` form — does nothing to the value. For every instruction here except `ROXL`/`ROXR`: `C` comes out cleared, `X` is left exactly as it was. `ROXL`/`ROXR` are the one exception — see [below](#how-does-rotating-through-x-differ-from-a-plain-rotate).)*

### Program Control

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `BRA` | `BRA target` | word | 10 | none | Always jumps to `target`. |
| `Bcc` | see below | word | 10 | none (reads flags, doesn't set them) | Jumps to `target` only if the named condition on the current flags holds. |
| `JMP` | `JMP target` | word | 8 | none | Jumps to `target` unconditionally — no [return address](#what-is-a-return-address) is pushed. See [below](#which-addressing-modes-can-jsr-target) for which addressing modes are valid. |
| `JSR` | `JSR target` | word | 16 | none | Pushes the [return address](#what-is-a-return-address) onto the stack, then jumps to `target`. See [below](#which-addressing-modes-can-jsr-target) for which addressing modes are valid. |
| `BSR` | `BSR target` | word | 18 | none | Like `JSR`, but PC-relative — pushes the [return address](#what-is-a-return-address), then always branches to `target`. |
| `RTS` | `RTS` | word | 16 | none | Pops a [return address](#what-is-a-return-address) pushed by `JSR`/`BSR` and jumps there. |
| `RTR` | `RTR` | word | 20 | X, N, Z, V, C | `RTS`'s sibling: pops a 16-bit word into the flags first (only the low 5 bits are used), then pops a return address and jumps there, same as `RTS`. Not tied to exceptions or supervisor mode — see [below](#why-doesnt-this-emulator-implement-rtestopresetmove-sr). |
| `DBcc` | `DBcc Dn,target` | word | 10 / 12 / 14 | none | Tests condition `cc` (same table as `Bcc`), then either stops or loops back to `target`. See [below](#how-does-dbcc-decide) for exactly how, and what the three cycle counts mean. |
| `Scc` | `Scc dst` | byte | 4 / 6 / 8 | none | Tests condition `cc` (same table as `Bcc`) and sets `dst` to `$FF` or `$00` — no branch, no arithmetic. See [below](#which-destinations-can-scc-use) for valid destinations and what the three cycle counts mean. |
| `LINK` | `LINK An,#displacement` | word | 16 | none | Stack-frame prologue: pushes `An`, points `An` at the new frame, then moves `SP` by `displacement`. See [below](#how-do-link-and-unlk-handle-a7) for the `LINK A7`/`UNLK A7` special case. |
| `UNLK` | `UNLK An` | word | 12 | none | Stack-frame epilogue, `LINK`'s inverse: restores `SP` from `An`, then pops the old `An` value. See [below](#how-do-link-and-unlk-handle-a7) for the `UNLK A7` special case. |
| `CHK` | `CHK <ea>,Dn` | word | 10 / 40 | N (see below) | Bounds-checks `Dn` against `0` and `<ea>` (both signed words); out of range either way raises the [CHK exception](#exceptions) instead of continuing. See [below](#which-values-does-chk-accept) for the exact range and what happens to `N`. |

### System

| Mnemonic | Syntax | Sizes | Cycles | Flags affected | Description |
|---|---|---|---|---|---|
| `NOP` | `NOP` | word | 4 | none | Does nothing. Useful for timing/padding. |
| `ILLEGAL` | `ILLEGAL` | word | 34 | none | Deliberately raises the [Illegal Instruction exception](#exceptions) — a reserved opcode, useful as a portable, explicit "trap here" marker. |
| `TRAPV` | `TRAPV` | word | 4 (V clear), 34 (V set) | none (reads V, doesn't set it) | Raises the [TRAPV exception](#exceptions) if `V` is set, otherwise falls through — checks for overflow after an `ADD`/`SUB` without a separate `BVC`/`TRAP` pair. |

Detailed explanations, restrictions and examples for individual instructions live in [Instruction Usage Guidance](#instruction-usage-guidance).

See [TRAP System Calls](#trap-system-calls) below for `TRAP`, and
[below](#why-doesnt-this-emulator-implement-rtestopresetmove-sr) for why
`ILLEGAL`/`TRAPV` are here but `RTE`/`STOP`/`RESET`/`MOVE SR` aren't.

### Alphabetical Index

**A** — [ABCD](#binary-coded-decimal) · [ADD](#arithmetic) · [ADDA](#arithmetic) · [ADDI](#arithmetic) · [ADDQ](#arithmetic) · [ADDX](#arithmetic) · [AND](#logical) · [ANDI](#logical) · [ANDI to CCR](#logical) · [ASL](#shift-and-rotate) · [ASR](#shift-and-rotate)

**B** — [Bcc](#program-control) · [BCHG](#bit-manipulation) · [BCLR](#bit-manipulation) · [BRA](#program-control) · [BSET](#bit-manipulation) · [BSR](#program-control) · [BTST](#bit-manipulation)

**C** — [CHK](#program-control) · [CLR](#arithmetic) · [CMP](#arithmetic) · [CMPA](#arithmetic) · [CMPI](#arithmetic) · [CMPM](#arithmetic)

**D** — [DBcc](#program-control) · [DIVS](#arithmetic) · [DIVU](#arithmetic)

**E** — [EORI](#logical) · [EORI to CCR](#logical) · [EXG](#data-movement) · [EXT](#arithmetic)

**I** — [ILLEGAL](#system)

**J** — [JMP](#program-control) · [JSR](#program-control)

**L** — [LEA](#data-movement) · [LINK](#program-control) · [LSL](#shift-and-rotate) · [LSR](#shift-and-rotate)

**M** — [MOVE](#data-movement) · [MOVEA](#data-movement) · [MOVEM](#data-movement) · [MOVEP](#data-movement) · [MOVEQ](#data-movement) · [MOVE SR](#data-movement) · [MOVE to CCR](#data-movement) · [MULS](#arithmetic) · [MULU](#arithmetic)

**N** — [NBCD](#binary-coded-decimal) · [NEG](#arithmetic) · [NEGX](#arithmetic) · [NOP](#system) · [NOT](#logical)

**O** — [OR](#logical) · [ORI](#logical) · [ORI to CCR](#logical)

**P** — [PEA](#data-movement)

**R** — [ROL](#shift-and-rotate) · [ROR](#shift-and-rotate) · [ROXL](#shift-and-rotate) · [ROXR](#shift-and-rotate) · [RTR](#program-control) · [RTS](#program-control)

**S** — [SBCD](#binary-coded-decimal) · [Scc](#program-control) · [SUB](#arithmetic) · [SUBA](#arithmetic) · [SUBI](#arithmetic) · [SUBQ](#arithmetic) · [SUBX](#arithmetic) · [SWAP](#data-movement)

**T** — [TAS](#arithmetic) · [TRAP](#trap-system-calls) · [TRAPV](#system) · [TST](#arithmetic)

**U** — [UNLK](#program-control)

**X** — [XOR](#logical)

## Instruction Usage Guidance

Answers to the "how does this actually behave?" questions the tables above can't fit in a cell: operand directions, flag and register side effects, which addressing modes an instruction accepts, and worked examples. The instruction tables and the alphabetical index stay in [Instruction Set (Opcodes)](#instruction-set-opcodes).

### How does the memory-destination direction work?

`ADD`, `SUB`, `AND`, and `OR` each support two directions that share one mnemonic (see [Addressing Modes](#addressing-modes) above for what `<ea>` means):

- **`<ea>,Dn`** — read a value from anywhere (any addressing mode, including `#imm`) and combine it into a data register. This is the form used everywhere else on this page.
- **`Dn,<ea>`** — the mirror image: combine a data register's value into `<ea>` instead, writing the result back to `<ea>` rather than to `Dn`. `<ea>` here must be a *memory-alterable* address — not `Dn`, not `An`, no `#imm`, no PC-relative — the same restriction the [memory-operand shift/rotate form](#how-does-the-memory-operand-shift-and-rotate-form-work) uses.

```asm
        MOVE.B  #5,D0
        ADD.B   D0,(A1)    ; Memory[A1] += D0, not D0 += Mem[A1]
```

The memory-destination form costs more than the flat `4` cycles the `<ea>,Dn` direction uses: `8` for byte or word, `12` for long — writing the result back to memory is a real extra bus cycle the register-destination form doesn't pay.

`AND`'s and `OR`'s `Dn,<ea>` form has one more wrinkle worth knowing if you're hand-encoding opcodes: their byte-sized `mode 000`/`001` slot is reserved on real hardware for `ABCD` (in `AND`'s case) or `SBCD` (in `OR`'s case) — see [How does packed BCD arithmetic work?](#how-does-packed-bcd-arithmetic-work). This isn't a conflict in practice: `Dn,<ea>`'s own `<ea>` already excludes `Dn`/`An` (mode `000`/`001`), so the two instructions never actually compete for the same encoding — the split just happens to land exactly where `Dn,<ea>` was never going to use anyway.

### Why does ADDI exist when ADD #imm,Dn already works?

Both really do accept an immediate — `ADD`'s `<ea>,Dn` form's `src` can be any addressing mode, `#imm` included (see [above](#how-does-the-memory-destination-direction-work)), so `ADD #5,D0` is a perfectly ordinary `ADD`, not `ADDI`. `ADD`/`ADDI` are still genuinely different opcodes at the bit level, and the difference that actually matters is `dst`: `ADD #imm,Dn`'s `<ea>,Dn` form can only ever target a data register, while `ADDI #imm,dst` can also target memory directly. So reach for `ADDI` specifically when the immediate needs to land straight in memory, with no register involved at all:

```asm
        ADDI.W  #1,(A0)     ; adds 1 straight into memory
```

`SUBI`/`ANDI`/`ORI`/`EORI`/`CMPI` all follow the same split from their non-`I` counterpart.

### How does ADDQ/SUBQ pack its immediate into the opcode?

`ADDQ`/`SUBQ`'s immediate is restricted to `1`-`8` for a specific reason: that narrow range is exactly what fits in the 3 spare bits (`ddd`) the opcode word already has free, right alongside the size and addressing-mode bits — `0101ddd0ssmmmrrr` for `ADDQ`, `0101ddd1ssmmmrrr` for `SUBQ`. Unlike `ADDI`/`SUBI`, which read their immediate from a separate extension word fetched right after the opcode, `ADDQ`/`SUBQ` never fetch one at all — the value is already sitting in the opcode word the CPU just read to know *which* instruction this is. That's also part of why they're cheaper: see their `4`-cycle entry in the [Arithmetic](#arithmetic) table above, versus `ADDI`/`SUBI`'s.

3 bits can only encode `0`-`7`, though, and the instructions need `1`-`8` — so `8` reuses the otherwise-unused `000` bit pattern: the assembler encodes an immediate of `8` as `000`, and the CPU decodes a `000` field back as `8`, never as `0`. There's simply no encoding for "add/subtract `0`" with these two instructions:

```asm
        MOVEQ   #0,D0
        ADDQ.L  #8,D0      ; D0 = 8 -- "000" decodes as 8, not 0
```

### How does TAS work as a lock?

`TAS dst` does two things in one instruction: it sets flags from `dst` exactly like `TST.B dst` would (`N` from the value's sign bit, `Z` if it was `0`), then — regardless of what it just read — forces `dst`'s bit 7 to `1` and writes that back. Reading the old value and setting the new one happen as a single indivisible step on real 68000 hardware, which is the entire point: it's the classic building block for a *spinlock*, a busy-wait flag that only one caller can ever "win":

```asm
FLAG:   DS.B    1              ; the lock: a single reserved byte
        EVEN                   ; DS.B 1 is odd-sized, see below
LOOP:
  TAS     FLAG           ; N = old bit 7, then sets FLAG's bit 7
  BMI     LOOP           ; N set: was already busy - spin
  ; N clear: lock acquired, critical section entered
  ...
  CLR.B   FLAG           ; release the lock for the next caller
```

`FLAG` here is a [label](#source-layout) — a name the program itself gives to a byte of memory it reserved for the lock — not a keyword or a special register. The `EVEN` after it pads to the next even address, since `DS.B 1` reserves an odd number of bytes and `LOOP`'s first instruction needs to start on an even one — see [Source Layout](#source-layout).

If `FLAG`'s bit 7 was already `1`, `N` comes out set and the loop spins — someone else holds the lock. If it was `0`, `N` comes out clear, execution falls through, and `TAS` has *already* set the bit on its way out — no other caller can slip in between the test and the set, because they were never two separate steps to begin with.

This emulator has no concurrency (no threads, no interrupts preempting mid-instruction) to actually race against, so a plain read followed by a plain write already behaves identically to the indivisible version — the idiom above works the same way it would on real hardware, just without anything else that could ever contend for the lock.

`An` direct isn't a valid `dst` — there's no such thing as test-and-setting an address register — so it raises the [Illegal Instruction exception](#exceptions) instead, the same restriction `BTST`/`CHK` have on their own `<ea>`.

### How does packed BCD arithmetic work?

Packed BCD stores two decimal digits, `0`-`9` each, one per nibble of a byte — a completely different interpretation of the bits than plain binary. `$09` means the decimal digit 9 either way, but `$99` is decimal 99 in packed BCD, not 153 like it would be read as plain binary. Adding `$09` and `$01` as ordinary binary gives `$0A` — not a valid pair of decimal digits — which is exactly the problem `ABCD` corrects for, producing `$10` instead: the same digits ("1", "0") you'd get adding 9 and 1 by hand and carrying.

```asm
        MOVE.B  #$09,D0
        MOVE.B  #$01,D1
        ABCD    D0,D1      ; D1 = 9+1 = $10, not binary $0A
```

All three instructions are byte-only and thread `X` through as a carry/borrow, so a decimal number wider than one byte can be processed one byte at a time, low byte first — the same chaining idiom [`ADDX`/`SUBX`/`NEGX`](#arithmetic) use for plain binary. `ABCD`/`SBCD`'s `-(Ay),-(Ax)` form exists specifically for this: it walks two multi-byte BCD numbers backward through memory together, one digit-pair at a time.

A real consequence of `NBCD` being defined as `0 - dst - X`: negating a zero byte with `X` already set doesn't stay zero — it borrows, producing `$99` with `C`/`X` set. That's not a bug, it's what makes negating a multi-byte BCD number work: negate the low byte first, then each higher byte's `NBCD` sees the previous byte's borrow via `X` and accounts for it.

Two flag quirks worth knowing before relying on them:

- **`N` and `V` are genuinely undefined** on real 68000 hardware for a BCD result — a packed-decimal byte's top bit isn't a sign bit, so there's no meaningful value to compute. This emulator leaves them untouched rather than inventing one, the same choice [CHK](#which-values-does-chk-accept) makes for its own undefined flags.
- **`Z` is *cleared* if the result is non-zero, but *left alone* if the result is zero** — not a plain assignment like every other instruction on this page. That's deliberate: it lets a multi-byte chain clear `Z` once before the first byte, then read `Z=1` at the end only if *every* byte in the chain came out zero, without each individual byte's instruction able to falsely set `Z` back to `1` on its own.

`NBCD`'s `dst` follows the same restriction `BTST`/`CHK`/`TAS` place on their own operands: `An` direct raises the [Illegal Instruction exception](#exceptions) instead of being treated as a value to negate.

### What do BCHG/BCLR/BSET write back?

Same as `BTST` — the bit is located and its old value drives `Z` — but instead of stopping there, the (possibly changed) value gets written back to `dst`: `BCHG` flips the bit, `BCLR` forces it to `0`, `BSET` forces it to `1`. `Z` still reflects the bit's state *before* the write, exactly like `BTST`, so `BSET #0,D0 / BEQ WAS_CLEAR` reads naturally: branch if the bit *used to be* clear, even though it's `1` now.

`An` direct isn't a valid `dst` for any of the four (`BTST` included) — same restriction `CHK`/`TAS`/`NBCD` share — so the static (`#n,dst`) form raises the [Illegal Instruction exception](#exceptions) instead. The dynamic (`Dn,dst`) form's own `An`-direct opcode slot belongs to `MOVEP` on real hardware instead (see [Data Movement](#data-movement)), so hand-encoding e.g. `BSET D0,A0` runs as `MOVEP`, not as a failed `BSET`.

**Static vs dynamic bit number**: `#n,dst` reads the bit number from an immediate extension word; `Dn,dst` reads it from a data register instead. Behavior is otherwise identical (same `Z` rule, same write-back, same long-register/byte-memory split) — the only difference is cost, and only when `dst` is itself a register (no extension word to fetch):

| Instruction | Static, register `dst` | Dynamic, register `dst` | Either form, memory `dst` |
|---|---|---|---|
| `BTST` | 10 | 6 | 8 |
| `BCHG` | 12 | 8 | 12 |
| `BCLR` | 14 | 10 | 12 |
| `BSET` | 12 | 8 | 12 |

`BCLR`'s register-form cycle count is genuinely higher than `BCHG`/`BSET`'s on real 68000 hardware in both forms — not a typo.

### Which Bcc do I want?

After a `CMP`, there are *two separate* families of "is it bigger/smaller" branches — one for **signed** numbers (can be negative), one for **unsigned** (always treated as a positive count). Mixing them up is a classic bug: comparing `$FFFFFFFF` to `1`, as signed that's `-1 < 1` (`BLT` is true), but as unsigned `$FFFFFFFF` is a huge number `> 1` (`BHI` is true) — same bits, opposite answer. Pick the family that matches what the value actually represents (a loop counter is usually unsigned; a temperature could be signed).

**Signed comparisons** (`CMP.L #5,D0` then...):

| Mnemonic | Branches when | Meaning |
|---|---|---|
| `BGT` | signed `>` | Greater Than |
| `BGE` | signed `>=` | Greater or Equal |
| `BLT` | signed `<` | Less Than |
| `BLE` | signed `<=` | Less or Equal |

**Unsigned comparisons** (same syntax, different meaning of "bigger"):

| Mnemonic | Branches when | Meaning |
|---|---|---|
| `BHI` | unsigned `>` | Higher |
| `BCC` (= `BHS`) | unsigned `>=` | Carry Clear / Higher or Same |
| `BCS` (= `BLO`) | unsigned `<` | Carry Set / Lower |
| `BLS` | unsigned `<=` | Lower or Same |

**Equality and raw flag tests** (same either way):

| Mnemonic | Branches when | Meaning |
|---|---|---|
| `BEQ` | `Z=1` (equal) | Equal |
| `BNE` | `Z=0` (not equal) | Not Equal |
| `BPL` | `N=0` | Plus (result was positive/zero) |
| `BMI` | `N=1` | Minus (result was negative) |
| `BVC` | `V=0` | Overflow Clear |
| `BVS` | `V=1` | Overflow Set |

### How does DBcc decide?

`target` works the same way it does for `Bcc`: a label placed earlier in the code, so branching back to it repeatedly is what forms a loop — there's no loop construct in the CPU itself, just this instruction deciding, each time it runs, whether to jump back or not.

```mermaid
flowchart TD
    Start(["DBcc runs"]) --> TestCC{"1. cc true?"}
    TestCC -- yes --> Stop["2. Stop: no branch<br/>Dn untouched<br/>(12 cycles)"]
    TestCC -- no --> Dec["3. Decrement low 16 bits of Dn"]
    Dec --> TestNeg1{"Dn == -1?"}
    TestNeg1 -- no --> Branch["4. Branch back to target<br/>loop runs again<br/>(10 cycles)"]
    TestNeg1 -- yes --> Fall["5. Fall through<br/>loop is over<br/>(14 cycles)"]
```

Spelled out, step by step:

1. Test condition `cc` (the same table as `Bcc`, above).
2. **Already true?** Stop here: no branch, `Dn` untouched. *(12 cycles.)*
3. **False** — decrement the low 16 bits of `Dn`.
4. **Result isn't `-1`?** Branch back to `target`: the loop runs again. *(10 cycles.)*
5. **Result is `-1`?** Fall through instead: the loop is over. *(14 cycles.)*

`DBRA` (a.k.a. `DBF`) is `DBcc` with `cc` fixed to "always false" — step 2 never fires, so it always falls through to the decrement. See the `DBRA` example further down this page, including the classic off-by-one it's easy to trip over.

### Which destinations can Scc use?

Any data-alterable destination — `Dn` or writable memory, same restriction `CLR`/`NOT`/`NEG`/`TST` use. Not valid: `An`, `#value`, or a PC-relative address (`d16(PC)`, `d8(PC,Xn)`).

The three cycle counts depend on both the destination and the outcome of testing `cc`: 4 cycles for `Dn` when `cc` turns out false, 6 when it's true, 8 for a memory destination either way.

### What is a "return address"?

The address of the instruction right after the call — where execution should pick back up once the called code is done. `JSR`/`BSR` push it onto the stack when they jump; `RTS` pops it back off and jumps there, resuming exactly where the caller left off. This is the 68000's version of a `call`/`return` mechanism.

Concretely, `PC` (the [Program Counter](#registers)) already points past an instruction by the time that instruction runs — the CPU advances it during fetch, before execution. So when `JSR` pushes "the return address", it's just pushing `PC`'s current value at that point, which happens to be right after the `JSR` instruction (and past any extension word its addressing mode used, e.g. the `d16` in `JSR $10(A0)`):

```asm
        JSR     MY_FUNC        ; at address $2000, 2 bytes long
; <-- $2002 is what gets pushed as the return address
```

Inside `MY_FUNC`, a final `RTS` pops that `$2002` back into `PC`, so execution resumes right after the call. `JMP` skips all of this — no address is pushed, so there's nothing to return to.

### Which addressing modes can JSR target?

Any that name a memory location without a register side effect — the 68000's "control" addressing modes: `(An)`, `d16(An)`, `d8(An,Xn)`, `xxx.W`, `xxx.L`, `d16(PC)`, `d8(PC,Xn)`. Not valid: `Dn`, `An`, `(An)+`, `-(An)`, or `#imm`. See [Addressing Modes](#addressing-modes) above for what each of these means (that section covers what every other instruction's `src`/`dst` can be, too). `JMP`, `LEA`, and `PEA` all use this exact same set for their `target`/`src` — they compute the address the same way `JSR` does, just jump to it directly (`JMP`, without pushing a return address), load it into `An` (`LEA`), or push it onto the stack (`PEA`) instead.

### How do LINK and UNLK handle A7?

`LINK An,#displacement` sets up a stack frame in three steps: push `An` onto the stack, point `An` at that pushed value (the new frame pointer), then move `SP` by `displacement` — a negative value reserves that many bytes of local variables below the frame. `UNLK An` tears it back down in the opposite order: `SP` is restored from `An`, and the old `An` value is popped back off the stack. Together they're the standard prologue/epilogue for a subroutine that needs local variables:

```asm
MY_FUNC:
  LINK    A6,#-8         ; A6 = frame pointer, 8 bytes of locals
  MOVE.L  D0,-8(A6)      ; use the locals via A6
  ...
  UNLK    A6             ; restore SP, pop the caller's A6 back
  RTS
```

Both instructions are defined as an exact sequence of micro-operations, not one atomic "swap An and SP" step — `LINK`: `SP-4→SP`, `An→(SP)`, `SP→An`, `SP+displacement→SP`; `UNLK`: `SP←An`, `An←(SP)`, `SP←SP+4`. That only matters when `An` *is* `A7` (`LINK A7,#d` / `UNLK A7`), since then every step in the sequence reads or writes the same physical register the previous step just changed:

- **`LINK A7,#d`**: step 1 already decremented `A7` before step 2 pushes it, so the value that lands on the stack is the *new*, already-decremented `SP` — not `A7`'s value from before the instruction ran.
- **`UNLK A7`**: step 1 (`SP←An`) is a no-op, since `An` already *is* `SP`. Step 2 (`An←(SP)`) then overwrites `A7` with the popped value — so by the time step 3 runs, `SP←SP+4` adds 4 to the *popped* value, not to the original frame pointer.

Neither case comes up in the `LINK A6,#-8` / `UNLK A6` idiom above, since a subroutine almost always frames a different register than `SP` — but hand-encoding raw opcode words makes it easy to reach for `A7` by mistake, so it's worth knowing the sequence rather than assuming "swap" semantics.

### Which values does CHK accept?

`CHK <ea>,Dn` treats `<ea>` as an upper bound and checks whether `Dn`'s low 16 bits, read as a signed value, falls in the range `0` to `<ea>` inclusive — the classic use is validating an array index before using it:

```asm
        MOVE.W  D3,D0      ; candidate index, computed earlier
        CHK     #99,D0     ; valid range 0-99 (100-entry array)
; only reached if D0 was in 0..99 - safe to use as an index below
        LEA     TABLE,A0
        MOVE.W  (A0,D0.W),D1  ; safe: D0 passed the bounds check
```

Two ways to fail, and `N` tells you which one happened right before the exception fires:

- **`Dn` is negative** — `N` is set to `1`.
- **`Dn` is greater than the bound** — `N` is cleared to `0`.

Either failure raises the [CHK exception](#exceptions) (vector `$48`) instead of falling through to the next instruction — same mechanism as `DIVU`/`DIVS`'s Zero Divide, just a different vector. When `Dn` is in range, execution just continues and `N` is left exactly as it was; `Z`, `V`, and `C` are undefined on real 68000 hardware in every case, so this emulator leaves them untouched too rather than picking an arbitrary value for them.

`An` direct isn't a valid `<ea>` here — there's no such thing as bounds-checking against an address register — so it raises the [Illegal Instruction exception](#exceptions) instead, the same restriction `BTST` has on its destination.

The `10`/`40` cycle split isn't arbitrary: `10` is just the cost of fetching and comparing, in range or not. The other `30` cycles only get spent when `CHK` actually traps — the same exception-stacking work (pushing the return state, reading the vector, jumping to the handler) every other exception here pays for. That work alone, with nothing to check first, is exactly what `TRAP`/`ILLEGAL`'s flat `34` cycles, and `TRAPV`'s `34`-cycle trap-taken case, already charge for.

### How does MOVEM's register list work?

`MOVEM` moves any subset of the 16 registers (`D0`-`D7`, `A0`-`A7`) to or from memory in one instruction. The register list — written as a range/list like `D0-D2/A0`, meaning `D0`, `D1`, `D2`, and `A0` — gets packed into a 16-bit bitmask, one bit per register, that follows the opcode word. (The assembler builds that bitmask for you from the written list; for `-(An)` stores it reverses the bit order automatically.)

Which addressing modes are valid depends on which direction the data is moving:
- **Register list → memory** (`MOVEM.size list,dst`): the [control addressing modes](#which-addressing-modes-can-jsr-target) `JSR`/`LEA`/`PEA` use, plus predecrement (`-(An)`).
- **Memory → register list** (`MOVEM.size src,list`): the same control addressing modes, plus postincrement (`(An)+`).

`Dn`, `An` direct, and `#imm` are never valid — there's no single register or constant to move a whole register list to or from.

Two quirks worth knowing before hand-encoding one:
1. **Predecrement reverses the bit order.** For every addressing mode except `-(An)`, bit 0 of the mask is `D0` and bit 15 is `A7`. But `-(An)` decrements the address *before* each store, filling memory backward — so to keep the lowest address holding the lowest-numbered register (matching normal reading order), the bit order flips too: bit 0 becomes `A7`, bit 15 becomes `D0`. A real assembler handles this automatically from the `list,-(An)` syntax; hand-encoding it means reversing the bits yourself.
2. **Word-size loads sign-extend.** `MOVEM.W src,list` sign-extends each 16-bit value it reads to the full 32 bits of its register — unlike `MOVE.W`, which only overwrites the low word and leaves the high word alone. `MOVEM.W list,dst` (storing) just writes each register's low 16 bits, no extension involved.

**Cycles**: `8 + 4n` (register→memory, word) / `8 + 8n` (long); `12 + 4n` (memory→register, word) / `12 + 8n` (long) — `n` is the number of registers actually transferred, not 16.

### How does MOVEP transfer alternating bytes?

`MOVEP` moves data between `Dx` and a byte-oriented peripheral wired onto the 68000's 16-bit data bus at every *other* address — a hardware detail this emulator doesn't need to model (it's flat byte-addressable memory), but the instruction still transfers the bytes in the same order and positions real hardware would, in case a program relies on it.

Starting at `(d16,Ay)`, it reads/writes one byte, steps the address by `2`, reads/writes the next byte, and so on — `2` (`.W`) or `4` (`.L`) bytes total, most-significant byte first:

```
        MOVEP.L D0,$0(A0)
; byte 0 (D0 bits 31-24) -> Memory[A0+0]
; byte 1 (D0 bits 23-16) -> Memory[A0+2]
; byte 2 (D0 bits 15-8)  -> Memory[A0+4]
; byte 3 (D0 bits 7-0)   -> Memory[A0+6]
```

`.W` only ever touches `Dx`'s low 16 bits — loading leaves the high word alone (same merge rule a plain word `MOVE` into `Dn` follows), storing only reads the low word out.

Unlike every other data-movement instruction, there's no addressing-mode field to pick from: `(d16,Ay)` is the only form `MOVEP` supports, always with a displacement (even `$0`, as above) — there's no `(An)`-only shorthand.

### How does the memory-operand shift and rotate form work?

Every `ASL`/`ASR`/`LSL`/`LSR`/`ROL`/`ROR`/`ROXL`/`ROXR` in [Shift and Rotate](#shift-and-rotate) above also has a second form that shifts/rotates a memory `<ea>` directly instead of a `Dn` — always by exactly one bit (there's no room left in the opcode for a count once `<ea>` is encoded), and word-sized only (same reason — no size field left either).

Valid `<ea>`: `(An)`, `(An)+`, `-(An)`, `d16(An)`, `d8(An,Xn)`, `xxx.W`, or `xxx.L` — anything except `Dn`, `An` direct, `#imm`, or a PC-relative address (see [Addressing Modes](#addressing-modes)). `Dn` and `An` both raise the [Illegal Instruction exception](#exceptions) here: shifting a `Dn` is what the register form above is for, and there's no such thing as shifting an address register.

**Cycles**: 8, flat, regardless of addressing mode.

**Example** — shift a value already sitting in memory, without loading it into a register first:

```
        ASL     (A0)                ; Memory[A0] <<= 1, in place
```

### How does rotating through X differ from a plain rotate?

`ROXL`/`ROXR` rotate through the `X` flag instead of leaving it out of the loop the way `ROL`/`ROR` do — the bit that gets rotated out becomes the new `X` (and `C` — the two always end up equal here), but the bit that rotates back *in* is whatever `X` held *before* the instruction ran, not the bit that just left. A `ROL`/`ROR` never has this extra step: the outgoing bit wraps straight back in on its own.

One consequence worth knowing: a rotate count of `0` (only possible with the `Dx,Dn` form) still sets `C` to `X`'s value. Every other instruction in this family either leaves `C`/`X` alone (`ASL`/`ASR`/`LSL`/`LSR`) or clears `C` (`ROL`/`ROR`) when nothing actually shifted — `ROXL`/`ROXR` are the one case where "nothing shifted" still changes a flag.

**Example** — the same rotate, with and without `X`:

```
; D0 = %0000_0010, X = 1
        ROL     #1,D0        ; -> %0000_0100 (bit 7 wraps in)
; ...reset D0 to %0000_0010...
        ROXL    #1,D0        ; -> %0000_0101 (old X wraps in)
```

### Why doesn't this emulator implement RTE/STOP/RESET/MOVE SR?

Real 68000 hardware has two privilege levels, user and supervisor,
controlled by a bit in the Status Register (`SR`) — a 16-bit register
this emulator only partially models. `SR`'s low byte is the
[Status Flags](#status-flags) every arithmetic/logic instruction on this
page reads or sets (`N`/`Z`/`V`/`C`, plus `X`). `SR`'s high byte — the
supervisor bit, an interrupt priority mask, a trace bit — doesn't exist
here at all, and neither does the separate supervisor stack pointer
(`SSP`) real hardware switches to alongside it: raising an
[exception](#exceptions) here only ever pushes `PC`, onto the one stack
there is, `A7`.

That's a deliberate simplification, not an oversight: supervisor mode
exists to protect a multi-program OS kernel from untrusted user code
sharing one CPU. This emulator runs one program at a time with nothing to
protect it from, so the privilege boundary has no job to do here.
Concretely, that rules out:

- `MOVE to SR`, `MOVE USP` — genuinely privileged on real hardware, and
  there's no separate `USP` register to move either.
- `STOP` — loads an immediate into `SR` (interrupt mask included) before
  halting; the "immediate into `SR`" part has no home.
- `RESET` — pulses a hardware reset line to external peripherals; there's
  no peripheral bus to reset.
- `RTE` — pops `SR` and `PC` off the supervisor stack, possibly returning
  to user mode; this emulator's exceptions only ever push `PC`, so
  there's no `SR` for `RTE` to pop either.

`ILLEGAL` and `TRAPV` don't touch any of this — both are just alternate
ways to *raise* an exception, through the exact same `PC`-only mechanism
every other exception on this page already uses.

**Correction worth being explicit about:** `MOVE from SR` and `MOVE to
CCR` are *not* privileged on the real MC68000 this emulator targets —
`MOVE from SR` only became privileged starting with the 68010, and `MOVE
to CCR`/`RTR` were never privileged at all. Both are implemented now
(as `MOVE SR` and `MOVE to CCR` in the [Data Movement](#data-movement)
table above), along with `CMPM` (see [Arithmetic](#arithmetic)),
`RTR` (see [Program Control](#program-control)), and
`ADDI`/`SUBI`/`ANDI`/`ORI`/`EORI`/`CMPI`/`ADDX`/`SUBX`/`NEGX` (see the
[Arithmetic](#arithmetic)/[Logical](#logical) tables), and
`ANDI`/`ORI`/`EORI`'s own `#imm,CCR` special-case sub-forms (three fixed
opcodes, e.g. `ORI #imm,CCR` at `$003C` — see `ANDI to CCR`/`ORI to
CCR`/`EORI to CCR` in the [Logical](#logical) table) — every ordinary
instruction that was ever on this page's gap list.

**One more correction:** an earlier version of this section also listed
`MOVE from CCR` as missing — that instruction doesn't exist on the real
MC68000 at all. Motorola only added it in the 68010, to give user
programs a way to read the flags after `MOVE from SR` became privileged
there. Nothing to implement.

`ANDI`/`ORI`/`EORI #imm,SR` (the privileged sibling of the now-implemented
`#imm,CCR` forms) remains a genuine gap, alongside `MOVE to SR` above.
Hand-encoding one today doesn't do anything meaningful — with no
dedicated opcode entry of its own, it reaches `ANDI`/`ORI`/`EORI`'s own
general form (no longer silently `MOVE`, that bug is fixed), which then
throws a generic error instead of raising a catchable exception.

### Worked Examples

Small programs to read alongside the instruction tables. All of them assemble. For complete, runnable programs, see the [Example Programs](./EXAMPLES.md).

**Example** — add two numbers and write a white pixel, using a direct absolute address:

```
        MOVE.L  #100,D0
        MOVE.L  #200,D1
        ADD.L   D1,D0                ; D0 = 300
        MOVE.L  #$FFFFFF,$40000     ; first pixel = white
        TRAP    #0                    ; exit
```

**Example** — a countdown loop using `MOVEQ`, `SUB`, `CMP`, and `Bcc`:

```
        MOVEQ   #5,D0             ; D0 = 5 (loop counter)
LOOP:
        MOVEQ   #1,D1
        SUB.L   D1,D0             ; D0 -= 1
        CMP.L   #0,D0
        BNE     LOOP               ; keep looping while D0 != 0
        TRAP    #0                 ; exit
```

*(Labels like `LOOP:` are handled by the assembler, which turns each `Bcc` target into the right byte offset for you. You can paste these snippets into the Editor and run them.)*

**Example** — the same countdown, more idiomatically, using `DBRA`:

```
        MOVEQ   #4,D0             ; D0 = 4 (see gotcha below)
LOOP:
        ADD.W   #1,D1       ; (loop body - whatever it's for)
        DBRA    D0,LOOP           ; D0--, loop unless D0 hits -1
        TRAP    #0                 ; exit
```

`DBRA` folds the decrement, the comparison, and the branch into one instruction — this is the loop `SUB.L`/`CMP.L`/`BNE` above builds by hand, in the form real 68000 code almost always uses instead. The classic gotcha, and the reason this loads `4` where the `Bcc` version above loaded `5`: the body always runs once *before* the first decrement, and the loop only stops once `Dn` has been decremented all the way to `-1`. So for the body to run exactly `N` times, `Dn` has to start at `N - 1`, not `N` — starting it at `5` here would run the body 6 times, not 5.

**Example** — calling a subroutine with `JSR`/`RTS` (again with a label, `DOUBLE:`):

```
        MOVEA.L #DOUBLE,A0        ; A0 = address of the subroutine
        MOVEQ   #21,D0
        JSR     (A0)               ; D0 *= 2, then returns here
        TRAP    #0                 ; exit

DOUBLE:
        ADD.L   D0,D0              ; D0 += D0
        RTS                        ; back to the caller
```

**Example** — saving and restoring registers around a subroutine call with `MOVEM`, so `DOUBLE` is free to use `D1` and `A0` as scratch without disturbing the caller's:

```
        MOVEQ   #1,D1
        MOVEA.L #$1000,A0
        MOVEM.L D1/A0,-(A7)       ; push D1,A0 (see above)
        MOVEA.L #DOUBLE,A0
        MOVEQ   #21,D0
        JSR     (A0)       ; D0 *= 2; free to clobber D1/A0
        MOVEM.L (A7)+,D1/A0       ; restore, same order pushed
        TRAP    #0                 ; exit

DOUBLE:
        ADD.L   D0,D0
        RTS
```

## TRAP System Calls

A `TRAP #n` instruction is a *software interrupt*: unlike `JSR`/`BSR`,
which jump to an address you choose, `TRAP #n` jumps to one of 16
fixed, numbered entry points (`n` = `0`-`15`, encoded right in the
instruction itself) — think of it as calling a small built-in
"operating system" routine by number instead of by address. On real
68000 hardware this mechanism is a blank slate: Motorola reserved the
16 vectors but assigned none of them a fixed job, so what `TRAP #5`
(say) actually did depended entirely on whichever OS or ROM a given
machine ran. Here, each of the 9 implemented vectors (`#0`-`#8`) has
one fixed, documented job — this table is effectively this emulator's
own tiny "operating system calls" list.

Like any instruction that isn't a branch (`Bcc`, `JMP`, `JSR`...),
`TRAP #n` doesn't redirect execution anywhere: once it's done, the CPU
simply moves on to whatever comes right after it in memory — the
instruction written on the next line, unless a label or jump says
otherwise. `TRAP #0` (halt) is the only exception, since it stops the
CPU outright instead.

| Vector | Syntax | Cycles | Description |
|---|---|---|---|
| `#0` | `TRAP #0` | 4 | Halts the CPU (ends the program). |
| `#1` | `TRAP #1` | 4 | Draws the null-terminated ASCII string at `A0` at pixel (`D0`, `D1`) in the `D2` color. See [Printing Text with TRAP #1](#printing-text-with-trap-1) below. |
| `#2` | `TRAP #2` | 4 | Reads the pixel at the framebuffer address in `A0` into `D0` (32-bit RGBA). See [Addressing a Pixel for TRAP #2/#3](#addressing-a-pixel-for-trap-23) below. |
| `#3` | `TRAP #3` | 4 | Writes `D0` (32-bit RGBA) as the pixel at the framebuffer address in `A0`. |
| `#4` | `TRAP #4` | 4 | Fills every one of the 64,000 framebuffer pixels with `D0` (32-bit RGBA) — clears the screen to any solid color, not just black. |
| `#5` | `TRAP #5` | 4 | Loads the controller button bitmask into D0 — a shortcut for reading `$7E800` directly. See [Reading the Gamepad](#reading-the-gamepad) above. |
| `#6` | `TRAP #6` | 4 | Writes D0 (frequency), D1 (duration), D2 (volume), D3 (waveform) into the [sound registers](#sound) and sets the trigger byte. |
| `#7` | `TRAP #7` | 4 | Pauses the program for `D0` milliseconds (word) — not `D1`, unlike `TRAP #6`'s duration field. See [Waiting with TRAP #7](#waiting-with-trap-7) below. |
| `#8` | `TRAP #8` | 4 | Pops the next queued keyboard character into `D0` (0 if none pending). See [Reading the Keyboard with TRAP #8](#reading-the-keyboard-with-trap-8) below. |

### Addressing a Pixel for TRAP #2/#3

`TRAP #2` (read pixel) and `TRAP #3` (write pixel) take a framebuffer *byte address* in `A0`, not `x`/`y` coordinates, so compute it yourself first. The framebuffer starts at `$40000` (see the [Memory Map](#memory-map)), each row is 320 pixels, and each pixel takes 4 bytes, so the address of pixel `(x, y)` is:

```
address = $40000 + (y * 320 + x) * 4
```

For example, to write a white pixel at `(50, 10)`:

```asm
        MOVE.L  #10,D0          ; y
        MULU.W  #320,D0
        ADD.L   #50,D0          ; + x
        ASL.L   #2,D0           ; * 4 bytes/pixel
        ADD.L   #$40000,D0
        MOVE.L  D0,A0
        MOVE.L  #$FFFFFFFF,D0   ; white
        TRAP    #3              ; write it
```

### Printing Text with TRAP #1

`A0` points at a *null-terminated* string - ASCII bytes followed by a
`0` byte that marks the end (the same convention as C strings). `D0` is
the x pixel and `D1` the y pixel of the first character's top-left
corner, and `D2` is the 32-bit RGBA text color.

Every character is an 8x8 pixel cell, so the next one starts 8 pixels to
the right. A newline byte (`$0A`) drops to the next line, back at x = 0.
Text that would run past the right edge wraps to the next line by
itself. Only the letter shapes are drawn; the pixels behind them are
left as they were. Bytes outside `$20`-`$7E` draw nothing.

There is no scrolling: drawing past the bottom of the screen (or at a
negative position) stops the program with an error.

`TRAP #2`/`#3` take a framebuffer address, not `x`/`y`: see
[Addressing a Pixel for TRAP #2/#3](#addressing-a-pixel-for-trap-23)
above.

### Waiting with TRAP #7

The real MC68000 has no delay instruction and no TRAP reserved for one -
`TRAP #n` on real hardware is a bare software interrupt, and Motorola
never assigned any of the 16 vectors a fixed meaning. Machines built
around it got precise pauses either from a busy-wait loop hand-timed to
the CPU's clock speed, or from a separate hardware timer chip. `TRAP #7`
is a deliberate addition specific to this emulator, not a real 68000
facility, to spare a program written here from either of those.

`D0` (word) is the delay in milliseconds - up to 65,535 (about 65
seconds); call it again for longer pauses. **Careful: that's `D0`, not
`D1`** - easy to mix up with `TRAP #6` (see the [sound
registers](#sound)), whose duration field is `D1` (`D0` there is
frequency). Leaving `D0` at
whatever it held from an earlier instruction, instead of loading the
delay into it, silently waits for that leftover value instead of the
one you meant:

```asm
        MOVE.W  #500,D0    ; 500 ms
        TRAP    #7
```

`TRAP #7` itself still executes instantly and the CPU still moves on
to the next instruction right away, exactly like every other `TRAP` -
it doesn't sit "inside" the delay. What differs is *when* that next
instruction actually runs: the debugger's three ways of running a
program treat the pending delay differently:

- **Run** honors it for real: the program genuinely pauses for the
  requested duration before the next instruction executes.
- **Pause**, hit while a delay is in progress, freezes it along with
  everything else - resuming Run later continues counting down from
  wherever it was, not from the moment `TRAP #7` was first reached.
- **Step** always resolves a pending delay instantly. Single-stepping
  means *you* are setting the pace already, so a `TRAP #7` never blocks
  a Step click - the next click just moves straight on to the following
  instruction.

### Reading the Keyboard with TRAP #8

Every key you type is captured by the emulator and queued (up to 16
characters - typing faster than your program reads them just means it
catches up later; the 17th character typed before that happens is
dropped rather than growing the queue further). `TRAP #8` pops the
*oldest* queued character into `D0`, or loads `D0` with `0` if nothing
is waiting - call it in a loop each frame and keep reading while `D0`
is nonzero to drain everything that piled up. `D0` is written as a full
32-bit long, zero-extended (`$000000xx`, never leftover garbage in the
upper three bytes from an earlier instruction) - a plain `CMPI.L #0,D0`
or `CMPI.B #0,D0` both work to test "nothing pending".

Only two ranges of characters are recognized: visible ASCII
(`$20`-`$7E` - letters, digits, punctuation, space) and the accented
Latin-1 characters (`$A0`-`$FF` - `é`, `à`, `ñ`, `¿`, `¡`, and similar).
Anything else you press - Enter, Backspace, arrow keys, function keys,
modifier keys, or a character outside both ranges (the Euro sign `€`
and the French `œ` ligature, for instance, fall outside Latin-1) - is
silently ignored and never queued. This is deliberate: `TRAP #8` hands
your program raw characters, nothing more. If you want a real line
editor - reading a name, letting the player correct a typo with
Backspace - that logic (what Backspace does, where the cursor is, when
the line is "done") is entirely up to your program to build out of the
characters `TRAP #8` gives it; the emulator doesn't impose one.

Unlike every other `TRAP` in this table, there's no plain-memory
equivalent for `TRAP #8` — reading the queue has a side effect (it
removes the character), and giving that to a raw address would mean
the debugger's read-only Memory Inspector could silently consume
keystrokes just by displaying that address. `TRAP #8` is the only way
to read it.

**Example** — testing for a specific key, both cases: a source-code
`'A'`/`'a'` is just a number (its ASCII code, `65`/`97` - see
[Source Layout](#source-layout)), so comparing `D0` against one is an
ordinary `CMPI`:

```asm
        TRAP    #8          ; D0 = next key (0 if none pending)
        CMPI.B  #'A',D0     ; uppercase A?
        BEQ     GOT_A
        CMPI.B  #'a',D0     ; lowercase a?
        BEQ     GOT_A
```

Every letter's uppercase and lowercase codes differ by exactly `$20`
(bit 5) - `A` is `$41`, `a` is `$61` - so once you have several letters
to fold together, clearing that bit first is shorter than a pair of
`CMPI`s per letter:

```asm
        TRAP    #8
        ANDI.B  #$DF,D0     ; clear bit 5: force uppercase
        CMPI.B  #'A',D0     ; only need to test the one case now
        BEQ     GOT_A
```

`ANDI.B #$DF,D0` only touches the byte the letter lives in, exactly like
the `CMPI.B` above - safe precisely because `D0`'s upper three bytes are
always zero after `TRAP #8`, per the width note above.

Typing is captured everywhere in the app except while your cursor is in
the code editor or another text field - no need to click the Screen
panel first.

## Exceptions

Different from a `TRAP #n` a program calls on purpose: an exception is
something the CPU raises *on its own* when an instruction hits a fault it
can't just set a flag for. Only genuinely reserved/invalid encodings and
runtime faults raise one — never an instruction this emulator simply
hasn't implemented yet, which would run fine on real hardware.

| Vector | Address | Raised by | Description |
|---|---|---|---|
| Zero Divide | `$40` | `DIVU`/`DIVS` with a zero divisor | Jumps to the handler address stored at `$40`. |
| Illegal Instruction | `$44` | `MOVE.B` to an address register; `BTST`/`CHK`/`CLR`/`NEG`/`NOT`/`TST`/`ADDI`/`SUBI`/`ANDI`/`ORI`/`EORI`/`CMPI` targeting one; `ILLEGAL` | Jumps to the handler address stored at `$44`. Every cause but the last is a reserved/undefined encoding on real 68000 hardware, not a missing feature; `ILLEGAL` raises this same one deliberately — see [System](#system) above. |
| CHK | `$48` | `CHK`'s bounds check failing (`Dn < 0` or `Dn >` the upper bound) | Jumps to the handler address stored at `$48`. See [CHK](#program-control) above. |
| TRAPV | `$4C` | `TRAPV` executed with `V` set | Jumps to the handler address stored at `$4C`. See [System](#system) above. |

Your program installs a handler by writing its address into the vector
*before* the fault can happen:

```
        MOVEA.L #$40,A0           ; the Zero Divide vector
        MOVE.L  #HANDLER,(A0)     ; install the handler
        ...
        DIVU.W  D1,D0        ; D1 = 0 -> jumps to HANDLER
```

Real 68000 hardware pushes the status register and PC onto a *supervisor*
stack on any exception; this emulator has no supervisor-mode/status
register concept, so only PC is pushed — onto `A7`, exactly like `JSR`.
So a handler ends with `RTS`, not the real `RTE`, to resume right after
the faulting instruction — see
[above](#why-doesnt-this-emulator-implement-rtestopresetmove-sr) for why
`RTE` itself, and the rest of the real 68000's system/privileged group,
aren't implemented here. If no handler was installed when the fault
happens, the emulator throws a clear error instead of jumping to address
`$0` the way real (misconfigured) hardware would.

## Inspecting Memory

The Debugger panel ends with a **Memory** section: a read-only hex dump of 128 bytes, 8 per row. Each row shows its address, the 8 bytes in hexadecimal, then the same bytes as ASCII text (a dot for anything unprintable). It opens on `$2000`, where programs are loaded.

- Type an address (`2000`, `$2000` or `0x2000`) and press Enter to jump there, or use the ◀ / ▶ buttons to move one page.
- The shortcut buttons jump to PC (the next instruction), Stack (where `A7` points), Program, Screen (the framebuffer), Input and Sound (the memory-mapped registers).
- Bytes your program just wrote are highlighted in red, and the byte at PC has a yellow outline.
- "Follow writes" (on by default) moves the window to the last address written each time you Step or Pause, so you don't have to hunt for it. It stays still while the program runs, and turns itself off when you navigate by hand; tick it again to resume.

### Editing a byte

Click a byte to edit it: it turns into a two-digit hexadecimal field, already selected. Type the new value and press Enter to store it; the field then opens on the next byte, so to type a run of values you just alternate value and Enter (`FF`, Enter, `FF`, Enter…). After the last byte of the 128 shown, editing simply stops. Escape (or clicking elsewhere) cancels, and a field that is not valid hexadecimal (shown with a red outline) is refused.

- Editing works while the program is paused or stepping, and is switched off while it runs: the program would be overwriting memory thousands of times per frame, and your value would be lost or would corrupt whatever the program was using.
- A byte you edit by hand is not highlighted as a write by the program, and "Follow writes" does not jump to it.
- Editing a byte of the screen area repaints the screen immediately, but a single byte is hard to see: a pixel is 4 bytes (red, green, blue, alpha, in that order, starting at `$40000`) and the screen has 64,000 of them, so one byte changes one colour component of one pixel. The alpha byte has no visible effect (the screen has no transparency). To see something, set all four bytes of a pixel: click its first byte, then type `FF`, Enter, `FF`, Enter, `FF`, Enter, `00`, Enter. That makes one white pixel (red, green and blue at full, alpha ignored). Each row of the dump holds two pixels.
- Nothing is protected: you can edit the bytes of the program itself, which patches it on the fly. The source shown in the editor then no longer matches what executes.
- Edits are lost when the program is loaded again: with Reset, or with the first Step or Run after a change to the source. An edit made before that first Step or Run is therefore wiped as soon as the program loads. Edit once the program has started (after one Step, for instance).
- Bytes only: to change a 16-bit or 32-bit value, edit each of its bytes. The 68000 stores the most significant byte first (big-endian), so `$1234` is the bytes `12` then `34`.

## Writing Assembly Source

The assembler turns a text file of instructions into the machine code the CPU runs. The Debugger runs it for you: when you press Run or Step, your source is assembled (again only if it changed) and loaded into memory.

A tiny program:

```asm
        ORG     $2000          ; where the program is placed
START:                         ; a label: a name for this address
        MOVE.L  #100,D0        ; D0 = 100
        ADD.L   #5,D0          ; D0 = 105
        TRAP    #0             ; exit
        END     START          ; run from START
```

### Source Layout

- A **label** names an address, so that a branch can say "go to LOOP" instead of counting bytes. It is a word starting in column 0, or any word ending in `:`.
- A **directive** is a command to the assembler itself (such as `ORG`), not a CPU instruction.
- Comments start with `;` (or `*` in column 0).
- Mnemonics, registers and directives are case-insensitive; labels are case-sensitive.
- Numbers: `123`, `$FF` (hex), `%1010` (binary), `'A'` (character code).
- Expressions combine numbers and labels with `+` and `-` only.
- Operands: `D0`-`D7`, `A0`-`A7` (`SP` means `A7`), `(A0)`, `(A0)+`, `-(A0)`, `4(A0)`, `#5`, and a bare address or label. `MOVEM` also takes a register list such as `D0-D2/A0`.
- A bare address or label is always stored as a 4-byte address.
- An instruction must sit at an even address (the 68000 reads instructions two bytes at a time); put `EVEN` before it after odd-sized data.

For example, the text `"Hi",0` is 3 bytes, so whatever follows lands on an odd address. `EVEN` adds one zero byte of padding to fix that:

```
MSG:    DC.B    "Hi",0      ; 3 bytes: next address is odd
        EVEN                ; adds 1 padding byte: now even
START:  MOVE.L  #1,D0       ; OK: even address
```

Without the `EVEN` line, the assembler stops with "Instruction at an odd address".

### Editor Shortcuts

| Keys | Effect |
|---|---|
| `Tab` | Inserts spaces up to the next column that's a multiple of 8 (replaces the selection, if any) — lines up labels/mnemonics/operands the same way the examples do. |
| `Shift+Tab` | Removes up to 8 leading spaces from the current line. |
| `Enter` | Starts the new line with the same leading spaces as the current one. |
| `Ctrl+Z` (`Cmd+Z` on macOS) | Undo. |
| `Ctrl+Y` or `Ctrl+Shift+Z` (`Cmd+Shift+Z` on macOS) | Redo. |
| `Ctrl+O` (`Cmd+O` on macOS) | Open a file (same as the toolbar's **Open…**). |
| `Ctrl+S` (`Cmd+S` on macOS) | Save to the current file. Disabled (button greyed out, shortcut does nothing) when there isn't one — an example or the built-in starter program was never saved anywhere, so only **Save As…** is available until you pick a location. |
| `Ctrl+Shift+S` (`Cmd+Shift+S` on macOS) | Save As… — always asks for a location. |
| Right-click a line number, or `Ctrl+B` | Toggle a bookmark. |
| `F2` / `Shift+F2` | Jump to the next / previous bookmark. |

Undo/redo is the app's own history, not the browser's native text field undo (the desktop build doesn't deliver `Ctrl+Z`/`Ctrl+Y` to that one at all) — **Undo**/**Redo** buttons in the toolbar do the same thing for a mouse, greyed out whenever there's nothing to undo/redo. It only covers edits since the source was last loaded — opening a file or picking an example both start a fresh history. The Debugger's Reset button only resets the CPU and memory, not the source, so it doesn't affect undo/redo.

Opening a file or loading an example discards the current buffer, so both ask for confirmation first if it has unsaved changes — including when you've edited and then undone your way back to exactly the original content, since that discards the redo history too.

### Directives

| Directive | Effect |
|---|---|
| `ORG addr` | Places the following bytes at `addr` (default `$2000`). |
| `END [label]` | Ends the source; the label is where execution starts. |
| `DC.B/W/L a, b` | Stores constants; `DC.B` also accepts `"text"`. |
| `DS.B/W/L n` | Reserves `n` zeroed bytes, words or long words. |
| `EQU expr` | Makes the line's label a constant, not an address. |
| `EVEN` | Adds one zero byte if the address is odd. |

### Branch Sizes

A **branch** is an instruction that makes the CPU continue somewhere other than the next instruction: `BRA` (always), `Bcc` (only if a condition holds, e.g. `BNE`, `BEQ`), `BSR` (like `JSR`: remember where to come back to), and `DBcc` (a loop counter). You give it a **label** as the target, and the assembler works out the rest.

What the assembler actually stores in the instruction is not the label's address but a **distance**: how many bytes forward (positive) or backward (negative) the target is, measured from the address just after the branch's first word. Storing a distance, rather than an address, is what lets the same code run wherever it is loaded. The instruction has room for that distance in one of two sizes, which you can pick with a suffix on the mnemonic:

| Suffix | Distance stored in | Reaches | Instruction size |
|---|---|---|---|
| `.S` (short) | 8 bits | -128 to +127 bytes, but not 0 | 2 bytes |
| `.W` (word, the default) | 16 bits | -32768 to +32767 bytes | 4 bytes |

```
LOOP:   SUBQ.L  #1,D0
        BNE.S   LOOP        ; close target: short form is enough
        BRA     FAR_AWAY    ; no suffix = .W, reaches much farther
```

Rules worth knowing:

- **No suffix means `.W`**, which is always the safe choice; `.S` only saves two bytes.
- **Too far is an error**, not a silent mistake: `BNE.S` to a label 200 bytes away reports a "displacement out of range" error. Change it to `BNE.W` (or drop the suffix). The assembler never switches sizes on your behalf.
- **`.S` cannot branch to the very next instruction** (a distance of 0 would be read as "a 16-bit distance follows"); use `.W` or just remove the branch.
- **`DBcc` has no suffix**: its distance is always 16 bits.
- **`JMP` and `JSR` are not branches** in this sense: they take a full address, so distance never limits them.

### Assemblable Instructions

Every real mnemonic is assemblable. `CCR` and `SR` are accepted as operands only where they make sense: `MOVE <ea>,CCR`, `MOVE SR,<ea>` and `ANDI`/`ORI`/`EORI #imm,CCR`. `MOVE <ea>,SR` and the other privileged instructions are not part of this emulator.

| Category | Mnemonics |
|---|---|
| Data Movement | `MOVE`, `MOVEA`, `MOVEQ`, `MOVEM`, `MOVEP`, `LEA`, `PEA`, `EXG`, `SWAP`, `EXT` |
| Arithmetic | `ADD`, `SUB`, `CMP`, `ADDA`, `SUBA`, `CMPA`, `ADDI`, `SUBI`, `CMPI`, `ADDQ`, `SUBQ`, `ADDX`, `SUBX`, `CMPM`, `CLR`, `TST`, `NEG`, `NEGX`, `MULU`, `MULS`, `DIVU`, `DIVS`, `ABCD`, `SBCD`, `NBCD` |
| Logical | `AND`, `OR`, `EOR`, `ANDI`, `ORI`, `EORI` (also `#imm,CCR`), `NOT`, `Scc` |
| Bit Manipulation | `BTST`, `BCHG`, `BCLR`, `BSET`, `TAS` |
| Shift and Rotate | `ASL`, `ASR`, `LSL`, `LSR`, `ROL`, `ROR`, `ROXL`, `ROXR` |
| Branches | `BRA`, `BSR`, `Bcc` (all conditions), `DBcc`, `DBRA` |
| Subroutine Control | `JMP`, `JSR`, `RTS`, `RTR`, `LINK`, `UNLK` |
| System | `NOP`, `TRAP`, `TRAPV`, `CHK`, `ILLEGAL` |

### Assembler Limits

- A label defined by `EQU` must appear before it is used, and `ORG` and `DS` counts cannot use labels defined later.
- `DC` values must fit their width (`DC.B` accepts -128..255) and `DC.W`/`DC.L`/`DS.W`/`DS.L` must sit at an even address (put `EVEN` before them); a size suffix the mnemonic cannot take (`NOP.L`, `MULU.L`) is an error.
- `d(PC)` and `d(PC,Xn)` take the target label as `d` (e.g. `LEA table(PC),A0`); the assembler works out the distance. They are source-only, and `BTST #n,d(PC)` is not assemblable.
- Errors are reported all at once as a list of line, column and message.

## Assembly Programming Tips

### Declaring data: DC.B, DC.W, DC.L

On real 68000 assemblers, `DC.B`, `DC.W`, and `DC.L` ("Define Constant") reserve space in memory and fill it with fixed values at assembly time — the usual way to embed a lookup table, a string, or any other static data alongside the code, e.g.:

```asm
ARRAY:
        DC.L    10, 20, 30, 40, 50   ; five longs, back to back
MESSAGE:
        DC.B    "HI",0                 ; bytes: 'H', 'I', 0
```

The assembler accepts `DC.x` (see [Writing Assembly Source](#writing-assembly-source)). An alternative is building the data at *runtime*: pick an address, then write each value into it with its own `MOVE`, stepping the address with [`(An)+`](#addressing-modes) the same way a program would read the data back out later. The memory ends up holding exactly the same bytes.

### Tips

A few habits worth having, some of them straight from gotchas this emulator's own opcodes hit during development:

- **Initialize every register before reading it.** Nothing clears `D0`-`A7` to a known value automatically — a register holds whatever was last written to it (they do start at `0`, but don't rely on that once a program is running).
- **`CMP` first, `Bcc` second, and pick the right family.** Mixing up signed and unsigned comparisons is the classic bug — see [Which Bcc do I want?](#which-bcc-do-i-want) if a branch seems to go the wrong way.
- **`DBcc`/`DBRA` loop counters start at `N - 1`, not `N`.** The loop body always runs once before the first decrement — see [How does DBcc decide?](#how-does-dbcc-decide) for the full walk-through; it's an easy off-by-one to trip over.
- **Save what a subroutine will clobber, restore it before returning.** [`MOVEM`](#how-does-movems-register-list-work) pushing onto `-(A7)` at the top and popping from `(A7)+` at the bottom is the standard pattern — see its worked example above.
- **`MOVEA`/`ADDQ`/`SUBQ` to an address register never touch the flags**, and are always a full 32-bit operation regardless of the size field — real 68000 behavior, easy to forget if a flag check right after one comes back stale.
- **Prefer `MOVEQ` for small constants (`-128` to `127`)** into a data register — it's the same 4 cycles as `MOVE.L #imm,Dn` but a shorter encoding, and shifts (`ASL`/`LSL`, etc.) are a cheap way to multiply or divide by a power of two instead of reaching for `MULU`/`DIVU`.
- **Comment the *why*, not just the *what*, even in illustrative examples.** Every worked example on this page does — it's what makes a hand-traced instruction sequence checkable later.

## Running a Program

The interface is available in English, French and Spanish. It starts in your browser's or system's language (English if that isn't one of the three); change it with the **Language** list under the gamepad, and the choice is remembered. This guide names the controls by their English labels. The toolbar above the registers has four controls:

- **Run / Pause** (*Exécuter* / *Ejecutar* in French / Spanish) starts or stops continuous execution. Run also stops by itself on a breakpoint (see [My breakpoint is ignored](./TROUBLESHOOTING.md#my-breakpoint-is-ignored)), a runtime error, or the program's exit.
- **Step** (*Pas à pas* / *Paso*) executes exactly one instruction, ignores breakpoints, and is only available while the program is paused.
- **Reset** (*Réinitialiser* / *Reiniciar*) puts the CPU back to its initial state.
- **Speed** (*Vitesse* in French, *Velocidad* in Spanish) is the drop-down list (`10`, `200`, `2000` or `20000` instructions per refresh). It sets how many instructions Run executes per *refresh*. A refresh is one redraw of the screen: the emulated screen is repainted about 60 times per second on a typical display, and between two repaints the CPU runs the chosen number of instructions. Hovering the list, or clicking the **?** button between the label and the list (the way to do it on a touch screen), shows this explanation.

At the default `2000 instructions per refresh`, that is about 120,000 instructions per second. `10` gives about 600 per second, slow enough to follow a program by eye, and `20000` about 1.2 million per second, for long computations. Speed only changes how fast the program runs on screen, never what it computes, and it has no effect on Step.

The screen is repainted once per refresh, so a low Speed also makes a drawing program appear pixel by pixel. Speed does not change the cycle counter, which counts the emulated CPU's instructions, not real time (see [Performance Notes](#performance-notes)).

## Performance Notes

- **Simple interpretation, no recompilation**: each instruction is fetched, decoded, and executed one at a time — there's no JIT, no bytecode caching. That keeps the implementation easy to follow, which matters more here than raw speed for hand-written assembly programs at this scale.
- **Cycle costs are currently flat per instruction** (see the tables above), not the real 68000's addressing-mode-dependent timing — today's cycle counter is a rough guide for comparing programs, not a cycle-accurate simulation of real hardware.
- **Memory access is O(1)** everywhere: no caching, no virtual memory — the whole address space (RAM, framebuffer, controller input) is backed by one flat block of memory, so reading or writing any address costs the same.
- **No memory protection *inside* the emulated address space**: a running program can read or write any address there, including the system area — nothing stops a bug from overwriting its own vector table or code. This matches real 68000 hardware, which has no MMU either (the same was true of the Mac 128K, Sega Genesis, and Atari ST). It does **not** mean a buggy program can touch your actual computer's memory — the whole emulated space is one self-contained block inside the app; there's no bridge to your real machine, so there's nothing to "escape" to. Out-of-bounds addresses (outside `$00000`–`$7E803`) are still rejected and stop the program.

---

Back to [Presentation](./PRESENTATION.md) · [Downloads](./DOWNLOAD.md) · [Troubleshooting](./TROUBLESHOOTING.md)
