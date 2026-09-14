import { describe, it, expect } from 'vitest'
import { Register } from '../types/cpu'
import { SystemMemory, USER_RAM_START } from '../memory'
import { createCPU, reset, readRegister, writeRegister, updateFlags, step, DEFAULT_STACK_POINTER } from './index'
import { opcodeTable } from './opcodes'

describe('createCPU', () => {
  it('starts with zeroed data/address registers except A7', () => {
    const cpu = createCPU()
    expect(cpu.registers[Register.D0]).toBe(0)
    expect(cpu.registers[Register.A0]).toBe(0)
    expect(cpu.registers[Register.A7]).toBe(DEFAULT_STACK_POINTER)
    expect(cpu.sp).toBe(DEFAULT_STACK_POINTER)
  })

  it('starts PC at the given address, defaulting to user RAM start', () => {
    expect(createCPU().pc).toBe(USER_RAM_START)
    expect(createCPU(0x2100).pc).toBe(0x2100)
  })

  it('starts with all flags clear, not halted, zero cycles', () => {
    const cpu = createCPU()
    expect(cpu.status).toEqual({ C: false, V: false, Z: false, N: false, X: false })
    expect(cpu.halted).toBe(false)
    expect(cpu.cycles).toBe(0)
  })
})

describe('reset', () => {
  it('restores a dirtied CPU back to its initial state', () => {
    const cpu = createCPU()
    writeRegister(cpu, Register.D0, 0xdeadbeef)
    cpu.pc = 0x5000
    cpu.status.Z = true
    cpu.halted = true
    cpu.cycles = 999

    reset(cpu)

    expect(cpu.registers[Register.D0]).toBe(0)
    expect(cpu.pc).toBe(USER_RAM_START)
    expect(cpu.status.Z).toBe(false)
    expect(cpu.halted).toBe(false)
    expect(cpu.cycles).toBe(0)
    expect(cpu.registers[Register.A7]).toBe(DEFAULT_STACK_POINTER)
  })
})

describe('readRegister / writeRegister', () => {
  it('writes/reads a full long on a data register', () => {
    const cpu = createCPU()
    writeRegister(cpu, Register.D0, 0x12345678, 'long')
    expect(readRegister(cpu, Register.D0, 'long')).toBe(0x12345678)
  })

  it('a byte/word write to a data register preserves the upper bits', () => {
    const cpu = createCPU()
    writeRegister(cpu, Register.D0, 0x12345678, 'long')
    writeRegister(cpu, Register.D0, 0xab, 'byte')
    expect(cpu.registers[Register.D0]).toBe(0x123456ab)

    writeRegister(cpu, Register.D0, 0xcdef, 'word')
    expect(cpu.registers[Register.D0]).toBe(0x1234cdef)
  })

  it('a word/byte write to an address register sign-extends to 32 bits', () => {
    const cpu = createCPU()
    writeRegister(cpu, Register.A0, 0xffff, 'word') // -1 as a word
    expect(cpu.registers[Register.A0]).toBe(0xffffffff)

    writeRegister(cpu, Register.A1, 0x0001, 'word')
    expect(cpu.registers[Register.A1]).toBe(0x00000001)

    writeRegister(cpu, Register.A2, 0x80, 'byte') // -128 as a byte
    expect(cpu.registers[Register.A2]).toBe(0xffffff80)
  })

  it('writing A7 keeps cpu.sp in sync', () => {
    const cpu = createCPU()
    writeRegister(cpu, Register.A7, 0x2000, 'long')
    expect(cpu.sp).toBe(0x2000)
  })

  it('reading with a smaller size masks the stored value', () => {
    const cpu = createCPU()
    writeRegister(cpu, Register.D3, 0x12345678, 'long')
    expect(readRegister(cpu, Register.D3, 'byte')).toBe(0x78)
    expect(readRegister(cpu, Register.D3, 'word')).toBe(0x5678)
  })
})

describe('updateFlags', () => {
  it('sets Z for a zero result and clears it otherwise', () => {
    const cpu = createCPU()
    updateFlags(cpu, 0, 'long')
    expect(cpu.status.Z).toBe(true)
    updateFlags(cpu, 1, 'long')
    expect(cpu.status.Z).toBe(false)
  })

  it('sets N from the sign bit for the given size', () => {
    const cpu = createCPU()
    updateFlags(cpu, 0x80, 'byte')
    expect(cpu.status.N).toBe(true)
    updateFlags(cpu, 0x7f, 'byte')
    expect(cpu.status.N).toBe(false)

    updateFlags(cpu, 0x8000, 'word')
    expect(cpu.status.N).toBe(true)

    updateFlags(cpu, 0x80000000, 'long')
    expect(cpu.status.N).toBe(true)
  })

  it('ignores bits outside the given size', () => {
    const cpu = createCPU()
    updateFlags(cpu, 0x100, 'byte') // low byte is 0
    expect(cpu.status.Z).toBe(true)
  })
})

describe('step', () => {
  it('executes NOP: advances PC by one word and spends 4 cycles', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, 0x4e71) // NOP

    const cycles = step(cpu, memory, opcodeTable)

    expect(cycles).toBe(4)
    expect(cpu.cycles).toBe(4)
    expect(cpu.pc).toBe(0x2002)
  })

  it('throws a descriptive error on an unknown opcode', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, 0xffff)

    expect(() => step(cpu, memory, opcodeTable)).toThrow(/Unknown instruction: \$ffff/)
  })

  it('does nothing once halted', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, 0x4e71)
    cpu.halted = true

    const cycles = step(cpu, memory, opcodeTable)

    expect(cycles).toBe(0)
    expect(cpu.pc).toBe(0x2000)
    expect(cpu.cycles).toBe(0)
  })
})
