import { splitOperands } from './operands'

export interface ParsedLine {
  line: number
  column: number
  label?: string
  labelColumn: number
  operandColumns: number[] // 1-based column of each operand, parallel to `operands`
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
  const first = text.match(/^\s*(\S+?:|\S+)/)!
  const startsAtCol0 = !/^\s/.test(text)
  if (startsAtCol0 || first[1].endsWith(':')) {
    label = first[1].replace(/:$/, '')
    offset = first[0].length
    rest = text.slice(offset)
  }

  const labelColumn = text.length - text.trimStart().length + 1
  const m = rest.match(/^(\s*)(\S+)\s*(.*)$/)
  if (!m) return { line: lineNo, column: 1, label, labelColumn, operandColumns: [], operands: [] }

  const [name, ...sizePart] = m[2].split('.')
  const operands = splitOperands(m[3])
  let cursor = offset + rest.length - m[3].length
  const operandColumns = operands.map((op) => {
    const start = text.indexOf(op, cursor)
    cursor = start + op.length
    return start + 1
  })
  return {
    line: lineNo,
    column: offset + m[1].length + 1,
    label,
    labelColumn,
    operandColumns,
    mnemonic: name.toUpperCase(),
    size: sizePart.length ? sizePart.join('.').toUpperCase() : undefined,
    operands,
  }
}
