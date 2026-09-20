import { describe, it, expect } from 'vitest'
import { assemble } from './index'
import type { AssembledProgram } from '../types/cpu'
import type { AssemblerError } from './types'
import { SystemMemory } from '../memory'
import { createCPU, step } from '../cpu'
import { opcodeTable } from '../cpu/opcodes'
import { Register } from '../types/cpu'

const ok = (source: string): AssembledProgram => {
  const result = assemble(source)
  if (Array.isArray(result)) throw new Error(JSON.stringify(result))
  return result
}
const words = (p: AssembledProgram): number[] => {
  const out: number[] = []
  for (let i = 0; i < p.bytecode.length; i += 2) out.push((p.bytecode[i] << 8) | p.bytecode[i + 1])
  return out
}
const errs = (source: string): AssemblerError[] => {
  const result = assemble(source)
  if (!Array.isArray(result)) throw new Error('expected errors')
  return result
}

describe('branches', () => {
  it('encodes a backward BRA.S and a forward BNE.W', () => {
    expect(words(ok('LOOP: BRA.S LOOP'))).toEqual([0x60fe])
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
    expect(cpu.registers[Register.D1]).toBe(8)
  })
})
