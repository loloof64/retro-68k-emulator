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
