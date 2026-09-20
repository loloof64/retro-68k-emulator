# Assembler v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `assemble(source)` turns 68000 assembly text (v1 subset) into a runnable `AssembledProgram`, or returns the full list of errors.

**Architecture:** A line parser splits source into label / mnemonic / operand strings; `operands.ts` types each operand and evaluates `+`/`-` expressions. Encoders are an optional `encode` field on `OpcodeDefinition` (returns the opcode word + extension words, or `null` when the operand shapes don't fit that definition, so `ADD` can try `ADD` then `ADD_MEM`). A two-pass driver in `index.ts` measures by running the encoders leniently (unknown symbols = 0), then re-encodes with real symbols.

**Tech Stack:** TypeScript, vitest (existing). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-20-assembler-design.md`

## Global Constraints

- Subset: `MOVE`/`MOVEA`/`MOVEQ`, `ADD`/`SUB`/`CMP`, `ADDA`/`SUBA`/`CMPA`, `ADDI`/`SUBI`/`CMPI`, `ADDQ`/`SUBQ`, `LEA`, `CLR`, `TST`, `Bcc`/`BRA`/`BSR`, `DBcc`, `JMP`/`JSR`/`RTS`, `NOP`, `TRAP`.
- Mnemonics, registers, directives case-insensitive; labels case-sensitive.
- Numbers: `123`, `$FF`, `%1010`, `'A'`. Expressions: constants and labels with `+`/`-` only.
- Directives: `ORG`, `END [label]`, `DC.B/W/L` (incl. `"..."` strings), `DS.B/W/L`, `EQU`.
- Branch size fixed by suffix (`.S` = 8-bit, `.W` = 16-bit), default `.W`; displacement too large is an error (no relaxation).
- Failure returns every `{ line, column, message }`, not just the first. A mnemonic with no encoder reports "`X` is not assemblable yet".
- Library only: no UI, no execution loop.
- Repo style: no semicolons, single quotes, 2-space indent (match `src/cpu/*.ts`). Tests hand-assemble expected words from the Motorola manual, never derived from the code under test.
- One commit per task. Commit trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## Deviations from the spec (decided while planning, all small)

- `lexer.ts` is dropped: a char-level line splitter lives in `parser.ts` (the `Token` type stays unused). A separate token stream adds nothing the splitter doesn't already give.
- `encode` returns `number[] | null` (null = "not this form") and takes `mnemonic condition` via `ctx.cc`; the spec's signature didn't cover mnemonics that map to several `OpcodeDefinition`s (ADD/ADD_MEM, MOVE/MOVE_FROM_SR).
- `AssembledProgram` gains `origin` and `entry` (the `ORG` address and the `END label` address; bytecode alone can't be loaded without them).
- Absolute addresses always encode as absolute-long (4 bytes) so sizes never depend on a value.
- Added `EVEN` directive; an instruction at an odd address is an error ("add EVEN").
- Sizes are measured by encoding with a lenient symbol lookup rather than a second per-instruction size table; pass 2 asserts the length didn't change.

## File Structure

| File | Responsibility |
|---|---|
| `src/assembler/types.ts` | `Operand`, `EncodeContext`, `AssemblerError`, `Size` |
| `src/assembler/operands.ts` | `evalExpr`, `parseOperand`, `splitOperands` |
| `src/assembler/parser.ts` | `parseLine(text, lineNo) -> ParsedLine \| null` |
| `src/assembler/encodeEA.ts` | `encodeEA`, `sizeBits`, shared encoder helpers, `CONDITIONS` |
| `src/assembler/index.ts` | `assemble()` two-pass driver, directives, mnemonic resolution |
| `src/assembler/*.test.ts` | one test file per module + `assemble.test.ts` |
| `src/types/cpu.ts` | `OpcodeDefinition.encode?`, `AssembledProgram.origin/entry` |
| `src/cpu/opcodes.ts` | `encode:` on each subset definition |

Run all checks with: `npx vitest run && npx tsc --noEmit && npm run lint`

---

### Task 1: Types, expressions, operand parsing

**Files:**
- Create: `src/assembler/types.ts`, `src/assembler/operands.ts`, `src/assembler/operands.test.ts`

**Interfaces:**
- Produces:
  - `type Size = 'byte' | 'word' | 'long'`
  - `type Operand = { kind: 'dn' | 'an' | 'ind' | 'post' | 'pre'; n: number } | { kind: 'disp'; n: number; expr: string } | { kind: 'imm' | 'abs'; expr: string }`
  - `interface EncodeContext { pc: number; cc?: number; final: boolean; eval(expr: string): number }` (`pc` = address of the opcode word; `final` false in the measuring pass, so range checks are skipped)
  - `interface AssemblerError { line: number; column: number; message: string }`
  - `evalExpr(text: string, lookup: (name: string) => number | undefined): number` (throws `Error` on bad syntax / undefined symbol)
  - `parseOperand(text: string): Operand` (throws `Error`)
  - `splitOperands(text: string): string[]` (top-level commas only, i.e. not inside parens or quotes)

- [ ] **Step 1: Write the failing test** — `src/assembler/operands.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { evalExpr, parseOperand, splitOperands } from './operands'

const syms: Record<string, number> = { START: 0x2000, LEN: 4 }
const lookup = (n: string) => syms[n]

describe('evalExpr', () => {
  it('parses decimal, hex, binary and char literals', () => {
    expect(evalExpr('123', lookup)).toBe(123)
    expect(evalExpr('$FF', lookup)).toBe(255)
    expect(evalExpr('%1010', lookup)).toBe(10)
    expect(evalExpr("'A'", lookup)).toBe(65)
  })
  it('supports labels and + / - chains', () => {
    expect(evalExpr('START+LEN-2', lookup)).toBe(0x2002)
    expect(evalExpr('-4', lookup)).toBe(-4)
    expect(evalExpr(' START + $10 ', lookup)).toBe(0x2010)
  })
  it('rejects undefined symbols and malformed input', () => {
    expect(() => evalExpr('NOPE', lookup)).toThrow('Undefined symbol')
    expect(() => evalExpr('1 2', lookup)).toThrow('Bad expression')
    expect(() => evalExpr('', lookup)).toThrow('Bad expression')
  })
})

describe('parseOperand', () => {
  it('parses register and indirect modes', () => {
    expect(parseOperand('D3')).toEqual({ kind: 'dn', n: 3 })
    expect(parseOperand('a5')).toEqual({ kind: 'an', n: 5 })
    expect(parseOperand('SP')).toEqual({ kind: 'an', n: 7 })
    expect(parseOperand('(A1)')).toEqual({ kind: 'ind', n: 1 })
    expect(parseOperand('(A1)+')).toEqual({ kind: 'post', n: 1 })
    expect(parseOperand('-(A7)')).toEqual({ kind: 'pre', n: 7 })
  })
  it('parses displacement, immediate and absolute/label', () => {
    expect(parseOperand('8(A0)')).toEqual({ kind: 'disp', n: 0, expr: '8' })
    expect(parseOperand('-2(A6)')).toEqual({ kind: 'disp', n: 6, expr: '-2' })
    expect(parseOperand('#$10')).toEqual({ kind: 'imm', expr: '$10' })
    expect(parseOperand('$3000')).toEqual({ kind: 'abs', expr: '$3000' })
    expect(parseOperand('LOOP')).toEqual({ kind: 'abs', expr: 'LOOP' })
  })
})

describe('splitOperands', () => {
  it('splits on top-level commas only', () => {
    expect(splitOperands('D0,D1')).toEqual(['D0', 'D1'])
    expect(splitOperands('#1,(A0)')).toEqual(['#1', '(A0)'])
    expect(splitOperands('"a,b",0')).toEqual(['"a,b"', '0'])
    expect(splitOperands('')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/assembler/operands.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/assembler/types.ts`

```ts
export type Size = 'byte' | 'word' | 'long'

export type Operand =
  | { kind: 'dn' | 'an' | 'ind' | 'post' | 'pre'; n: number }
  | { kind: 'disp'; n: number; expr: string }
  | { kind: 'imm' | 'abs'; expr: string }

export interface EncodeContext {
  pc: number // address of the instruction's opcode word
  cc?: number // condition code, for Bcc/DBcc
  final: boolean // false while measuring: skip range checks
  eval(expr: string): number
}

export interface AssemblerError {
  line: number
  column: number
  message: string
}
```

`src/assembler/operands.ts`

```ts
import type { Operand } from './types'

const TERM = /\s*([+-])?\s*(\$[0-9a-f]+|%[01]+|\d+|'[^']'|[a-z_][\w.]*)\s*/iy

function termValue(t: string, lookup: (name: string) => number | undefined): number {
  if (t[0] === '$') return parseInt(t.slice(1), 16)
  if (t[0] === '%') return parseInt(t.slice(1), 2)
  if (t[0] === "'") return t.charCodeAt(1)
  if (/^\d/.test(t)) return parseInt(t, 10)
  const value = lookup(t)
  if (value === undefined) throw new Error(`Undefined symbol '${t}'`)
  return value
}

export function evalExpr(text: string, lookup: (name: string) => number | undefined): number {
  let total = 0
  let pos = 0
  let first = true
  while (pos < text.length) {
    TERM.lastIndex = pos
    const m = TERM.exec(text)
    if (!m || (!first && !m[1])) throw new Error(`Bad expression '${text}'`)
    total += (m[1] === '-' ? -1 : 1) * termValue(m[2], lookup)
    pos = TERM.lastIndex
    first = false
  }
  if (first) throw new Error(`Bad expression '${text}'`)
  return total
}

const AN = '(A[0-7]|SP)'
const regNum = (r: string) => (r.toUpperCase() === 'SP' ? 7 : Number(r[1]))

export function parseOperand(raw: string): Operand {
  const text = raw.trim()
  let m: RegExpMatchArray | null
  if ((m = text.match(/^D([0-7])$/i))) return { kind: 'dn', n: Number(m[1]) }
  if ((m = text.match(new RegExp(`^${AN}$`, 'i')))) return { kind: 'an', n: regNum(m[1]) }
  if ((m = text.match(new RegExp(`^\\(${AN}\\)$`, 'i')))) return { kind: 'ind', n: regNum(m[1]) }
  if ((m = text.match(new RegExp(`^\\(${AN}\\)\\+$`, 'i')))) return { kind: 'post', n: regNum(m[1]) }
  if ((m = text.match(new RegExp(`^-\\(${AN}\\)$`, 'i')))) return { kind: 'pre', n: regNum(m[1]) }
  if ((m = text.match(new RegExp(`^(.+)\\(${AN}\\)$`, 'i')))) {
    return { kind: 'disp', n: regNum(m[2]), expr: m[1].trim() }
  }
  if (text.startsWith('#')) return { kind: 'imm', expr: text.slice(1).trim() }
  if (text === '') throw new Error('Missing operand')
  return { kind: 'abs', expr: text }
}

// Splits on commas that are outside parentheses and quotes.
export function splitOperands(text: string): string[] {
  if (text.trim() === '') return []
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(text.slice(start).trim())
  return parts
}
```

- [ ] **Step 4: Run** — `npx vitest run src/assembler/operands.test.ts` → PASS. Then `npx tsc --noEmit && npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/assembler
git commit -m "feat(assembler): expression evaluator and operand parser"
```

---

### Task 2: Line parser

**Files:**
- Create: `src/assembler/parser.ts`, `src/assembler/parser.test.ts`

**Interfaces:**
- Consumes: `splitOperands` from `./operands`
- Produces:
  - `interface ParsedLine { line: number; column: number; label?: string; mnemonic?: string; size?: string; operands: string[] }` (`column` = 1-based column of the mnemonic, or of the label when the line is label-only; `size` = the raw suffix letter uppercased, e.g. `'L'`)
  - `parseLine(text: string, lineNo: number): ParsedLine | null` (`null` for blank / comment-only lines)

Rules: `;` starts a comment unless inside quotes; a line whose first char is `*` is a comment; a first token starting at column 0 is a label (trailing `:` stripped); an indented first token ending in `:` is also a label; everything else after is `MNEMONIC[.SIZE] operands`.

- [ ] **Step 1: Write the failing test** — `src/assembler/parser.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { parseLine } from './parser'

describe('parseLine', () => {
  it('skips blank and comment-only lines', () => {
    expect(parseLine('', 1)).toBeNull()
    expect(parseLine('   ; hi', 1)).toBeNull()
    expect(parseLine('* old style', 1)).toBeNull()
  })
  it('parses label, mnemonic, size and operands', () => {
    expect(parseLine('START:  MOVE.L  #100,D0   ; load', 3)).toEqual({
      line: 3, column: 9, label: 'START', mnemonic: 'MOVE', size: 'L', operands: ['#100', 'D0'],
    })
  })
  it('treats a column-0 word as a label even without a colon', () => {
    expect(parseLine('LOOP', 1)).toEqual({ line: 1, column: 1, label: 'LOOP', operands: [] })
    expect(parseLine('LEN EQU 4', 1)).toMatchObject({ label: 'LEN', mnemonic: 'EQU', operands: ['4'] })
  })
  it('parses an indented instruction with no label', () => {
    expect(parseLine('        RTS', 1)).toMatchObject({ mnemonic: 'RTS', operands: [] })
  })
  it('does not treat ; inside a string as a comment', () => {
    expect(parseLine('  DC.B "a;b",0', 1)).toMatchObject({ mnemonic: 'DC', size: 'B', operands: ['"a;b"', '0'] })
  })
})
```

- [ ] **Step 2: Run** → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/assembler/parser.ts`

```ts
import { splitOperands } from './operands'

export interface ParsedLine {
  line: number
  column: number
  label?: string
  mnemonic?: string
  size?: string
  operands: string[]
}

function stripComment(text: string): string {
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === ';') return text.slice(0, i)
  }
  return text
}

export function parseLine(raw: string, lineNo: number): ParsedLine | null {
  if (raw.startsWith('*')) return null
  const text = stripComment(raw).trimEnd()
  if (text.trim() === '') return null

  let rest = text
  let offset = 0
  let label: string | undefined
  const first = text.match(/^\s*(\S+)/)!
  const startsAtCol0 = !/^\s/.test(text)
  if (startsAtCol0 || first[1].endsWith(':')) {
    label = first[1].replace(/:$/, '')
    offset = first[0].length
    rest = text.slice(offset)
  }

  const m = rest.match(/^(\s*)(\S+)\s*(.*)$/)
  if (!m) return { line: lineNo, column: 1, label, operands: [] }

  const [name, ...sizePart] = m[2].split('.')
  return {
    line: lineNo,
    column: offset + m[1].length + 1,
    label,
    mnemonic: name.toUpperCase(),
    size: sizePart.length ? sizePart.join('.').toUpperCase() : undefined,
    operands: splitOperands(m[3]),
  }
}
```

Note: the first test expects `column: 9` for `'START:  MOVE...'` (`START:` is 6 chars + 2 spaces = index 8, 1-based 9). If the arithmetic is off, fix the test, not the code: column is 1-based position of the mnemonic.

- [ ] **Step 4: Run** — `npx vitest run src/assembler/parser.test.ts` → PASS; `npx tsc --noEmit && npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/assembler/parser.ts src/assembler/parser.test.ts
git commit -m "feat(assembler): source line parser"
```

---

### Task 3: Driver, directives, and the first encoders (NOP, RTS, TRAP)

**Files:**
- Create: `src/assembler/encodeEA.ts`, `src/assembler/index.ts`, `src/assembler/assemble.test.ts`
- Modify: `src/types/cpu.ts` (`OpcodeDefinition.encode?`, `AssembledProgram.origin`/`entry`), `src/cpu/opcodes.ts` (NOP, RTS, TRAP get `encode`), `docs/API.md:68-80` (AssembledProgram interface listing: add the two fields)

**Interfaces:**
- Consumes: `parseLine`, `parseOperand`, `evalExpr`, types from Tasks 1-2; `opcodeTable` from `src/cpu/opcodes`; `USER_RAM_START` from `src/memory`.
- Produces:
  - `OpcodeDefinition.encode?: (operands: Operand[], size: Size, ctx: EncodeContext) => number[] | null` — words (16-bit each); `null` = operand shapes don't fit this definition.
  - `AssembledProgram` gains `origin: number; entry: number`.
  - `assemble(source: string): AssembledProgram | AssemblerError[]`.
  - From `encodeEA.ts`: `CONDITIONS: Record<string, number>`; `sizeBits(size: Size): number` (byte 0, word 1, long 2); `immWords(value: number, size: Size, final: boolean): number[]`.

- [ ] **Step 1: Write the failing test** — `src/assembler/assemble.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { assemble } from './index'
import type { AssembledProgram } from '../types/cpu'
import type { AssemblerError } from './types'
import { USER_RAM_START } from '../memory'

export function ok(source: string): AssembledProgram {
  const result = assemble(source)
  if (Array.isArray(result)) throw new Error(JSON.stringify(result))
  return result
}
export const words = (p: AssembledProgram): number[] => {
  const out: number[] = []
  for (let i = 0; i < p.bytecode.length; i += 2) out.push((p.bytecode[i] << 8) | p.bytecode[i + 1])
  return out
}
export const errs = (source: string): AssemblerError[] => {
  const result = assemble(source)
  if (!Array.isArray(result)) throw new Error('expected errors')
  return result
}

describe('assemble: basics', () => {
  it('assembles NOP, RTS and TRAP #n at the default origin', () => {
    const p = ok('  NOP\n  RTS\n  TRAP #1')
    expect(words(p)).toEqual([0x4e71, 0x4e75, 0x4e41])
    expect(p.origin).toBe(USER_RAM_START)
    expect(p.entry).toBe(USER_RAM_START)
  })
  it('honours ORG, END label, and records labels and lineMap', () => {
    const p = ok('  ORG $3000\n  NOP\nGO: RTS\n  END GO')
    expect(p.origin).toBe(0x3000)
    expect(p.entry).toBe(0x3002)
    expect(p.labels.get('GO')).toBe(0x3002)
    expect(p.lineMap.get(0)).toBe(2)
    expect(p.lineMap.get(2)).toBe(3)
  })
  it('handles EQU, DC and DS', () => {
    const p = ok('N EQU 3\n  DC.B 1,"Hi",0\n  EVEN\n  DC.W N,$1234\n  DS.B 2\n  DC.L $DEADBEEF')
    expect([...p.bytecode]).toEqual([1, 72, 105, 0, 0, 3, 0x12, 0x34, 0, 0, 0xde, 0xad, 0xbe, 0xef])
    expect(p.symbols.get('N')).toBe(3)
  })
  it('pads the gap when ORG moves forward mid-program', () => {
    const p = ok('  ORG $3000\n  NOP\n  ORG $3006\n  NOP')
    expect(words(p)).toEqual([0x4e71, 0, 0, 0x4e71])
  })
  it('reports every error with line numbers, not just the first', () => {
    const e = errs('  FOO\n  NOP\n  TRAP #99\n  BTST D0,D1')
    expect(e.map((x) => x.line)).toEqual([1, 3, 4])
    expect(e[0].message).toMatch(/Unknown mnemonic 'FOO'/)
    expect(e[2].message).toMatch(/BTST.*not assemblable yet/)
  })
  it('rejects duplicate labels, undefined symbols and odd-address instructions', () => {
    expect(errs('A: NOP\nA: NOP')[0].message).toMatch(/Duplicate label/)
    expect(errs('  DC.L NOPE')[0].message).toMatch(/Undefined symbol/)
    expect(errs('  DC.B 1\n  NOP')[0].message).toMatch(/odd address/)
  })
})
```

- [ ] **Step 2: Run** → FAIL (module not found).

- [ ] **Step 3: Types.** In `src/types/cpu.ts` add at the top `import type { Operand, EncodeContext, Size } from '../assembler/types'`; extend the two interfaces:

```ts
export interface AssembledProgram {
  bytecode: Uint8Array
  origin: number // address bytecode[0] belongs at (ORG)
  entry: number // START address (END label, else origin)
  labels: Map<string, number>
  symbols: Map<string, number>
  lineMap: Map<number, number> // bytecode offset -> source line
}

export interface OpcodeDefinition {
  // ...existing fields unchanged...
  // Optional: only assemblable instructions have one. Returns the opcode
  // word + extension words, or null when the operand shapes don't fit this
  // definition (the assembler then tries the next definition of that mnemonic).
  encode?: (operands: Operand[], size: Size, ctx: EncodeContext) => number[] | null
}
```

Update `docs/API.md` `AssembledProgram` block to match (`origin`, `entry`).

- [ ] **Step 4: `src/assembler/encodeEA.ts`** (shared helpers; `encodeEA` is used from Task 4 on)

```ts
import type { EncodeContext, Operand, Size } from './types'

export const CONDITIONS: Record<string, number> = {
  T: 0, F: 1, HI: 2, LS: 3, CC: 4, HS: 4, CS: 5, LO: 5, NE: 6, EQ: 7,
  VC: 8, VS: 9, PL: 10, MI: 11, GE: 12, LT: 13, GT: 14, LE: 15,
}

export const sizeBits = (size: Size): number => (size === 'byte' ? 0 : size === 'word' ? 1 : 2)

function checkRange(value: number, min: number, max: number, what: string, final: boolean): void {
  if (final && (value < min || value > max)) throw new Error(`${what} ${value} out of range (${min}..${max})`)
}

// Immediate extension words: a byte is still stored as a full word (low byte).
export function immWords(value: number, size: Size, final: boolean): number[] {
  if (size === 'long') return [(value >>> 16) & 0xffff, value & 0xffff]
  if (size === 'byte') checkRange(value, -128, 255, 'Byte immediate', final)
  else checkRange(value, -32768, 65535, 'Word immediate', final)
  return [value & (size === 'byte' ? 0xff : 0xffff)]
}

export interface EncodedEA {
  field: number // 6 bits: mode << 3 | register
  ext: number[] // extension words, in order
}

// Mirror of decodeEA (src/cpu/addressing.ts) for the v1 modes.
export function encodeEA(op: Operand, size: Size, ctx: EncodeContext): EncodedEA {
  switch (op.kind) {
    case 'dn': return { field: op.n, ext: [] }
    case 'an': return { field: 0b001000 | op.n, ext: [] }
    case 'ind': return { field: 0b010000 | op.n, ext: [] }
    case 'post': return { field: 0b011000 | op.n, ext: [] }
    case 'pre': return { field: 0b100000 | op.n, ext: [] }
    case 'disp': {
      const d = ctx.eval(op.expr)
      checkRange(d, -32768, 32767, 'Displacement', ctx.final)
      return { field: 0b101000 | op.n, ext: [d & 0xffff] }
    }
    case 'abs': {
      const a = ctx.eval(op.expr) >>> 0
      return { field: 0b111001, ext: [a >>> 16, a & 0xffff] }
    }
    case 'imm':
      return { field: 0b111100, ext: immWords(ctx.eval(op.expr), size, ctx.final) }
  }
}

// Operand-class predicates, named after the 68000 manual's addressing categories.
export const isMemory = (o: Operand) => ['ind', 'post', 'pre', 'disp', 'abs'].includes(o.kind)
export const isDataAlterable = (o: Operand) => o.kind === 'dn' || isMemory(o)
export const isControl = (o: Operand) => ['ind', 'disp', 'abs'].includes(o.kind)
```

- [ ] **Step 5: Encoders on NOP / RTS / TRAP** in `src/cpu/opcodes.ts` — add a field to each definition:

```ts
// NOP:
  encode: (ops) => (ops.length === 0 ? [0x4e71] : null),
// RTS:
  encode: (ops) => (ops.length === 0 ? [0x4e75] : null),
// TRAP:
  encode: (ops, _size, ctx) => {
    if (ops.length !== 1 || ops[0].kind !== 'imm') return null
    const n = ctx.eval(ops[0].expr)
    if (ctx.final && (n < 0 || n > 15)) throw new Error(`TRAP vector ${n} out of range (0..15)`)
    return [0x4e40 | (n & 0xf)]
  },
```

- [ ] **Step 6: `src/assembler/index.ts`**

```ts
import type { AssembledProgram, OpcodeDefinition } from '../types/cpu'
import { opcodeTable } from '../cpu/opcodes'
import { USER_RAM_START } from '../memory'
import { CONDITIONS } from './encodeEA'
import { evalExpr, parseOperand } from './operands'
import { parseLine, type ParsedLine } from './parser'
import type { AssemblerError, EncodeContext, Size } from './types'

export type { AssemblerError } from './types'

// --- mnemonic resolution -------------------------------------------------

const encodable = new Map<string, OpcodeDefinition[]>()
const known = new Set<string>()
for (const { definition } of opcodeTable) {
  const name = definition.mnemonic.toUpperCase()
  known.add(name)
  if (!definition.encode) continue
  const list = encodable.get(name) ?? []
  if (!list.includes(definition)) list.push(definition)
  encodable.set(name, list)
}

const ALIASES: Record<string, string> = { MOVEA: 'MOVE' }

function resolveMnemonic(name: string): { defs: OpcodeDefinition[]; cc?: number } {
  let base = ALIASES[name] ?? name
  let cc: number | undefined
  if (name.startsWith('DB') && (name === 'DBRA' || name.slice(2) in CONDITIONS)) {
    base = 'DBCC'
    cc = name === 'DBRA' ? 1 : CONDITIONS[name.slice(2)]
  } else if (name === 'BRA') {
    base = 'BCC'
    cc = 0
  } else if (name !== 'BSR' && name[0] === 'B' && name.slice(1) in CONDITIONS && name !== 'BF') {
    base = 'BCC'
    cc = CONDITIONS[name.slice(1)]
  }
  const defs = encodable.get(base)
  if (defs) return { defs, cc }
  if (known.has(base)) throw new Error(`'${name}' is not assemblable yet`)
  throw new Error(`Unknown mnemonic '${name}'`)
}

const SIZE_LETTERS: Record<string, Size> = { B: 'byte', S: 'byte', W: 'word', L: 'long' }

function parseSize(letter: string | undefined): Size {
  if (letter === undefined) return 'word'
  const size = SIZE_LETTERS[letter]
  if (!size) throw new Error(`Bad size suffix '.${letter}'`)
  return size
}

// --- per-line emission ---------------------------------------------------

type Lookup = (name: string) => number | undefined

const widthOf = (size: Size) => (size === 'byte' ? 1 : size === 'word' ? 2 : 4)

function toBytes(value: number, width: number): number[] {
  const out: number[] = []
  for (let i = width - 1; i >= 0; i--) out.push(Math.floor(value / 2 ** (8 * i)) & 0xff)
  return out
}

function emitData(p: ParsedLine, lookup: Lookup): number[] {
  const size = parseSize(p.size ?? 'W')
  if (p.mnemonic === 'DS') {
    const count = evalExpr(p.operands[0] ?? '', lookup)
    if (count < 0) throw new Error('DS count must be >= 0')
    return new Array(count * widthOf(size)).fill(0)
  }
  const out: number[] = []
  for (const op of p.operands) {
    if (op.startsWith('"')) {
      if (size !== 'byte' || !op.endsWith('"') || op.length < 2) throw new Error('Strings are only allowed in DC.B')
      for (const ch of op.slice(1, -1)) {
        if (ch.charCodeAt(0) > 255) throw new Error(`Character '${ch}' is not 8-bit`)
        out.push(ch.charCodeAt(0))
      }
    } else {
      out.push(...toBytes(evalExpr(op, lookup) >>> 0, widthOf(size)))
    }
  }
  return out
}

function emitInstruction(p: ParsedLine, pc: number, lookup: Lookup, final: boolean): number[] {
  if (pc % 2 !== 0) throw new Error('Instruction at an odd address (add EVEN before it)')
  const { defs, cc } = resolveMnemonic(p.mnemonic!)
  const size = parseSize(p.size)
  const ops = p.operands.map(parseOperand)
  const ctx: EncodeContext = { pc, cc, final, eval: (e) => evalExpr(e, lookup) }
  for (const def of defs) {
    const words = def.encode!(ops, size, ctx)
    if (words) return words.flatMap((w) => [w >> 8, w & 0xff])
  }
  throw new Error(`${p.mnemonic} does not accept these operands`)
}

// --- driver --------------------------------------------------------------

interface Measured {
  p: ParsedLine
  pc: number
  len: number
}

export function assemble(source: string): AssembledProgram | AssemblerError[] {
  const errors: AssemblerError[] = []
  const fail = (p: ParsedLine, e: unknown) =>
    errors.push({ line: p.line, column: p.column, message: e instanceof Error ? e.message : String(e) })

  const parsed = source
    .split(/\r?\n/)
    .map((text, i) => parseLine(text, i + 1))
    .filter((p): p is ParsedLine => p !== null)

  const symbols = new Map<string, number>()
  const labels = new Map<string, number>()
  const strict: Lookup = (n) => symbols.get(n)
  // ponytail: forward references measure as 0; pass 2 asserts sizes didn't change.
  const lenient: Lookup = (n) => symbols.get(n) ?? 0

  // Pass 1: measure and define labels.
  let pc = USER_RAM_START
  let origin = USER_RAM_START
  let emitted = false
  let entryExpr: string | undefined
  const records: Measured[] = []

  for (const p of parsed) {
    try {
      const isEqu = p.mnemonic === 'EQU'
      if (p.label && !isEqu) {
        if (symbols.has(p.label)) throw new Error(`Duplicate label '${p.label}'`)
        symbols.set(p.label, pc)
        labels.set(p.label, pc)
      }
      if (!p.mnemonic) continue
      if (isEqu) {
        if (!p.label) throw new Error('EQU needs a label')
        if (symbols.has(p.label)) throw new Error(`Duplicate label '${p.label}'`)
        symbols.set(p.label, evalExpr(p.operands[0] ?? '', strict))
        continue
      }
      if (p.mnemonic === 'END') {
        entryExpr = p.operands[0]
        break
      }
      if (p.mnemonic === 'ORG') {
        const addr = evalExpr(p.operands[0] ?? '', strict)
        if (!emitted) origin = addr
        else if (addr < pc) throw new Error('ORG cannot move backwards')
        pc = addr
        continue
      }
      if (p.mnemonic === 'EVEN') {
        if (pc % 2) {
          records.push({ p, pc, len: 1 })
          pc += 1
          emitted = true
        }
        continue
      }
      const bytes =
        p.mnemonic === 'DC' || p.mnemonic === 'DS'
          ? emitData(p, lenient)
          : emitInstruction(p, pc, lenient, false)
      records.push({ p, pc, len: bytes.length })
      pc += bytes.length
      emitted = true
    } catch (e) {
      fail(p, e)
    }
  }

  // Pass 2: encode with real symbols.
  const chunks: { pc: number; bytes: number[]; line: number }[] = []
  for (const { p, pc: at, len } of records) {
    try {
      const bytes =
        p.mnemonic === 'EVEN'
          ? [0]
          : p.mnemonic === 'DC' || p.mnemonic === 'DS'
            ? emitData(p, strict)
            : emitInstruction(p, at, strict, true)
      if (bytes.length !== len) throw new Error('Size changed between passes (forward reference in a DS count?)')
      chunks.push({ pc: at, bytes, line: p.line })
    } catch (e) {
      fail(p, e)
    }
  }

  let entry = origin
  if (entryExpr) {
    try {
      entry = evalExpr(entryExpr, strict)
    } catch (e) {
      fail(parsed.find((p) => p.mnemonic === 'END')!, e)
    }
  }

  if (errors.length) return errors.sort((a, b) => a.line - b.line || a.column - b.column)

  const end = chunks.reduce((m, c) => Math.max(m, c.pc + c.bytes.length), origin)
  const bytecode = new Uint8Array(end - origin)
  const lineMap = new Map<number, number>()
  for (const c of chunks) {
    bytecode.set(c.bytes, c.pc - origin)
    if (c.bytes.length) lineMap.set(c.pc - origin, c.line)
  }
  return { bytecode, origin, entry, labels, symbols, lineMap }
}
```

- [ ] **Step 7: Run** — `npx vitest run src/assembler` → PASS. Fix mismatches by checking the *test's* expected words against the Motorola manual first. Then `npx vitest run && npx tsc --noEmit && npm run lint`.

- [ ] **Step 8: Commit**

```bash
git add src docs/API.md
git commit -m "feat(assembler): two-pass driver, directives, NOP/RTS/TRAP encoders"
```

---

### Task 4: MOVE, MOVEQ, LEA

**Files:**
- Modify: `src/cpu/opcodes.ts` (MOVE, MOVEQ, LEA get `encode`; add `import { encodeEA, isControl } from '../assembler/encodeEA'` at the top)
- Test: `src/assembler/encode-move.test.ts`

**Interfaces:**
- Consumes: `encodeEA`, `isControl` (Task 3), `ok`/`words` helpers (export them from `assemble.test.ts`, or copy the three-line helpers into each new test file — copy, since tests importing from another test file re-run its suite).

Encodings (Motorola manual): MOVE = `00SS DDD MMM mmm rrr` with SS byte=01, word=11, long=10; dest register in bits 11-9, dest mode in bits 8-6; source extension words come before destination ones. MOVEQ = `0111 DDD 0 dddddddd`. LEA = `0100 AAA 111 mmm rrr`.

- [ ] **Step 1: Write the failing test** — `src/assembler/encode-move.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { assemble } from './index'
import { SystemMemory } from '../memory'
import { createCPU, step } from '../cpu'
import { opcodeTable } from '../cpu/opcodes'
import { Register } from '../types/cpu'

const asm = (src: string): number[] => {
  const p = assemble(`  ${src}`)
  if (Array.isArray(p)) throw new Error(JSON.stringify(p))
  const out: number[] = []
  for (let i = 0; i < p.bytecode.length; i += 2) out.push((p.bytecode[i] << 8) | p.bytecode[i + 1])
  return out
}

describe('MOVE', () => {
  it('encodes register-to-register by size', () => {
    expect(asm('MOVE.L D1,D0')).toEqual([0x2001])
    expect(asm('MOVE.W D1,D0')).toEqual([0x3001])
    expect(asm('MOVE.B D1,D0')).toEqual([0x1001])
  })
  it('appends immediate and address extension words in source-then-dest order', () => {
    expect(asm('MOVE.L #100,D0')).toEqual([0x203c, 0x0000, 0x0064])
    expect(asm('MOVE.W #5,(A0)')).toEqual([0x30bc, 0x0005])
    expect(asm('MOVE.L D0,$40000')).toEqual([0x23c0, 0x0004, 0x0000])
    expect(asm('MOVE.W 4(A1),D2')).toEqual([0x3429, 0x0004])
  })
  it('encodes MOVE/MOVEA to an address register, and pre/post-modify modes', () => {
    expect(asm('MOVE.L #$40000,A0')).toEqual([0x207c, 0x0004, 0x0000])
    expect(asm('MOVEA.W D0,A1')).toEqual([0x3240])
    expect(asm('MOVE.L (A0)+,-(A1)')).toEqual([0x2318])
  })
  it('rejects an immediate destination', () => {
    expect(Array.isArray(assemble('  MOVE.L D0,#1'))).toBe(true)
  })
})

describe('MOVEQ', () => {
  it('encodes signed 8-bit immediates', () => {
    expect(asm('MOVEQ #5,D3')).toEqual([0x7605])
    expect(asm('MOVEQ #-1,D0')).toEqual([0x70ff])
  })
  it('rejects out-of-range values', () => {
    expect(Array.isArray(assemble('  MOVEQ #200,D0'))).toBe(true)
  })
})

describe('LEA', () => {
  it('encodes control addressing modes', () => {
    expect(asm('LEA (A0),A1')).toEqual([0x43d0])
    expect(asm('LEA 8(A2),A0')).toEqual([0x41ea, 0x0008])
    expect(asm('LEA $3000,A0')).toEqual([0x41f9, 0x0000, 0x3000])
  })
})

describe('round trip', () => {
  it('runs MOVE.L #100,D0 / MOVEQ #7,D1 through the real decoder', () => {
    const p = assemble('  MOVE.L #100,D0\n  MOVEQ #7,D1')
    if (Array.isArray(p)) throw new Error('assemble failed')
    const memory = new SystemMemory()
    p.bytecode.forEach((b, i) => memory.write8(p.origin + i, b))
    const cpu = createCPU(p.entry)
    step(cpu, memory, opcodeTable)
    step(cpu, memory, opcodeTable)
    expect(cpu.registers[Register.D0]).toBe(100)
    expect(cpu.registers[Register.D1]).toBe(7)
  })
})
```

- [ ] **Step 2: Run** → FAIL (`does not accept these operands` — no `encode` on MOVE yet).

- [ ] **Step 3: Implement.** Add to `MOVE`:

```ts
  encode: (ops, size, ctx) => {
    if (ops.length !== 2 || ops[1].kind === 'imm') return null
    if (size === 'byte' && (ops[0].kind === 'an' || ops[1].kind === 'an')) return null
    const src = encodeEA(ops[0], size, ctx)
    const dst = encodeEA(ops[1], size, ctx)
    const sizeField = size === 'byte' ? 0b01 : size === 'word' ? 0b11 : 0b10
    const word =
      (sizeField << 12) | ((dst.field & 7) << 9) | ((dst.field >> 3) << 6) | src.field
    return [word, ...src.ext, ...dst.ext]
  },
```

`MOVEQ`:

```ts
  encode: (ops, _size, ctx) => {
    if (ops.length !== 2 || ops[0].kind !== 'imm' || ops[1].kind !== 'dn') return null
    const v = ctx.eval(ops[0].expr)
    if (ctx.final && (v < -128 || v > 127)) throw new Error(`MOVEQ value ${v} out of range (-128..127)`)
    return [0x7000 | (ops[1].n << 9) | (v & 0xff)]
  },
```

`LEA`:

```ts
  encode: (ops, size, ctx) => {
    if (ops.length !== 2 || !isControl(ops[0]) || ops[1].kind !== 'an') return null
    const src = encodeEA(ops[0], size, ctx)
    return [0x41c0 | (ops[1].n << 9) | src.field, ...src.ext]
  },
```

- [ ] **Step 4: Run** — `npx vitest run` → PASS; `npx tsc --noEmit && npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(assembler): MOVE, MOVEA, MOVEQ and LEA encoders"
```

---

### Task 5: ADD / SUB / CMP families

**Files:**
- Modify: `src/cpu/opcodes.ts` (ADD, ADD_MEM, SUB, SUB_MEM, CMP, ADDA, SUBA, CMPA, ADDI, SUBI, CMPI get `encode`; import `sizeBits`, `isMemory`, `isDataAlterable` too)
- Test: `src/assembler/encode-arith.test.ts` (same local `asm` helper as Task 4)

Encodings (manual): `ADD <ea>,Dn` = `1101 nnn 0ss eeeeee` (ss byte 00, word 01, long 10); `ADD Dn,<ea>` = `1101 nnn 1ss eeeeee`; SUB base `1001`; CMP base `1011` (only `<ea>,Dn`). `ADDA/SUBA/CMPA <ea>,An` = base `1101/1001/1011`, `nnn`, opmode word `011` / long `111`, ea. `ADDI/SUBI/CMPI #imm,<ea>` = `0000 0110 / 0100 / 1100 ss eeeeee` followed by the immediate words then the ea's extension words.

- [ ] **Step 1: Write the failing test**

```ts
describe('ADD/SUB/CMP', () => {
  it('encodes <ea>,Dn and Dn,<ea>', () => {
    expect(asm('ADD.L D1,D0')).toEqual([0xd081])
    expect(asm('ADD.W (A0),D2')).toEqual([0xd450])
    expect(asm('ADD.L D0,(A1)')).toEqual([0xd191])
    expect(asm('ADD.B #1,D0')).toEqual([0xd03c, 0x0001])
    expect(asm('SUB.L D1,D0')).toEqual([0x9081])
    expect(asm('SUB.W D3,4(A0)')).toEqual([0x9768, 0x0004])
    expect(asm('CMP.L D1,D0')).toEqual([0xb081])
    expect(asm('CMP.W #10,D3')).toEqual([0xb67c, 0x000a])
  })
  it('encodes the address-register forms', () => {
    expect(asm('ADDA.L D0,A1')).toEqual([0xd3c0])
    expect(asm('ADDA.W #4,A0')).toEqual([0xd0fc, 0x0004])
    expect(asm('SUBA.L D0,A1')).toEqual([0x93c0])
    expect(asm('CMPA.L A1,A0')).toEqual([0xb1c9])
  })
  it('encodes the immediate forms', () => {
    expect(asm('ADDI.L #100,D0')).toEqual([0x0680, 0x0000, 0x0064])
    expect(asm('SUBI.W #1,D1')).toEqual([0x0441, 0x0001])
    expect(asm('CMPI.B #$41,(A0)')).toEqual([0x0c10, 0x0041])
  })
  it('round trip: ADD then CMP set registers and flags', () => {
    const p = assemble('  MOVEQ #5,D0\n  ADDI.L #3,D0\n  CMPI.L #8,D0')
    if (Array.isArray(p)) throw new Error('assemble failed')
    const memory = new SystemMemory()
    p.bytecode.forEach((b, i) => memory.write8(p.origin + i, b))
    const cpu = createCPU(p.entry)
    for (let i = 0; i < 3; i++) step(cpu, memory, opcodeTable)
    expect(cpu.registers[Register.D0]).toBe(8)
    expect(cpu.status.Z).toBe(true)
  })
})
```

Test header (top of file) imports: `assemble` from `./index`, `SystemMemory` from `../memory`, `createCPU, step` from `../cpu`, `opcodeTable` from `../cpu/opcodes`, `Register` from `../types/cpu`; plus the `asm` helper from Task 4.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** A shared factory near the encoders' import block keeps ADD/SUB/CMP short:

```ts
// <ea>,Dn form shared by ADD/SUB/CMP.
function eaToDn(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 2 || ops[1].kind !== 'dn') return null
    if (size === 'byte' && ops[0].kind === 'an') return null
    const src = encodeEA(ops[0], size, ctx)
    return [base | (ops[1].n << 9) | (sizeBits(size) << 6) | src.field, ...src.ext]
  }
}

// Dn,<ea> form shared by ADD/SUB (memory destinations only).
function dnToMem(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 2 || ops[0].kind !== 'dn' || !isMemory(ops[1])) return null
    const dst = encodeEA(ops[1], size, ctx)
    return [base | 0x100 | (ops[0].n << 9) | (sizeBits(size) << 6) | dst.field, ...dst.ext]
  }
}

// <ea>,An form shared by ADDA/SUBA/CMPA.
function eaToAn(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 2 || ops[1].kind !== 'an' || size === 'byte') return null
    const src = encodeEA(ops[0], size, ctx)
    return [base | (ops[1].n << 9) | (size === 'long' ? 0x1c0 : 0xc0) | src.field, ...src.ext]
  }
}

// #imm,<ea> form shared by ADDI/SUBI/CMPI.
function immToEa(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 2 || ops[0].kind !== 'imm' || !isDataAlterable(ops[1])) return null
    const dst = encodeEA(ops[1], size, ctx)
    const imm = encodeEA(ops[0], size, ctx)
    return [base | (sizeBits(size) << 6) | dst.field, ...imm.ext, ...dst.ext]
  }
}
```

Wire up: `ADD.encode = eaToDn(0xd000)`, `ADD_MEM.encode = dnToMem(0xd000)`, `SUB`/`SUB_MEM` with `0x9000`, `CMP.encode = eaToDn(0xb000)`, `ADDA/SUBA/CMPA = eaToAn(0xd000 / 0x9000 / 0xb000)` (opmode bits above are OR'd in: word `0xc0`, long `0x1c0`), `ADDI/SUBI/CMPI = immToEa(0x0600 / 0x0400 / 0x0c00)`. Write each as `encode: eaToDn(0xd000),` inside the existing definition object.

Note `ADD Dn,Dn` is claimed by `ADD` (tried first, `ops[1]` is `dn`); `ADD_MEM` only sees memory destinations.

- [ ] **Step 4: Run** — `npx vitest run` → PASS; `npx tsc --noEmit && npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(assembler): ADD/SUB/CMP, ADDA/SUBA/CMPA, ADDI/SUBI/CMPI encoders"
```

---

### Task 6: ADDQ/SUBQ, CLR, TST, JMP, JSR

**Files:**
- Modify: `src/cpu/opcodes.ts` (ADDQ, SUBQ, CLR, TST, JMP, JSR get `encode`; import `isControl`)
- Test: `src/assembler/encode-misc.test.ts` (same `asm` helper)

Encodings: `ADDQ #d,<ea>` = `0101 ddd 0 ss eeeeee`; SUBQ same with bit 8 = 1; d = 1..8, with 8 stored as 0. `CLR` = `0100 0010 ss ee`; `TST` = `0100 1010 ss ee` (data-alterable, no An on 68000). `JMP` = `0100 1110 11 ee` (`$4EC0`), `JSR` = `$4E80`; control modes only.

- [ ] **Step 1: Write the failing test**

```ts
describe('quick / unary / jumps', () => {
  it('encodes ADDQ/SUBQ, storing 8 as 0', () => {
    expect(asm('ADDQ.L #1,D0')).toEqual([0x5280])
    expect(asm('SUBQ.W #8,D1')).toEqual([0x5141])
    expect(asm('ADDQ.W #2,A0')).toEqual([0x5448])
  })
  it('rejects ADDQ values outside 1..8', () => {
    expect(Array.isArray(assemble('  ADDQ.L #9,D0'))).toBe(true)
  })
  it('encodes CLR and TST', () => {
    expect(asm('CLR.L D0')).toEqual([0x4280])
    expect(asm('CLR.W (A0)')).toEqual([0x4250])
    expect(asm('TST.B D2')).toEqual([0x4a02])
    expect(Array.isArray(assemble('  TST.L A0'))).toBe(true)
  })
  it('encodes JMP and JSR', () => {
    expect(asm('JMP (A0)')).toEqual([0x4ed0])
    expect(asm('JSR $3000')).toEqual([0x4eb9, 0x0000, 0x3000])
  })
})
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

```ts
function quick(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 2 || ops[0].kind !== 'imm' || ops[1].kind === 'imm') return null
    if (size === 'byte' && ops[1].kind === 'an') return null
    const d = ctx.eval(ops[0].expr)
    if (ctx.final && (d < 1 || d > 8)) throw new Error(`Quick value ${d} out of range (1..8)`)
    const dst = encodeEA(ops[1], size, ctx)
    return [base | ((d & 7) << 9) | (sizeBits(size) << 6) | dst.field, ...dst.ext]
  }
}

function unary(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 1 || !isDataAlterable(ops[0])) return null
    const dst = encodeEA(ops[0], size, ctx)
    return [base | (sizeBits(size) << 6) | dst.field, ...dst.ext]
  }
}

function jump(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 1 || !isControl(ops[0])) return null
    const ea = encodeEA(ops[0], size, ctx)
    return [base | ea.field, ...ea.ext]
  }
}
```

Wire: `ADDQ.encode = quick(0x5000)`, `SUBQ.encode = quick(0x5100)`, `CLR.encode = unary(0x4200)`, `TST.encode = unary(0x4a00)`, `JMP.encode = jump(0x4ec0)`, `JSR.encode = jump(0x4e80)`. `unary` uses `isDataAlterable`, which excludes `an`/`imm`, so `TST.L A0` returns null and the driver reports "does not accept these operands".

- [ ] **Step 4: Run** — `npx vitest run` → PASS; `npx tsc --noEmit && npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(assembler): ADDQ/SUBQ, CLR, TST, JMP, JSR encoders"
```

---

### Task 7: Branches (Bcc/BRA/BSR) and DBcc

**Files:**
- Modify: `src/cpu/opcodes.ts` (Bcc, BSR, DBcc get `encode`)
- Test: `src/assembler/encode-branch.test.ts` (uses `assemble` with labels; `words` helper as in Task 3)

Semantics (from the handlers): the displacement is relative to the address of the opcode word + 2. Short form (`.S`) puts it in the low byte (must be non-zero, -128..127); word form (default) emits opcode low byte `00` plus a 16-bit extension word. `DBcc Dn,label` always has a 16-bit displacement, relative to the extension word's address (= opcode address + 2, same base).

- [ ] **Step 1: Write the failing test**

```ts
describe('branches', () => {
  it('encodes a backward BRA.S and a forward BNE.W', () => {
    // LOOP at $2000; BRA.S at $2000 -> disp = $2000 - $2002 = -2 -> $FE
    expect(words(ok('LOOP: BRA.S LOOP'))).toEqual([0x60fe])
    // BNE.W (4 bytes) + NOP put DONE at $2006: disp = $2006 - $2002 = 4
    expect(words(ok('  BNE.W DONE\n  NOP\nDONE: NOP'))).toEqual([0x6600, 0x0004, 0x4e71, 0x4e71])
  })
  it('defaults to the word form and encodes BSR', () => {
    expect(words(ok('  BSR SUB\nSUB: RTS'))).toEqual([0x6100, 0x0002, 0x4e75])
  })
  it('encodes every condition name', () => {
    expect(words(ok('L: BEQ.S L'))[0]).toBe(0x67fe)
    expect(words(ok('L: BHI.S L'))[0]).toBe(0x62fe)
    expect(words(ok('L: BGE.S L'))[0]).toBe(0x6cfe)
  })
  it('encodes DBRA / DBEQ with a 16-bit displacement', () => {
    // DBRA D0,LOOP at $2000: ext word at $2002, disp = $2000 - $2002 = -2
    expect(words(ok('LOOP: DBRA D0,LOOP'))).toEqual([0x51c8, 0xfffe])
    expect(words(ok('L: DBEQ D3,L'))).toEqual([0x57cb, 0xfffe])
  })
  it('errors when a short branch cannot reach or has zero displacement', () => {
    const far = '  BRA.S FAR\n  DS.B 200\nFAR: NOP'
    expect(errs(far)[0].message).toMatch(/out of range/)
    expect(errs('  BRA.S NEXT\nNEXT: NOP')[0].message).toMatch(/zero/)
  })
  it('round trip: a DBRA loop adds up', () => {
    const p = ok('  MOVEQ #0,D1\n  MOVEQ #3,D0\nLOOP: ADDQ.L #2,D1\n  DBRA D0,LOOP\n  TRAP #0')
    const memory = new SystemMemory()
    p.bytecode.forEach((b, i) => memory.write8(p.origin + i, b))
    const cpu = createCPU(p.entry)
    for (let i = 0; i < 100 && !cpu.halted; i++) step(cpu, memory, opcodeTable)
    expect(cpu.registers[Register.D1]).toBe(8) // 4 iterations x 2
  })
})
```

Test header imports: `ok`/`words`/`errs` helpers copied from Task 3, plus `SystemMemory`, `createCPU`, `step`, `opcodeTable`, `Register` as in Task 4.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

```ts
function branch(base: number, useCc: boolean): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 1 || ops[0].kind !== 'abs') return null
    if (size === 'long') throw new Error('Branches are .S or .W only')
    const opcode = base | (useCc ? (ctx.cc ?? 0) << 8 : 0)
    const disp = ctx.eval(ops[0].expr) - (ctx.pc + 2)
    if (size === 'byte') {
      if (ctx.final && disp === 0) throw new Error('Short branch with zero displacement (use .W)')
      if (ctx.final && (disp < -128 || disp > 127)) throw new Error(`Branch displacement ${disp} out of range for .S`)
      return [opcode | (disp & 0xff)]
    }
    if (ctx.final && (disp < -32768 || disp > 32767)) throw new Error(`Branch displacement ${disp} out of range`)
    return [opcode, disp & 0xffff]
  }
}
```

`Bcc.encode = branch(0x6000, true)`, `BSR.encode = branch(0x6100, false)`.

Important: the driver's default size is `'word'` when there's no suffix — that yields the word form as the spec requires — and `.S` maps to `'byte'`.

DBcc:

```ts
  encode: (ops, _size, ctx) => {
    if (ops.length !== 2 || ops[0].kind !== 'dn' || ops[1].kind !== 'abs') return null
    const disp = ctx.eval(ops[1].expr) - (ctx.pc + 2)
    if (ctx.final && (disp < -32768 || disp > 32767)) throw new Error(`DBcc displacement ${disp} out of range`)
    return [0x50c8 | ((ctx.cc ?? 0) << 8) | ops[0].n, disp & 0xffff]
  },
```

- [ ] **Step 4: Run** — `npx vitest run` → PASS; `npx tsc --noEmit && npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(assembler): Bcc/BRA/BSR and DBcc encoders"
```

---

### Task 8: End-to-end programs

**Files:**
- Test: `src/assembler/programs.test.ts` (no production code expected; a failure here means an encoder bug — fix it in the task that owns the encoder and add a unit test there)

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect } from 'vitest'
import { assemble } from './index'
import { SystemMemory, FRAMEBUFFER_START, FRAMEBUFFER_WIDTH, FRAMEBUFFER_BYTES_PER_PIXEL } from '../memory'
import { createCPU, step } from '../cpu'
import { opcodeTable } from '../cpu/opcodes'
import { Register } from '../types/cpu'

function run(source: string) {
  const p = assemble(source)
  if (Array.isArray(p)) throw new Error(JSON.stringify(p))
  const memory = new SystemMemory()
  p.bytecode.forEach((b, i) => memory.write8(p.origin + i, b))
  const cpu = createCPU(p.entry)
  for (let i = 0; i < 10_000 && !cpu.halted; i++) step(cpu, memory, opcodeTable)
  return { cpu, memory }
}

const SAMPLE = `; Retro 68K Assembly Example
        ORG     $2000
START:
        MOVE.L  #100,D0
        MOVE.L  #200,D1
        ADD.L   D1,D0
        MOVE.L  #$40000,A0
        MOVE.L  #$FFFFFF,(A0)
        TRAP    #0
        END     START
`

describe('programs', () => {
  it('runs the App.tsx sample program', () => {
    const { cpu, memory } = run(SAMPLE)
    expect(cpu.registers[Register.D0]).toBe(300)
    expect(memory.read32(FRAMEBUFFER_START)).toBe(0x00ffffff)
    expect(cpu.halted).toBe(true)
  })

  it('prints a DC.B string with TRAP #1', () => {
    const { memory } = run(`
        ORG     $2000
        LEA     MSG,A0
        MOVEQ   #0,D0
        MOVEQ   #0,D1
        MOVE.L  #$FF0000FF,D2
        TRAP    #1
        TRAP    #0
MSG:    DC.B    "Hi",0
        END
`)
    const px = (x: number, y: number) =>
      memory.read32(FRAMEBUFFER_START + (y * FRAMEBUFFER_WIDTH + x) * FRAMEBUFFER_BYTES_PER_PIXEL)
    // 'H' row 0 = 0x33: bits 0,1,4,5 set (bit 0 = leftmost) - verify against src/graphics/font.ts
    expect(px(0, 0)).toBe(0xff0000ff)
    expect(px(2, 0)).toBe(0)
  })

  it('runs a subroutine call (BSR/RTS) with a stack', () => {
    const { cpu } = run(`
        ORG     $2000
        MOVEQ   #1,D0
        BSR     DOUBLE
        BSR     DOUBLE
        TRAP    #0
DOUBLE: ADD.L   D0,D0
        RTS
`)
    expect(cpu.registers[Register.D0]).toBe(4)
  })
})
```

Note: the App.tsx sample uses `ORG $1000`, which is inside the system area (`SYSTEM_END = $1FFF`); this test uses `$2000` (`USER_RAM_START`). Changing the sample in `App.tsx` to match is a one-line follow-up — do it here and mention it in the commit message.

- [ ] **Step 2: Run** — `npx vitest run` → PASS (fix encoder bugs, not tests, if the round trip disagrees with the manual). `npx tsc --noEmit && npm run lint`.

- [ ] **Step 3: Commit**

```bash
git add src
git commit -m "test(assembler): end-to-end sample, TRAP #1 string and BSR programs"
```

---

### Task 9: Docs, PDFs, CLAUDE.md

**Files:**
- Create: `docs/ASSEMBLER.md` (dev doc: pipeline, syntax, directives, encoder contract `encode(...)`, how to add a mnemonic — one commit per mnemonic — and known limits: forward refs in EQU/DS, abs always long, no relaxation)
- Modify: `docs/user/REFERENCE.md` (new assembler section: syntax, directives, supported mnemonics table), `docs/user/PRESENTATION.md` (roadmap: Assembler row), `docs/ARCHITECTURE.md` (pipeline section), `scripts/lib/docs-html.js` `SECTIONS` (add `ASSEMBLER.md`), `CLAUDE.md` (status: "Assembler: v1 library implemented, subset listed; UI wiring pending"), the `/memory` note `project_*` if any goes stale.

Follow CLAUDE.md doc conventions: category tables with one-sentence cells, no backticked code in linkable headings, no literal triple-backtick in inline code, no heading text duplicated across files combined into the same PDF, define assembly idioms (label, directive, two-pass) at first use for this reader. Do not port examples from `EXAMPLES.md`/`QUICK_REFERENCE.md`.

- [ ] **Step 1:** Write the docs above.
- [ ] **Step 2:** Line-length scan and split/collision link scan from CLAUDE.md "Doc workflow" (both scripts verbatim).
- [ ] **Step 3:** `npm run docs:pdf && npm run docs:pdf:user`.
- [ ] **Step 4:** `pdftotext`/`pdftoppm` the pages the new sections landed on and `Read` the PNGs.
- [ ] **Step 5:** Final `npx vitest run && npx tsc --noEmit && npm run lint`, then commit:

```bash
git add docs CLAUDE.md scripts
git commit -m "docs: document the assembler v1"
```

Try `git push` once; if it fails on credentials, say so and leave it to Laurent.

---

## Self-review

- **Spec coverage:** public interface (T3), modules (T1-3; lexer merged, noted), `encodeEA` (T3), v1 subset (T3-7: NOP/RTS/TRAP; MOVE/MOVEA/MOVEQ/LEA; ADD/SUB/CMP + A/I variants; ADDQ/SUBQ/CLR/TST/JMP/JSR; Bcc/BRA/BSR/DBcc), two passes (T3), syntax and directives (T1-3), branch sizes and range errors (T7), tests incl. round trip, sample, TRAP #1 (T4-8), docs (T9). "Not assemblable yet" error (T3).
- **Known soft spot:** the TRAP #1 pixel assertion in T8 depends on `font.ts` ('H' row 0); expected opcode words in T3-T7 were hand-checked against the manual's bit layouts.
- **Type consistency:** `encode(ops, size, ctx)`, `EncodeContext.{pc,cc,final,eval}`, `Operand` kinds and the helper names `encodeEA`/`sizeBits`/`immWords`/`isMemory`/`isDataAlterable`/`isControl`/`CONDITIONS` are used identically across tasks.
