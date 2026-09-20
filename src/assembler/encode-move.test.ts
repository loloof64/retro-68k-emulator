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

describe('MOVE', () => {
  it('encodes register-to-register by size', () => {
    expect(asm('MOVE.L D1,D0')).toEqual([0x2001])
    expect(asm('MOVE.W D1,D0')).toEqual([0x3001])
    expect(asm('MOVE.B D1,D0')).toEqual([0x1001])
  })
  it('appends immediate and address extension words in source-then-dest order', () => {
    expect(asm('MOVE.L #100,D0')).toEqual([0x203c, 0x0000, 0x0064])
    expect(asm('MOVE.W #5,(A0)')).toEqual([0x30bc, 0x0005])
    expect(asm('MOVE.L D0,$40000')).toEqual([0x23c0, 0x0004, 0x0000])
    expect(asm('MOVE.W 4(A1),D2')).toEqual([0x3429, 0x0004])
  })
  it('encodes MOVE/MOVEA to an address register, and pre/post-modify modes', () => {
    expect(asm('MOVE.L #$40000,A0')).toEqual([0x207c, 0x0004, 0x0000])
    expect(asm('MOVEA.W D0,A1')).toEqual([0x3240])
    expect(asm('MOVE.L (A0)+,-(A1)')).toEqual([0x2318])
  })
  it('rejects an immediate destination', () => {
    expect(Array.isArray(assemble('  MOVE.L D0,#1'))).toBe(true)
  })
})

describe('MOVEQ', () => {
  it('encodes signed 8-bit immediates', () => {
    expect(asm('MOVEQ #5,D3')).toEqual([0x7605])
    expect(asm('MOVEQ #-1,D0')).toEqual([0x70ff])
  })
  it('rejects out-of-range values', () => {
    expect(Array.isArray(assemble('  MOVEQ #200,D0'))).toBe(true)
  })
})

describe('LEA', () => {
  it('encodes control addressing modes', () => {
    expect(asm('LEA (A0),A1')).toEqual([0x43d0])
    expect(asm('LEA 8(A2),A0')).toEqual([0x41ea, 0x0008])
    expect(asm('LEA $3000,A0')).toEqual([0x41f9, 0x0000, 0x3000])
  })
})

describe('round trip', () => {
  it('runs MOVE.L #100,D0 / MOVEQ #7,D1 through the real decoder', () => {
    const p = assemble('  MOVE.L #100,D0\n  MOVEQ #7,D1')
    if (Array.isArray(p)) throw new Error('assemble failed')
    const memory = new SystemMemory()
    p.bytecode.forEach((b, i) => memory.write8(p.origin + i, b))
    const cpu = createCPU(p.entry)
    step(cpu, memory, opcodeTable)
    step(cpu, memory, opcodeTable)
    expect(cpu.registers[Register.D0]).toBe(100)
    expect(cpu.registers[Register.D1]).toBe(7)
  })
})
