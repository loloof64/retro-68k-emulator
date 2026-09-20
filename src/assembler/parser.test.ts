import { describe, it, expect } from 'vitest'
import { parseLine } from './parser'

describe('parseLine', () => {
  it('skips blank and comment-only lines', () => {
    expect(parseLine('', 1)).toBeNull()
    expect(parseLine('   ; hi', 1)).toBeNull()
    expect(parseLine('* old style', 1)).toBeNull()
  })
  it('parses label, mnemonic, size and operands', () => {
    expect(parseLine('START:  MOVE.L  #100,D0   ; load', 3)).toMatchObject({
      line: 3, column: 9, label: 'START', mnemonic: 'MOVE', size: 'L', operands: ['#100', 'D0'],
    })
  })
  it('treats a column-0 word as a label even without a colon', () => {
    expect(parseLine('LOOP', 1)).toMatchObject({ line: 1, column: 1, label: 'LOOP', operands: [] })
    expect(parseLine('LEN EQU 4', 1)).toMatchObject({ label: 'LEN', mnemonic: 'EQU', operands: ['4'] })
  })
  it('parses an indented instruction with no label', () => {
    expect(parseLine('        RTS', 1)).toMatchObject({ mnemonic: 'RTS', operands: [] })
  })
  it('does not treat ; inside a string as a comment', () => {
    expect(parseLine('  DC.B "a;b",0', 1)).toMatchObject({ mnemonic: 'DC', size: 'B', operands: ['"a;b"', '0'] })
  })
  it('splits LABEL:MNEMONIC written without a space', () => {
    expect(parseLine('LOOP:NOP', 1)).toMatchObject({
      line: 1, column: 6, label: 'LOOP', mnemonic: 'NOP', size: undefined, operands: [],
    })
  })
  it('does not mistake a colon inside a string for a label colon', () => {
    const p = parseLine('  DC.B "a:b",0', 1)
    expect(p).toMatchObject({ mnemonic: 'DC', size: 'B', operands: ['"a:b"', '0'] })
    expect(p?.label).toBeUndefined()
  })
})

describe('parseLine columns', () => {
  it('records the label and operand columns', () => {
    expect(parseLine('  LOOP: MOVE.L #1,D0', 1)).toMatchObject({ labelColumn: 3, operandColumns: [16, 19] })
  })
})
