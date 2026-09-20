# Troubleshooting

Answers for the things most likely to trip you up while working through the [Reference](./REFERENCE.md) today — like the rest of this guide, this page only covers what's real right now, not the final wish list (see [Presentation](./PRESENTATION.md) for what's still ahead).

## Program Issues

### "My breakpoint is ignored"

A breakpoint is a red line number in the editor's left margin (click a number to set or remove it). **Run** stops when the *next instruction to execute* sits on a marked line — the line highlighted in yellow. A breakpoint silently does nothing in these cases:

- **The line holds no instruction.** Blank lines, comments, a label alone on its line, and directives (`ORG`, `EQU`, `END`, `EVEN`) produce no code, so the CPU never arrives there. Put the breakpoint on the instruction line itself. Data lines (`DC`, `DS`) are only "reached" if the CPU actually executes them as code, which a working program doesn't.
- **The instruction is never reached.** It sits after a `TRAP #0`, in a branch that is never taken, or in a subroutine that is never called.
- **It's on the very first instruction.** The check happens *after* each instruction runs, so pressing Run from the start executes the first instruction before looking at breakpoints. Use **Step** for that one. The same applies when you resume from a breakpoint: the instruction you're stopped on runs first (a loop that comes back to it will stop there again).
- **You're using Step.** Step always executes exactly one instruction and ignores breakpoints.
- **You deleted its line.** A breakpoint follows its instruction when you insert or delete lines around it, but deleting the instruction's own line removes the breakpoint with it.

### "My program never finishes / seems to hang"

**Cause**: an infinite loop — most often a `BRA` that branches back to itself (or to a point before it) with no way out:

```asm
LOOP:
  ; ... code ...
  BRA   LOOP    ; loops forever — nothing ever branches away
```

A `DBcc`/`DBRA` loop can do the same thing if its counter never reaches its stop condition — see [How does DBcc decide?](./REFERENCE.md#how-does-dbcc-decide).

**What to check today**: **Pause** stops a running program, and a breakpoint inside the loop (see [My breakpoint is ignored](#my-breakpoint-is-ignored)) lets you watch its registers change. Hand-tracing the loop's exit condition — the way every worked example on the Reference page does — is the reliable way to catch this before it becomes a real problem.

### "Program runs too slowly"

The emulator's cycle counter is currently a flat number per instruction, not the real 68000's addressing-mode-dependent timing — see [Performance Notes](./REFERENCE.md#performance-notes). If a program's cycle count looks unexpectedly high:

- Millions of loop iterations add up on their own — the counter isn't wrong, a large loop bound might just be the actual cause.
- Prefer `MOVEQ` over `MOVE.L #imm` for small constants, and shifts (`ASL`/`LSL`, etc.) over `MULU`/`DIVU` for power-of-two math — see [Tips](./REFERENCE.md#tips).
- Minimize memory access inside a hot loop where a register would do just as well — each cycle interprets exactly one instruction, with no recompilation to optimize a hot path away (see [Performance Notes](./REFERENCE.md#performance-notes)).

## Execution Issues

### "Registers don't change the way I expect"

Check the size suffix first — it decides how much of the register actually gets written:

```asm
MOVE.W  #100,D0   ; only the low word changes
MOVE.L  #100,D0   ; all 32 bits change
```

And check the addressing mode — `#value` loads a constant, a bare number loads *from* that address instead:

```asm
MOVE.L  #100,D0   ; correct: D0 = 100
MOVE.L  100,D0    ; different instruction: D0 = Memory[100]
```

### "A subroutine call corrupts registers it shouldn't touch"

`JSR`/`RTS` only manage the return address — nothing about a subroutine call saves any register automatically. If a subroutine needs `D0`-`D7`/`A0`-`A6` as scratch without disturbing the caller's values, it has to save and restore them itself, typically `MOVEM` pushing onto `-(A7)` on the way in and popping from `(A7)+` on the way out — see [How does MOVEM's register list work?](./REFERENCE.md#how-does-movems-register-list-work) for the worked example.

### "A calculation gives the wrong result"

The usual causes:

- **Signed vs. unsigned confusion** in a comparison — the same bit pattern branches differently depending on which `Bcc` family reads it. See [Which Bcc do I want?](./REFERENCE.md#which-bcc-do-i-want).
- **Overflow** — check `V` (and `C` for unsigned) after the operation; both `ADD`/`SUB` and their `Q`-immediate forms set them.
- **An off-by-one in a `DBcc`/`DBRA` loop count** — see [How does DBcc decide?](./REFERENCE.md#how-does-dbcc-decide).

## Display Issues

### "Nothing shows up on screen"

The on-screen display isn't connected to the emulator yet (see [Project Status](./PRESENTATION.md#project-status)) — writing to the framebuffer at `$40000` (see [Memory Map](./REFERENCE.md#memory-map)) correctly updates memory today, but nothing draws it to a screen yet. If a program's own address math needs checking in the meantime: each pixel is 4 bytes, and at `320×200` pixels, the last one sits at `$40000 + (320×200×4) - 4`.

## Getting More Help

- **Read `examples/simple.asm`** in the project repository for a complete, working instruction sequence (loop, framebuffer write, exit) to compare against.
- **Re-read the relevant [Reference](./REFERENCE.md) row** for the instruction in question — its Description and Flags columns call out the gotchas already known.
- **Hand-trace the instructions**, the way every worked example on the Reference page does — writing out each register's value line by line is usually where a wrong assumption becomes visible.
- **Simplify**: cut the program down to the smallest sequence that still shows the problem.

## Reporting Issues

If something here doesn't explain what you're seeing, or you've found a real bug, include when you report it:

1. The instruction sequence involved (hand-traced, if you can)
2. What you expected vs. what actually happened
3. The app version (or commit, if running from source)
4. Steps to reproduce

---

Back to [Presentation](./PRESENTATION.md) · [Downloads](./DOWNLOAD.md) · [Reference](./REFERENCE.md)
