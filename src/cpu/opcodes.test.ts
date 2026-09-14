import { describe, it, expect } from 'vitest'
import { Register } from '../types/cpu'
import { SystemMemory } from '../memory'
import { createCPU, step, writeRegister } from './index'
import { opcodeTable } from './opcodes'

// Small hand-assembler helpers — there's no real assembler yet, so tests
// poke raw 68000 machine code directly, the same way the CPU will read it.
function moveWord(size: 0b01 | 0b10 | 0b11, destMode: number, destReg: number, srcMode: number, srcReg: number) {
  return (0b00 << 14) | (size << 12) | (destReg << 9) | (destMode << 6) | (srcMode << 3) | srcReg
}

function addWord(destReg: number, opmode: number, srcMode: number, srcReg: number) {
  return (0b1101 << 12) | (destReg << 9) | (opmode << 6) | (srcMode << 3) | srcReg
}

const MOVE_L_IMM_TO_Dn = 0b10 // long

describe('MOVE', () => {
  it('MOVE.L #imm,D0 loads an immediate into a data register', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b000, 0, 0b111, 0b100)) // dest Dn=D0, src #imm
    memory.write32(0x2002, 0x00000064) // 100

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(100)
    expect(cpu.pc).toBe(0x2006)
  })

  it('MOVE.L #imm,A0 loads an immediate into an address register', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b001, 0, 0b111, 0b100)) // dest An=A0
    memory.write32(0x2002, 0x00040000)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.A0]).toBe(0x40000)
  })

  it('MOVE.L #imm,(A0) writes through an address register indirect', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x40000, 'long')
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b010, 0, 0b111, 0b100)) // dest (A0)
    memory.write32(0x2002, 0xffffffff)

    step(cpu, memory, opcodeTable)

    expect(memory.read32(0x40000)).toBe(0xffffffff)
  })

  it('MOVE.W Dn,Dn sets Z/N and clears V/C', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D1, 0x8000, 'word')
    cpu.status.V = true
    cpu.status.C = true
    memory.write16(0x2000, moveWord(0b11, 0b000, 0, 0b000, 1)) // MOVE.W D1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xffff).toBe(0x8000)
    expect(cpu.status.N).toBe(true)
    expect(cpu.status.Z).toBe(false)
    expect(cpu.status.V).toBe(false)
    expect(cpu.status.C).toBe(false)
  })

  it('MOVE.B preserves the untouched upper bytes of the destination register', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x12345678, 'long')
    writeRegister(cpu, Register.D1, 0xab, 'byte')
    memory.write16(0x2000, moveWord(0b01, 0b000, 0, 0b000, 1)) // MOVE.B D1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x123456ab)
  })

  it('(A0)+ post-increments A0 by the operand size', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x2100, 'long')
    memory.write32(0x2100, 0x11223344)
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b000, 0, 0b011, 0)) // MOVE.L (A0)+,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x11223344)
    expect(cpu.registers[Register.A0]).toBe(0x2104)
  })

  it('-(A0) pre-decrements A0 by the operand size before writing', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x2104, 'long')
    writeRegister(cpu, Register.D0, 0xdeadbeef, 'long')
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b100, 0, 0b000, 0)) // MOVE.L D0,-(A0)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.A0]).toBe(0x2100)
    expect(memory.read32(0x2100)).toBe(0xdeadbeef)
  })
})

describe('ADD', () => {
  it('ADD.L D1,D0 adds two data registers', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 100, 'long')
    writeRegister(cpu, Register.D1, 200, 'long')
    memory.write16(0x2000, addWord(0, 0b010, 0b000, 1)) // ADD.L D1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(300)
    expect(cpu.status.Z).toBe(false)
    expect(cpu.status.N).toBe(false)
  })

  it('sets the carry/extend flags on unsigned overflow', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0xffffffff, 'long')
    writeRegister(cpu, Register.D1, 1, 'long')
    memory.write16(0x2000, addWord(0, 0b010, 0b000, 1))

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0)
    expect(cpu.status.Z).toBe(true)
    expect(cpu.status.C).toBe(true)
    expect(cpu.status.X).toBe(true)
  })

  it('sets the overflow flag on signed overflow', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x7fffffff, 'long') // max positive
    writeRegister(cpu, Register.D1, 1, 'long')
    memory.write16(0x2000, addWord(0, 0b010, 0b000, 1))

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x80000000)
    expect(cpu.status.V).toBe(true)
    expect(cpu.status.N).toBe(true)
  })

  it('ADD.L (A0),D0 adds a value read from memory', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x2100, 'long')
    memory.write32(0x2100, 50)
    writeRegister(cpu, Register.D0, 5, 'long')
    memory.write16(0x2000, addWord(0, 0b010, 0b010, 0)) // ADD.L (A0),D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(55)
  })
})

describe('TRAP', () => {
  it('TRAP #0 halts the CPU', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, 0x4e40) // TRAP #0

    step(cpu, memory, opcodeTable)

    expect(cpu.halted).toBe(true)
  })

  it('throws on an unimplemented TRAP vector', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, 0x4e41) // TRAP #1

    expect(() => step(cpu, memory, opcodeTable)).toThrow(/Unimplemented TRAP vector: 1/)
  })
})

describe('sample program end to end', () => {
  it('runs the App.tsx demo program: two moves, an add, a pixel write, then halt', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()

    let addr = 0x2000
    const emit = (word: number) => {
      memory.write16(addr, word)
      addr += 2
    }
    const emitLong = (value: number) => {
      memory.write32(addr, value)
      addr += 4
    }

    emit(moveWord(MOVE_L_IMM_TO_Dn, 0b000, 0, 0b111, 0b100)) // MOVE.L #100,D0
    emitLong(100)
    emit(moveWord(MOVE_L_IMM_TO_Dn, 0b000, 1, 0b111, 0b100)) // MOVE.L #200,D1
    emitLong(200)
    emit(addWord(0, 0b010, 0b000, 1)) // ADD.L D1,D0
    emit(moveWord(MOVE_L_IMM_TO_Dn, 0b001, 0, 0b111, 0b100)) // MOVE.L #$40000,A0
    emitLong(0x40000)
    emit(moveWord(MOVE_L_IMM_TO_Dn, 0b010, 0, 0b111, 0b100)) // MOVE.L #$FFFFFF,(A0)
    emitLong(0xffffff)
    emit(0x4e40) // TRAP #0

    while (!cpu.halted) {
      step(cpu, memory, opcodeTable)
    }

    expect(cpu.registers[Register.D0]).toBe(300)
    expect(memory.read32(0x40000)).toBe(0xffffff)
    expect(cpu.halted).toBe(true)
  })
})
