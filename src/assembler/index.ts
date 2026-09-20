import type { AssembledProgram, OpcodeDefinition } from '../types/cpu'
import { opcodeTable } from '../cpu/opcodes'
import { USER_RAM_START } from '../memory'
import { CONDITIONS } from './encodeEA'
import { evalExpr, parseOperand } from './operands'
import { parseLine, type ParsedLine } from './parser'
import type { AssemblerError, EncodeContext, Size } from './types'

export type { AssemblerError } from './types'

// An Error that knows which column it points at (default: the mnemonic's).
class AsmError extends Error {
  constructor(message: string, readonly column?: number) {
    super(message)
  }
}

// Runs `fn`, pointing any error it throws at `column` unless it already points somewhere.
function at<T>(column: number, fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof AsmError || !(e instanceof Error)) throw e
    throw new AsmError(e.message, column)
  }
}

// Evaluates `expr`, blaming the operand of `p` that contains it.
function evalAt(p: ParsedLine, expr: string, lookup: (n: string) => number | undefined): number {
  const i = Math.max(0, p.operands.findIndex((o) => o.includes(expr)))
  const col = (p.operandColumns[i] ?? p.column) + Math.max(0, (p.operands[i] ?? '').indexOf(expr))
  return at(col, () => evalExpr(expr, lookup))
}

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

const ALIASES: Record<string, string> = { MOVEA: 'MOVE', EOR: 'XOR' }

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
  } else if (name[0] === 'S' && name.slice(1) in CONDITIONS) {
    base = 'SCC'
    cc = CONDITIONS[name.slice(1)]
  }
  const defs = encodable.get(base)
  if (defs) return { defs, cc }
  if (known.has(base)) throw new Error(`'${name}' is not assemblable yet`)
  throw new Error(`Unknown mnemonic '${name}'`)
}

// Suffixes that make no sense at all, so they are errors instead of being ignored.
const NO_SUFFIX = new Set(['NOP', 'RTS', 'RTR', 'TRAPV', 'ILLEGAL', 'TRAP', 'UNLK', 'JMP', 'JSR'])

function checkSuffix(p: ParsedLine, defs: OpcodeDefinition[]): void {
  if (p.size === undefined) return
  const name = defs[0].mnemonic.toUpperCase()
  const bad = () => new Error(`'.${p.size}' is not a valid size for ${p.mnemonic}`)
  if (p.size === 'S') {
    if (name !== 'BCC' && name !== 'BSR') throw bad()
    return
  }
  if (NO_SUFFIX.has(name) || (name === 'DBCC' && p.size !== 'W')) throw bad()
  const size = SIZE_LETTERS[p.size]
  // SWAP is declared 'long' in the table but is .W on real hardware.
  if (size && !defs.some((d) => d.size === 'variable' || d.size === size || (name === 'SWAP' && size === 'word'))) throw bad()
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

const DC_RANGE = { byte: [-128, 255], word: [-32768, 65535], long: [-(2 ** 31), 2 ** 32 - 1] } as const

function emitData(p: ParsedLine, pc: number, lookup: Lookup): number[] {
  const size = parseSize(p.size ?? 'W')
  if (size === 'byte' && p.size === 'S') throw new Error(`'.S' is not a valid size for ${p.mnemonic}`)
  if (size !== 'byte' && pc % 2 !== 0) throw new Error(`${p.mnemonic}.${p.size ?? 'W'} at an odd address (add EVEN before it)`)
  if (p.mnemonic === 'DS') {
    const count = evalAt(p, p.operands[0] ?? '', lookup)
    if (count < 0) throw new Error('DS count must be >= 0')
    return new Array(count * widthOf(size)).fill(0)
  }
  const out: number[] = []
  for (const [i, op] of p.operands.entries()) {
    if (op.startsWith('"')) {
      if (size !== 'byte' || !op.endsWith('"') || op.length < 2) throw new Error('Strings are only allowed in DC.B')
      for (const ch of op.slice(1, -1)) {
        if (ch.charCodeAt(0) > 255) throw new Error(`Character '${ch}' is not 8-bit`)
        out.push(ch.charCodeAt(0))
      }
    } else {
      const value = evalAt(p, op, lookup)
      const [min, max] = DC_RANGE[size]
      if (value < min || value > max) throw new AsmError(`DC value ${value} does not fit in ${widthOf(size)} byte(s) (${min}..${max})`, p.operandColumns[i])
      out.push(...toBytes(value >>> 0, widthOf(size)))
    }
  }
  return out
}

function emitInstruction(p: ParsedLine, pc: number, lookup: Lookup, final: boolean): number[] {
  if (pc % 2 !== 0) throw new Error('Instruction at an odd address (add EVEN before it)')
  const { defs, cc } = resolveMnemonic(p.mnemonic ?? '')
  checkSuffix(p, defs)
  const size = parseSize(p.size)
  const ops = p.operands.map((o, i) => at(p.operandColumns[i], () => parseOperand(o)))
  const ctx: EncodeContext = { pc, cc, final, eval: (e) => evalAt(p, e, lookup) }
  for (const def of defs) {
    const words = def.encode!(ops, size, ctx)
    if (words) return words.flatMap((w) => [w >> 8, w & 0xff])
  }
  throw new Error(`${p.mnemonic} does not accept these operands`)
}

// --- driver --------------------------------------------------------------

interface MeasuredLine {
  p: ParsedLine
  pc: number
  len: number
}

export function assemble(source: string): AssembledProgram | AssemblerError[] {
  const errors: AssemblerError[] = []
  const fail = (p: ParsedLine, e: unknown) =>
    errors.push({
      line: p.line,
      column: (e instanceof AsmError && e.column) || p.column,
      message: e instanceof Error ? e.message : String(e),
    })

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
  const records: MeasuredLine[] = []

  for (const p of parsed) {
    try {
      const isEqu = p.mnemonic === 'EQU'
      const bind = () => {
        if (p.label && !isEqu) {
          if (symbols.has(p.label)) throw new AsmError(`Duplicate label '${p.label}'`, p.labelColumn)
          symbols.set(p.label, pc)
          labels.set(p.label, pc)
        }
      }
      // ORG/EVEN move pc first, so their own label binds to the moved pc.
      if (p.mnemonic !== 'ORG' && p.mnemonic !== 'EVEN') bind()
      if (!p.mnemonic) continue
      if (isEqu) {
        if (!p.label) throw new Error('EQU needs a label')
        if (symbols.has(p.label)) throw new AsmError(`Duplicate label '${p.label}'`, p.labelColumn)
        symbols.set(p.label, evalAt(p, p.operands[0] ?? '', strict))
        continue
      }
      if (p.mnemonic === 'END') {
        entryExpr = p.operands[0]
        break
      }
      if (p.mnemonic === 'ORG') {
        const addr = evalAt(p, p.operands[0] ?? '', strict)
        if (!emitted) origin = addr
        else if (addr < pc) throw new Error('ORG cannot move backwards')
        pc = addr
        bind()
        continue
      }
      if (p.mnemonic === 'EVEN') {
        if (pc % 2) {
          records.push({ p, pc, len: 1 })
          pc += 1
          emitted = true
        }
        bind()
        continue
      }
      const bytes =
        p.mnemonic === 'DC' || p.mnemonic === 'DS'
          ? emitData(p, pc, lenient)
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
            ? emitData(p, at, strict)
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
