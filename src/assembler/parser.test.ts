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
