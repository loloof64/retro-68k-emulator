# Assembler v1 — Design

Date: 2026-09-20. Status: design approved, not implemented.

## Goal

Turn 68000 assembly source text into runnable bytecode. Today opcodes are
hand-assembled as raw words in tests, and `docs/ARCHITECTURE.md` only
sketches a pipeline (`src/assembler/index.ts`, "to implement").

## Decisions

- **Scope: a subset first**, with an architecture that lets every remaining
  mnemonic be added one at a time (one feature = one commit).
- **Encoders live on `OpcodeDefinition`** (bidirectional `opcodeTable`),
  not in a separate assembler-only table. The existing `encoding` strings
  are approximate annotations (letters differ between entries; real
  matching is `mask`/`pattern`), so they are *not* inverted.
- **Encoder is optional per definition.** Only the v1 subset gets one; the
  rest of the 177 entries stay decodable but not assemblable until added.
- **Deliverable is a library only.** No UI: Editor/Debugger wiring, an
  execution loop and framebuffer rendering are a separate later step.

## Public interface

`assemble(source: string): AssembledProgram | AssemblerError[]` in
`src/assembler/index.ts`.

- Success reuses `AssembledProgram` (`src/types/cpu.ts`): `bytecode`,
  `labels`, `lineMap` (bytecode offset -> source line, for the future
  debugger).
- Failure is the full list of `{ line, column, message }` for the whole
  source, not just the first error.
- A valid mnemonic with no encoder yet reports "`X` is not assemblable
  yet" — never a silent failure.

## Modules (`src/assembler/`)

| File | Role |
|---|---|
| `lexer.ts` | text -> tokens (the `Token` type already exists) |
| `parser.ts` | tokens -> structured lines (label, mnemonic + size, operands, directive) |
| `operands.ts` | operand text -> typed addressing mode: `Dn`, `An`, `(An)`, `(An)+`, `-(An)`, `d(An)`, `#imm`, absolute address, label |
| `index.ts` | two-pass driver, `assemble()` |

## Encoders

`OpcodeDefinition` gains an optional
`encode(operands, size, ctx) -> number[]` returning the opcode word plus
extension words.

A shared helper `encodeEA(mode, size)` (mirror of `decodeEA` in
`opcodes.ts`) returns the 6-bit mode/register field and its extension
words; every encoder calls it instead of re-deriving the layout.

**v1 subset**: `MOVE`/`MOVEA`/`MOVEQ`, `ADD`/`SUB`/`CMP` (+ `ADDA`/`SUBA`/
`CMPA`, `ADDI`/`SUBI`/`CMPI`, `ADDQ`/`SUBQ`), `LEA`, `CLR`, `TST`,
`Bcc`/`BRA`/`BSR`, `DBcc`, `JMP`/`JSR`/`RTS`, `NOP`, `TRAP`.

## Two passes

1. **Pass 1** — measure each line's size from its addressing modes only
   (never from label values) and fill the label table.
2. **Pass 2** — encode with labels resolved.

Because sizes never depend on label values, one measuring pass is enough.

## Syntax

- Mnemonics, registers, directives: case-insensitive. Labels: case-sensitive.
- A label ends with `:` (or starts at column 0).
- Numbers: `123`, `$FF`, `%1010`, `'A'`.
- Expressions: constants and labels with simple `+`/`-` only.
- Directives: `ORG`, `END [label]`, `DC.B/W/L` (including `"..."` strings,
  needed to use TRAP #1), `DS.B/W/L`, `EQU`.
- Branches: size fixed by suffix (`.S` 8-bit, `.W` 16-bit), default `.W`.
  A displacement too large for the chosen size is an error (no automatic
  relaxation, which would break the single measuring pass).

## Testing

Two levels, both in vitest:

- **Unit**: assemble one line, compare to expected words written by hand
  from the Motorola manual (not derived from the code under test).
- **Round trip**: assemble, load into `SystemMemory`, run with `step`,
  check registers/memory — a wrong encoding is caught by the existing,
  already-tested decoder.

Plus: the sample program from `src/App.tsx` end to end, and a TRAP #1 test
using `DC.B "Hello",0`.

## Docs to update with the implementation

`docs/ASSEMBLER.md` (new, dev), a section in `docs/user/REFERENCE.md`, the
roadmap line in `docs/user/PRESENTATION.md`, `docs/ARCHITECTURE.md`'s
pipeline section, `CLAUDE.md`'s status — then regenerate both PDFs (usual
workflow in `CLAUDE.md`). Watch the doc conventions there (no literal
triple-backtick in inline code, no backtick code in linkable headings).

## Out of scope (v1)

UI wiring, execution loop, framebuffer rendering, macros, conditional
assembly, expressions beyond `+`/`-`, automatic branch-size relaxation,
mnemonics outside the subset, privileged instructions.
