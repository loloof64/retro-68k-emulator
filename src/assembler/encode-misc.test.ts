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

describe('CCR / SR operands and MOVEP', () => {
  it('encodes MOVE to CCR and from SR', () => {
    expect(asm('MOVE D0,CCR')).toEqual([0x44c0])
    expect(asm('MOVE #$1F,CCR')).toEqual([0x44fc, 0x001f])
    expect(asm('MOVE SR,D1')).toEqual([0x40c1])
    expect(asm('MOVE SR,(A0)')).toEqual([0x40d0])
  })
  it('rejects the privileged MOVE to SR and byte-sized forms', () => {
    expect(Array.isArray(assemble('  MOVE D0,SR'))).toBe(true)
    expect(Array.isArray(assemble('  MOVE.B D0,CCR'))).toBe(true)
    expect(Array.isArray(assemble('  ANDI #1,SR'))).toBe(true)
  })
  it('encodes ANDI/ORI/EORI to CCR', () => {
    expect(asm('ANDI #$FE,CCR')).toEqual([0x023c, 0x00fe])
    expect(asm('ORI #1,CCR')).toEqual([0x003c, 0x0001])
    expect(asm('EORI.B #$10,CCR')).toEqual([0x0a3c, 0x0010])
  })
  it('encodes MOVEP both ways', () => {
    expect(asm('MOVEP.W D0,4(A1)')).toEqual([0x0189, 0x0004])
    expect(asm('MOVEP.L D2,0(A3)')).toEqual([0x05cb, 0x0000])
    expect(asm('MOVEP.W 2(A0),D1')).toEqual([0x0308, 0x0002])
    expect(asm('MOVEP.L -2(A0),D1')).toEqual([0x0348, 0xfffe])
  })
  it('round trip: MOVE/ANDI on the CCR', () => {
    const cpu = run('  MOVE #$1F,CCR\n  ANDI #$FB,CCR\n  MOVE SR,D0', 3)
    expect(cpu.registers[Register.D0]).toBe(0x1b)
    expect(cpu.status.Z).toBe(false)
    expect(cpu.status.X).toBe(true)
  })
  it('round trip: MOVEP.L spreads a long over alternate bytes', () => {
    const cpu = run('  MOVE.L #$11223344,D0\n  LEA $4000,A0\n  MOVEP.L D0,0(A0)\n  MOVEP.L 0(A0),D1', 4)
    expect(cpu.registers[Register.D1]).toBe(0x11223344)
  })
})

describe('PC-relative and indexed operands', () => {
  it('encodes d(An,Xn) with brief extension words', () => {
    expect(asm('MOVE.W 4(A0,D1.W),D2')).toEqual([0x3430, 0x1004])
    expect(asm('MOVE.L (A1,A2.L),D0')).toEqual([0x2031, 0xa800])
    expect(asm('CLR.B -2(A3,D7)')).toEqual([0x4233, 0x70fe])
    expect(asm('LEA 8(SP,D0.L),A1')).toEqual([0x43f7, 0x0808])
  })
  it('encodes d(PC) and d(PC,Xn) relative to their extension word', () => {
    // opcode at $2000 (USER_RAM_START may differ): label 6 bytes on -> d = 6 - 2 = 4
    expect(asm('LEA t(PC),A0\nt: NOP')).toEqual([0x41fa, 0x0002, 0x4e71])
    expect(asm('MOVE.W t(PC),D0\n NOP\nt: NOP')).toEqual([0x303a, 0x0004, 0x4e71, 0x4e71])
    expect(asm('JMP t(PC,D1.W)\nt: NOP')).toEqual([0x4efb, 0x1002, 0x4e71])
  })
  it('measures the displacement from the extension word after a MOVEM mask', () => {
    expect(asm('MOVEM.L t(PC),D0/D1\nt: NOP')).toEqual([0x4cfa, 0x0003, 0x0002, 0x4e71])
  })
  it('rejects PC-relative destinations and out-of-range index displacements', () => {
    expect(Array.isArray(assemble('t: MOVE D0,t(PC)'))).toBe(true)
    expect(Array.isArray(assemble('  MOVEM.L D0,4(PC)'))).toBe(true)
    expect(Array.isArray(assemble('  MOVE.W 200(A0,D1),D2'))).toBe(true)
  })
  it('round trip: table lookup through d(PC,Xn) and d(An,Xn)', () => {
    const cpu = run(
      '  MOVEQ #2,D1\n  MOVE.B tab(PC,D1.W),D0\n  LEA tab(PC),A0\n  MOVE.B 1(A0,D1.W),D2\n  BRA done\ntab: DC.B 10,20,30,40\n  EVEN\ndone: NOP',
      4,
    )
    expect(cpu.registers[Register.D0] & 0xff).toBe(30)
    expect(cpu.registers[Register.D2] & 0xff).toBe(40)
  })
})
