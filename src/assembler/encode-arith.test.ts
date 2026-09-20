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

describe('ADD/SUB/CMP', () => {
  it('encodes <ea>,Dn and Dn,<ea>', () => {
    expect(asm('ADD.L D1,D0')).toEqual([0xd081])
    expect(asm('ADD.W (A0),D2')).toEqual([0xd450])
    expect(asm('ADD.L D0,(A1)')).toEqual([0xd191])
    expect(asm('ADD.B #1,D0')).toEqual([0xd03c, 0x0001])
    expect(asm('SUB.L D1,D0')).toEqual([0x9081])
    expect(asm('SUB.W D3,4(A0)')).toEqual([0x9768, 0x0004])
    expect(asm('CMP.L D1,D0')).toEqual([0xb081])
    expect(asm('CMP.W #10,D3')).toEqual([0xb67c, 0x000a])
  })
  it('encodes the address-register forms', () => {
    expect(asm('ADDA.L D0,A1')).toEqual([0xd3c0])
    expect(asm('ADDA.W #4,A0')).toEqual([0xd0fc, 0x0004])
    expect(asm('SUBA.L D0,A1')).toEqual([0x93c0])
    expect(asm('CMPA.L A1,A0')).toEqual([0xb1c9])
  })
  it('encodes the immediate forms', () => {
    expect(asm('ADDI.L #100,D0')).toEqual([0x0680, 0x0000, 0x0064])
    expect(asm('SUBI.W #1,D1')).toEqual([0x0441, 0x0001])
    expect(asm('CMPI.B #$41,(A0)')).toEqual([0x0c10, 0x0041])
  })
  it('sends ADD Dn,Dn to ADD (direction bit clear), not ADD_MEM', () => {
    expect(asm('ADD.W D0,D1')).toEqual([0xd240])
  })
  it('rejects invalid operand combinations', () => {
    expect(Array.isArray(assemble('  ADD.B A0,D0'))).toBe(true)
    expect(Array.isArray(assemble('  ADDA.B D0,A0'))).toBe(true)
    expect(Array.isArray(assemble('  ADD.L D0,#1'))).toBe(true)
    expect(Array.isArray(assemble('  CMP.L D0,(A0)'))).toBe(true)
    expect(Array.isArray(assemble('  ADDI.L #1,A0'))).toBe(true)
  })
  it('round trip: ADD then CMP set registers and flags', () => {
    const p = assemble('  MOVEQ #5,D0\n  ADDI.L #3,D0\n  CMPI.L #8,D0')
    if (Array.isArray(p)) throw new Error('assemble failed')
    const memory = new SystemMemory()
    p.bytecode.forEach((b, i) => memory.write8(p.origin + i, b))
    const cpu = createCPU(p.entry)
    for (let i = 0; i < 3; i++) step(cpu, memory, opcodeTable)
    expect(cpu.registers[Register.D0]).toBe(8)
    expect(cpu.status.Z).toBe(true)
  })
})
