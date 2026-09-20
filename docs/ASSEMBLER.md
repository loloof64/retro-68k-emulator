# Assembler

The assembler turns 68000 assembly source text into machine-code bytes the CPU can run. Version 1 is wired into the Debugger: Run/Step assemble the editor's source, load the bytecode at `origin` and drive the CPU. Design spec: `docs/superpowers/specs/2026-09-20-assembler-design.md`; implementation plan: `docs/superpowers/plans/2026-09-20-assembler.md`.

## Assembler Public Interface

```typescript
import { assemble } from './assembler'

// AssembledProgram | AssemblerError[]
const result = assemble(source)
```

On success the result is an `AssembledProgram` (see [API Documentation](./API.md)): `bytecode` (the machine code), `origin` (the address the first byte belongs at, from `ORG`, default `$2000`, i.e. `USER_RAM_START`), `entry` (the `END` label's address, else `origin`), `labels`, `symbols` (labels plus `EQU` constants), and `lineMap` (bytecode offset to source line, used by the Debugger for the current-line highlight and breakpoints).

On failure the result is an array of `AssemblerError` (`line`, `column`, `message`) holding every error found, not just the first, sorted by position.

To run a program, copy `bytecode` into memory at `origin` and create the CPU with `entry` as its start address; `src/assembler/programs.test.ts` does exactly this.

## Assembler Pipeline Internals

Files under `src/assembler/`:

| File | Role |
|---|---|
| `parser.ts` | Splits one source line into label, mnemonic, size suffix and operand strings (there is no separate lexer). |
| `operands.ts` | Parses an operand string into an `Operand` and evaluates constant expressions. |
| `encodeEA.ts` | Encodes an addressing mode into its 6-bit field plus extension words; holds the operand-class predicates. |
| `index.ts` | The `assemble` driver: mnemonic lookup, two passes, directives, error collection. |
| `types.ts` | `Operand`, `EncodeContext`, `AssemblerError`, `Size`. |

The driver is a **two-pass** assembler. A *label* is a name attached to an address, so that code can say "jump to LOOP" without counting bytes. Labels can be used before they are defined (a forward reference), which is why one pass is not enough:

1. **Pass 1** walks the lines, encodes each instruction with unknown labels treated as 0 just to measure how many bytes it takes, and records every label's address.
2. **Pass 2** encodes every instruction again with the real label values, and checks that the sizes did not change. Range checks (branch distance, immediate size) only fire in this pass.

Encoding is table-driven: each real instruction in `opcodeTable` (`src/cpu/opcodes.ts`) may carry an optional `encode` field. The driver finds every definition sharing the mnemonic and tries them in order until one returns words.

## Assembler Source Syntax

- Mnemonics, registers and directives are case-insensitive; labels are case-sensitive.
- A label is a word starting in column 0, or any word followed by `:`.
- Comments start with `;`, or with `*` in column 0.
- Numbers: `123` (decimal), `$FF` (hex), `%1010` (binary), `'A'` (character code).
- Expressions are constants and labels combined with `+` and `-` only.
- Operands: `Dn`, `An` (`SP` is `A7`), `(An)`, `(An)+`, `-(An)`, `d(An)`, `d(An,Xn)`, `d(PC)`, `d(PC,Xn)`, `#imm`, and a bare address or label. `MOVEM` also takes a register list such as `D0-D2/A0` (ranges joined by `/`).
- `Xn` is `Dn` or `An` with an optional `.W` (default) or `.L`; the displacement of an indexed mode is 8 bits and may be omitted (`(A0,D1.W)`). For `d(PC)` and `d(PC,Xn)`, write the target label as `d`: the assembler subtracts the address of the displacement's own extension word. PC-relative operands are sources only, and `BTST #n,d(PC)` is not assemblable.
- A bare address or label is always encoded as a 4-byte absolute-long address; there is no short-absolute form.
- An instruction at an odd address is an error; put `EVEN` before it.

## Assembler Directives

A *directive* is an instruction to the assembler itself; it produces no CPU instruction of its own.

| Directive | Effect |
|---|---|
| `ORG addr` | Sets the address the following bytes are placed at. |
| `END [label]` | Stops assembly; the optional label becomes the entry point. |
| `DC.B/W/L a, b, ...` | Emits constants; `DC.B` also accepts quoted strings. |
| `DS.B/W/L n` | Reserves `n` zero-filled units. |
| `EQU expr` | Gives the line's label a constant value instead of an address. |
| `EVEN` | Pads with one zero byte if the address is odd. |

## Assembler Branch Sizes

`BRA`, `BSR`, `Bcc` and `DBcc` are encoded from the size suffix: `.S` is an 8-bit displacement (must be nonzero), `.W` (the default) is 16-bit. A target out of range is an error; there is no automatic relaxation to a longer form. All conditions are supported except `BF`, which the 68000 does not have as a branch.

## The encode Contract

```typescript
encode?: (
  ops: Operand[], size: Size, ctx: EncodeContext
) => number[] | null
```

- Returns the instruction's 16-bit words (opcode word first, then extension words).
- Returns `null` when the operand shapes do not fit this definition; the driver then tries the next definition with the same mnemonic (for example `ADD <ea>,Dn` versus `ADD Dn,<ea>`).
- Throws an `Error` for a genuine mistake; the driver turns it into an `AssemblerError` at that line.
- `ctx.pc` is the opcode word's address, `ctx.cc` the condition code for `Bcc`/`DBcc`, `ctx.eval(expr)` resolves an expression, and `ctx.final` is false during pass 1 so range checks are skipped.

`encodeEA.ts` provides the shared helpers: `encodeEA`, `sizeBits`, `immWords`, `isMemory`, `isDataAlterable`, `isControl` and `CONDITIONS`.

## Adding an Assemblable Mnemonic

1. Add an `encode` field to the mnemonic's `OpcodeDefinition` in `src/cpu/opcodes.ts`, reusing the `encodeEA.ts` helpers.
2. Add a test in `src/assembler/` whose expected words are hand-assembled from the Motorola manual's bit layouts, not copied from the encoder's own output.
3. Run `npx vitest run`, `npx tsc --noEmit` and `npm run lint`.
4. Update the mnemonic table in the user reference and this page, then commit: one commit per mnemonic.

Real mnemonics without an `encode` field report `'X' is not assemblable yet` (none are left today); unknown names, such as the privileged `STOP`/`RTE`, report `Unknown mnemonic`.

## Assembled Subset and Known Limits

Assemblable: every real mnemonic. That covers `MOVE` (including `MOVE <ea>,CCR` and `MOVE SR,<ea>`), `MOVEA`, `MOVEQ`, `MOVEM`, `MOVEP` (`Dn,d(An)` and `d(An),Dn`, always with a displacement), `LEA`, `PEA`, `EXG`, `SWAP`, `EXT`, `ADD`/`SUB`/`CMP` and their `A`/`I`/`Q`/`X` variants, `MULU`/`MULS`/`DIVU`/`DIVS`, `ABCD`/`SBCD`/`NBCD`, `CMPM`, `AND`/`OR`/`EOR` (+ `I`, including `#imm,CCR`), `NOT`, `NEG`/`NEGX`, `CLR`, `TST`, `TAS`, `Scc`, the shifts and rotates (`ASL`..`ROXR`), `BTST`/`BCHG`/`BCLR`/`BSET`, `Bcc`/`BRA`/`BSR`/`DBcc`, `JMP`/`JSR`/`RTS`/`RTR`, `LINK`/`UNLK`, `CHK`, `TRAP`/`TRAPV`, `ILLEGAL` and `NOP`.

Known limits:

- Forward references to `EQU` symbols, and in `ORG` or `DS` counts, are not supported (a `DS` count that changes size between passes reports an error).
- `DC` values are not range-checked; they are truncated to the width.
- Labels defined before the first `ORG` bind to the default origin.
- Absolute operands are always long (4 bytes); branches are never relaxed.
- Nothing calls the assembler from the UI yet.
