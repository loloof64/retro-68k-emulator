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
