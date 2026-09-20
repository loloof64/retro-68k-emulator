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
const REG = '(?:[DA][0-7]|SP)'
const LIST = new RegExp(`^${REG}(?:-${REG})?(?:/${REG}(?:-${REG})?)+$|^${REG}-${REG}$`, 'i')

// 'D0-D3/A0' -> mask with bit0 = D0 .. bit15 = A7.
function listMask(text: string): number {
  const index = (r: string) => {
    const u = r.toUpperCase()
    return u === 'SP' ? 15 : (u[0] === 'A' ? 8 : 0) + Number(u[1])
  }
  let mask = 0
  for (const part of text.split('/')) {
    const [a, b = a] = part.split('-').map(index)
    if (a > b) throw new Error(`Bad register range '${part}'`)
    for (let i = a; i <= b; i++) mask |= 1 << i
  }
  return mask
}

const regNum = (r: string): number => {
  const u = r.toUpperCase()
  if (u === 'SP') return 7
  return Number(u[1])
}

export function parseOperand(raw: string): Operand {
  const text = raw.trim()
  let m: RegExpMatchArray | null
  if ((m = text.match(/^D([0-7])$/i))) return { kind: 'dn', n: Number(m[1]) }
  if ((m = text.match(new RegExp(`^${AN}$`, 'i')))) return { kind: 'an', n: regNum(m[1]) }
  if (/^CCR$/i.test(text)) return { kind: 'ccr' }
  if (/^SR$/i.test(text)) return { kind: 'sr' }
  if (LIST.test(text)) return { kind: 'list', mask: listMask(text) }
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
