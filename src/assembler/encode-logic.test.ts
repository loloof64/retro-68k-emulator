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
const bad = (src: string) => Array.isArray(assemble(`  ${src}`))

const run = (src: string, steps: number) => {
  const p = assemble(src)
  if (Array.isArray(p)) throw new Error(JSON.stringify(p))
  const memory = new SystemMemory()
  p.bytecode.forEach((b, i) => memory.write8(p.origin + i, b))
  const cpu = createCPU(p.entry)
  for (let i = 0; i < steps; i++) step(cpu, memory, opcodeTable)
  return cpu
}

describe('logic, unary, mul/div', () => {
  it('encodes AND/OR/EOR', () => {
    expect(asm('AND.L D1,D0')).toEqual([0xc081])
    expect(asm('AND.W (A0),D2')).toEqual([0xc450])
    expect(asm('AND.B D0,(A1)')).toEqual([0xc111])
    expect(asm('OR.L #$F0,D0')).toEqual([0x80bc, 0x0000, 0x00f0])
    expect(asm('OR.W D3,(A2)')).toEqual([0x8752])
    expect(asm('EOR.L D1,D0')).toEqual([0xb380])
    expect(asm('EOR.B D2,(A0)')).toEqual([0xb510])
  })
  it('encodes the immediate logic forms', () => {
    expect(asm('ANDI.B #$0F,D0')).toEqual([0x0200, 0x000f])
    expect(asm('ORI.W #$8000,D1')).toEqual([0x0041, 0x8000])
    expect(asm('EORI.L #1,(A0)')).toEqual([0x0a90, 0x0000, 0x0001])
  })
  it('encodes NOT/NEG/NEGX/TAS/NBCD', () => {
    expect(asm('NOT.W D0')).toEqual([0x4640])
    expect(asm('NEG.L D1')).toEqual([0x4481])
    expect(asm('NEGX.B (A0)')).toEqual([0x4010])
    expect(asm('TAS D0')).toEqual([0x4ac0])
    expect(asm('NBCD (A1)')).toEqual([0x4811])
  })
  it('encodes MULU/MULS/DIVU/DIVS/CHK', () => {
    expect(asm('MULU D1,D0')).toEqual([0xc0c1])
    expect(asm('MULS #3,D2')).toEqual([0xc5fc, 0x0003])
    expect(asm('DIVU (A0),D1')).toEqual([0x82d0])
    expect(asm('DIVS D3,D0')).toEqual([0x81c3])
    expect(asm('CHK D1,D0')).toEqual([0x4181])
  })
  it('encodes the register / address helpers', () => {
    expect(asm('SWAP D3')).toEqual([0x4843])
    expect(asm('EXT.W D0')).toEqual([0x4880])
    expect(asm('EXT.L D1')).toEqual([0x48c1])
    expect(asm('PEA 4(A0)')).toEqual([0x4868, 0x0004])
    expect(asm('EXG D0,D1')).toEqual([0xc141])
    expect(asm('EXG A0,A1')).toEqual([0xc149])
    expect(asm('EXG D2,A3')).toEqual([0xc58b])
    expect(asm('EXG A3,D2')).toEqual([0xc58b])
    expect(asm('LINK A6,#-8')).toEqual([0x4e56, 0xfff8])
    expect(asm('UNLK A6')).toEqual([0x4e5e])
    expect(asm('TRAPV')).toEqual([0x4e76])
    expect(asm('RTR')).toEqual([0x4e77])
    expect(asm('ILLEGAL')).toEqual([0x4afc])
  })
  it('encodes Scc', () => {
    expect(asm('SEQ D0')).toEqual([0x57c0])
    expect(asm('SNE (A0)')).toEqual([0x56d0])
    expect(asm('ST D1')).toEqual([0x50c1])
    expect(asm('SF D1')).toEqual([0x51c1])
  })
  it('encodes ADDX/SUBX/ABCD/SBCD/CMPM', () => {
    expect(asm('ADDX.L D1,D0')).toEqual([0xd181])
    expect(asm('ADDX.W -(A1),-(A0)')).toEqual([0xd149])
    expect(asm('SUBX.B D2,D3')).toEqual([0x9702])
    expect(asm('ABCD D1,D0')).toEqual([0xc101])
    expect(asm('SBCD -(A1),-(A0)')).toEqual([0x8109])
    expect(asm('CMPM.B (A1)+,(A0)+')).toEqual([0xb109])
  })
  it('rejects invalid operand combinations', () => {
    expect(bad('AND.W A0,D0')).toBe(true)
    expect(bad('EOR.W (A0),D0')).toBe(true)
    expect(bad('MULU.L D0,D1')).toBe(true)
    expect(bad('EXT.B D0')).toBe(true)
    expect(bad('SEQ A0')).toBe(true)
    expect(bad('ADDX.W D0,-(A0)')).toBe(true)
    expect(bad('CMPM.B D0,D1')).toBe(true)
  })
  it('round trip: a small program using them computes the right values', () => {
    const cpu = run(
      '  MOVEQ #12,D0\n  ANDI.L #10,D0\n  MOVEQ #3,D1\n  MULU D1,D0\n  EXT.L D0\n  SWAP D0\n  SWAP D0\n  NOT.L D0',
      8
    )
    // (12 & 10) = 8; 8*3 = 24; NOT -> ~24
    expect(cpu.registers[Register.D0] >>> 0).toBe(~24 >>> 0)
  })
  it('encodes shifts and rotates (register and memory forms)', () => {
    expect(asm('ASL.L #2,D0')).toEqual([0xe580])
    expect(asm('ASR.W #8,D1')).toEqual([0xe041])
    expect(asm('LSL.B D1,D2')).toEqual([0xe32a])
    expect(asm('LSR.L #1,D0')).toEqual([0xe288])
    expect(asm('ROL.W #3,D3')).toEqual([0xe75b])
    expect(asm('ROR.L D0,D1')).toEqual([0xe0b9])
    expect(asm('ROXL.W #1,D0')).toEqual([0xe350])
    expect(asm('ROXR.B #1,D0')).toEqual([0xe210])
    expect(asm('ASL (A0)')).toEqual([0xe1d0])
    expect(asm('LSR 2(A1)')).toEqual([0xe2e9, 0x0002])
    expect(bad('ASL.L #9,D0')).toBe(true)
    expect(bad('ASL D0')).toBe(true)
  })
  it('encodes bit operations', () => {
    expect(asm('BTST #3,D0')).toEqual([0x0800, 0x0003])
    expect(asm('BTST D1,D0')).toEqual([0x0300])
    expect(asm('BSET #7,(A0)')).toEqual([0x08d0, 0x0007])
    expect(asm('BCLR D2,(A1)')).toEqual([0x0591])
    expect(asm('BCHG #0,D5')).toEqual([0x0845, 0x0000])
    expect(bad('BTST #1,A0')).toBe(true)
  })
  it('round trip: shifts and bit tests behave', () => {
    const cpu = run('  MOVEQ #1,D0\n  ASL.L #4,D0\n  BSET #0,D0\n  MOVEQ #2,D1\n  LSL.L D1,D0\n  BTST #6,D0', 6)
    expect(cpu.registers[Register.D0]).toBe(0x44)
    expect(cpu.status.Z).toBe(false)
  })
})
