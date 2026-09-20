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
    const e = errs('  FOO\n  NOP\n  TRAP #99\n  MOVEP D0,D1')
    expect(e.map((x) => x.line)).toEqual([1, 3, 4])
    expect(e[0].message).toMatch(/Unknown mnemonic 'FOO'/)
    expect(e[2].message).toMatch(/MOVEP does not accept these operands/)
  })
  it('rejects duplicate labels, undefined symbols and odd-address instructions', () => {
    expect(errs('A: NOP\nA: NOP')[0].message).toMatch(/Duplicate label/)
    expect(errs('  DC.L NOPE')[0].message).toMatch(/Undefined symbol/)
    expect(errs('  DC.B 1\n  NOP')[0].message).toMatch(/odd address/)
  })
  it('binds a label on an ORG line to the new address', () => {
    const p = ok('START ORG $3000\n NOP\n END START')
    expect(p.origin).toBe(0x3000)
    expect(p.entry).toBe(0x3000)
    expect(p.labels.get('START')).toBe(0x3000)
  })
  it('binds a label on an EVEN line after the padding', () => {
    const p = ok('  DC.B 1\nL EVEN\n NOP')
    expect(p.labels.get('L')).toBe(p.origin + 2)
    expect(p.bytecode.length).toBe(4)
  })
})

describe('deferred follow-ups', () => {
  it('range-checks DC values', () => {
    expect(errs('  DC.B 256')[0].message).toMatch(/does not fit/)
    expect(errs('  DC.B -129')[0].message).toMatch(/does not fit/)
    expect(errs('  DC.W 65536')[0].message).toMatch(/does not fit/)
    expect(errs('  DC.L 4294967296')[0].message).toMatch(/does not fit/)
    expect(ok('  DC.B -128,255\n  DC.W -1,65535').bytecode.length).toBe(6)
  })
  it('flags DC.W/DC.L/DS.W at an odd address', () => {
    expect(errs('  DC.B 1\n  DC.W 2')[0].message).toMatch(/odd address/)
    expect(errs('  DC.B 1\n  DC.L 2')[0].message).toMatch(/odd address/)
    expect(errs('  DC.B 1\n  DS.W 2')[0].message).toMatch(/odd address/)
    expect(ok('  DC.B 1,2\n  DC.W 2').bytecode.length).toBe(4)
  })
  it('rejects meaningless size suffixes', () => {
    for (const src of ['NOP.L', 'RTS.W', 'MULU.L D0,D1', 'ABCD.W D0,D1', 'MOVE.S D0,D1', 'DBRA.L D0,L', 'SEQ.W D0', 'LEA.W (A0),A1'])
      expect(errs(`L: ${src}`)[0].message).toMatch(/not a valid size/)
    for (const src of ['NOP', 'MULU.W D0,D1', 'ABCD D0,D1', 'SWAP.W D0', 'SEQ.B D0', 'LEA.L (A0),A1', 'BSR.S L', 'DBRA.W D0,L'])
      expect(Array.isArray(assemble(`L: ${src}`))).toBe(false)
  })
  it('points errors at the offending column', () => {
    expect(errs('  MOVE.L #1,FOO')[0].column).toBe(13)
    expect(errs('  DC.B 1,300')[0].column).toBe(10)
    expect(errs('  DC.B 1,2\nA: NOP\n  ADD.L D0,D1,D2')[0].column).toBe(3)
    expect(errs('A: NOP\nA: NOP')[0].column).toBe(1)
  })
  it('covers the assembler test gaps', () => {
    expect(ok('  ADDQ.L #8,D0').bytecode).toEqual(new Uint8Array([0x50, 0x80]))
    expect(ok('L: NOP\n  BSR.S L').bytecode[2]).toBe(0x61)
    expect(errs('L: BRA.L L')[0].message).toMatch(/\.S or \.W only/)
    expect(errs('  DBRA D0,FAR\n  DS.B 40000\nFAR: NOP')[0].message).toMatch(/out of range/)
    expect(errs('  MOVE D0')[0].message).toMatch(/does not accept/)
    expect(errs('  ADD.L #1,#2')[0].message).toMatch(/does not accept/)
    expect(errs('  LEA D0,A1')[0].message).toMatch(/does not accept/)
    expect(errs('  MOVE.L (A0,A1')[0]).toBeDefined()
  })
})
