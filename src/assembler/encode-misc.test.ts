import { describe, it, expect } from 'vitest'
import { assemble } from './index'
import { SystemMemory } from '../memory'
import { createCPU, step } from '../cpu'
import { opcodeTable } from '../cpu/opcodes'
import { Register } from '../types/cpu'

const asm = (src: string): number[] => {
  const p = assemble(`  ${src}`)
  if (Array.isArray(p)) throw new Error(JSON.stringify(p))
  const out: number[] = []
  for (let i = 0; i < p.bytecode.length; i += 2) out.push((p.bytecode[i] << 8) | p.bytecode[i + 1])
  return out
}

const run = (src: string, steps: number) => {
  const p = assemble(src)
  if (Array.isArray(p)) throw new Error(JSON.stringify(p))
  const memory = new SystemMemory()
  p.bytecode.forEach((b, i) => memory.write8(p.origin + i, b))
  const cpu = createCPU(p.entry)
  for (let i = 0; i < steps; i++) step(cpu, memory, opcodeTable)
  return cpu
}

describe('quick / unary / jumps', () => {
  it('encodes ADDQ/SUBQ, storing 8 as 0', () => {
    expect(asm('ADDQ.L #1,D0')).toEqual([0x5280])
    expect(asm('SUBQ.W #8,D1')).toEqual([0x5141])
    expect(asm('ADDQ.W #2,A0')).toEqual([0x5448])
  })
  it('rejects ADDQ values outside 1..8', () => {
    expect(Array.isArray(assemble('  ADDQ.L #9,D0'))).toBe(true)
  })
  it('encodes CLR and TST', () => {
    expect(asm('CLR.L D0')).toEqual([0x4280])
    expect(asm('CLR.W (A0)')).toEqual([0x4250])
    expect(asm('TST.B D2')).toEqual([0x4a02])
    expect(Array.isArray(assemble('  TST.L A0'))).toBe(true)
  })
  it('encodes JMP and JSR', () => {
    expect(asm('JMP (A0)')).toEqual([0x4ed0])
    expect(asm('JSR $3000')).toEqual([0x4eb9, 0x0000, 0x3000])
  })
  it('round trip: MOVEQ/ADDQ/SUBQ/CLR', () => {
    const cpu = run('  MOVEQ #1,D0\n  ADDQ.L #2,D0\n  SUBQ.L #1,D0', 3)
    expect(cpu.registers[Register.D0]).toBe(2)
    const cleared = run('  MOVEQ #5,D0\n  CLR.L D0', 2)
    expect(cleared.registers[Register.D0]).toBe(0)
    expect(cleared.status.Z).toBe(true)
  })
  it('round trip: JMP skips an instruction', () => {
    const cpu = run('  JMP skip\n  MOVEQ #1,D0\nskip:\n  MOVEQ #2,D1', 2)
    expect(cpu.registers[Register.D0]).toBe(0)
    expect(cpu.registers[Register.D1]).toBe(2)
  })
})
