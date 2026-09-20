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
