import { describe, it, expect } from 'vitest'
import { Register } from '../types/cpu'
import {
  SystemMemory,
  INPUT_START,
  INPUT_BUTTON_A,
  INPUT_BUTTON_B,
  INPUT_BUTTON_UP,
  SOUND_FREQUENCY,
  SOUND_DURATION,
  SOUND_VOLUME,
  SOUND_WAVEFORM,
  SOUND_TRIGGER,
  SOUND_WAVEFORM_TRIANGLE,
} from '../memory'
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

function subWord(destReg: number, opmode: number, srcMode: number, srcReg: number) {
  return (0b1001 << 12) | (destReg << 9) | (opmode << 6) | (srcMode << 3) | srcReg
}

function cmpWord(destReg: number, opmode: number, srcMode: number, srcReg: number) {
  return (0b1011 << 12) | (destReg << 9) | (opmode << 6) | (srcMode << 3) | srcReg
}

function moveqWord(destReg: number, data: number) {
  return (0b0111 << 12) | (destReg << 9) | (0 << 8) | (data & 0xff)
}

function bccWord(cc: number, disp8: number) {
  return (0b0110 << 12) | (cc << 8) | (disp8 & 0xff)
}

function btstWord(mode: number, reg: number) {
  return (0b0000100000 << 6) | (mode << 3) | reg
}

function andWord(destReg: number, opmode: number, srcMode: number, srcReg: number) {
  return (0b1100 << 12) | (destReg << 9) | (opmode << 6) | (srcMode << 3) | srcReg
}

function orWord(destReg: number, opmode: number, srcMode: number, srcReg: number) {
  return (0b1000 << 12) | (destReg << 9) | (opmode << 6) | (srcMode << 3) | srcReg
}

// XOR (EOR): opposite direction from AND/OR/ADD/SUB - srcReg is the Dn
// source, destMode/destReg is the <ea> destination.
function xorWord(srcReg: number, opmode: number, destMode: number, destReg: number) {
  return (0b1011 << 12) | (srcReg << 9) | ((0b100 | opmode) << 6) | (destMode << 3) | destReg
}

function notWord(size: 0b00 | 0b01 | 0b10, mode: number, reg: number) {
  return (0b0100011000000000) | (size << 6) | (mode << 3) | reg
}

function clrWord(size: 0b00 | 0b01 | 0b10, mode: number, reg: number) {
  return (0b0100001000000000) | (size << 6) | (mode << 3) | reg
}

function negWord(size: 0b00 | 0b01 | 0b10, mode: number, reg: number) {
  return (0b0100010000000000) | (size << 6) | (mode << 3) | reg
}

function swapWord(reg: number) {
  return 0x4840 | reg
}

function extWord(toLong: boolean, reg: number) {
  return (toLong ? 0x48c0 : 0x4880) | reg
}

function tstWord(size: 0b00 | 0b01 | 0b10, mode: number, reg: number) {
  return (0b0100101000000000) | (size << 6) | (mode << 3) | reg
}

const MOVE_L_IMM_TO_Dn = 0b10 // long
const OPMODE_LONG = 0b010

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

describe('SUB', () => {
  it('SUB.L D1,D0 subtracts D1 from D0', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 300, 'long')
    writeRegister(cpu, Register.D1, 200, 'long')
    memory.write16(0x2000, subWord(0, OPMODE_LONG, 0b000, 1)) // SUB.L D1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(100)
    expect(cpu.status.Z).toBe(false)
    expect(cpu.status.C).toBe(false)
  })

  it('sets the borrow/extend flags when the subtrahend is larger', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0, 'long')
    writeRegister(cpu, Register.D1, 1, 'long')
    memory.write16(0x2000, subWord(0, OPMODE_LONG, 0b000, 1)) // SUB.L D1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0xffffffff)
    expect(cpu.status.C).toBe(true)
    expect(cpu.status.X).toBe(true)
    expect(cpu.status.N).toBe(true)
  })
})

describe('CMP', () => {
  it('sets Z when the operands are equal, without modifying the register', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 42, 'long')
    writeRegister(cpu, Register.D1, 42, 'long')
    memory.write16(0x2000, cmpWord(0, OPMODE_LONG, 0b000, 1)) // CMP.L D1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(42)
    expect(cpu.status.Z).toBe(true)
  })

  it('does not touch the X flag (unlike SUB)', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.X = true
    writeRegister(cpu, Register.D0, 0, 'long')
    writeRegister(cpu, Register.D1, 1, 'long')
    memory.write16(0x2000, cmpWord(0, OPMODE_LONG, 0b000, 1)) // CMP.L D1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.status.C).toBe(true)
    expect(cpu.status.X).toBe(true) // left as it was, not set from carry
  })
})

describe('AND', () => {
  it('ANDs the source into the destination register', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0b1100, 'long')
    writeRegister(cpu, Register.D1, 0b1010, 'long')
    memory.write16(0x2000, andWord(0, OPMODE_LONG, 0b000, 1)) // AND.L D1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0b1000)
  })

  it('clears V and C, and sets Z/N from the result', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.V = true
    cpu.status.C = true
    writeRegister(cpu, Register.D0, 0b0101, 'long')
    writeRegister(cpu, Register.D1, 0b1010, 'long')
    memory.write16(0x2000, andWord(0, OPMODE_LONG, 0b000, 1)) // AND.L D1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0)
    expect(cpu.status.Z).toBe(true)
    expect(cpu.status.V).toBe(false)
    expect(cpu.status.C).toBe(false)
  })
})

describe('OR', () => {
  it('ORs the source into the destination register', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0b1100, 'long')
    writeRegister(cpu, Register.D1, 0b0011, 'long')
    memory.write16(0x2000, orWord(0, OPMODE_LONG, 0b000, 1)) // OR.L D1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0b1111)
  })
})

describe('XOR', () => {
  it('XORs Dn into a data register destination', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0b1100, 'long') // source (Dn)
    writeRegister(cpu, Register.D1, 0b1010, 'long') // destination (<ea>)
    memory.write16(0x2000, xorWord(0, OPMODE_LONG, 0b000, 1)) // XOR.L D0,D1

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D1]).toBe(0b0110)
    expect(cpu.registers[Register.D0]).toBe(0b1100) // source untouched
  })

  it('XORs Dn into a memory destination', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0xffffffff, 'long')
    writeRegister(cpu, Register.A0, 0x2000 + 4, 'long')
    memory.write32(0x2000 + 4, 0x0000ffff)
    memory.write16(0x2000, xorWord(0, OPMODE_LONG, 0b010, 0)) // XOR.L D0,(A0)

    step(cpu, memory, opcodeTable)

    expect(memory.read32(0x2000 + 4)).toBe(0xffff0000)
  })
})

describe('NOT', () => {
  it('inverts a data register in place', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x0000ffff, 'long')
    memory.write16(0x2000, notWord(0b10, 0b000, 0)) // NOT.L D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0xffff0000)
  })

  it('clears V and C, sets Z when the result is zero', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.V = true
    cpu.status.C = true
    writeRegister(cpu, Register.D0, 0xffffffff, 'long')
    memory.write16(0x2000, notWord(0b10, 0b000, 0)) // NOT.L D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0)
    expect(cpu.status.Z).toBe(true)
    expect(cpu.status.V).toBe(false)
    expect(cpu.status.C).toBe(false)
  })

  it('inverts a byte in memory', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x2000 + 4, 'long')
    memory.write8(0x2000 + 4, 0x0f)
    memory.write16(0x2000, notWord(0b00, 0b010, 0)) // NOT.B (A0)

    step(cpu, memory, opcodeTable)

    expect(memory.read8(0x2000 + 4)).toBe(0xf0)
  })
})

describe('CLR', () => {
  it('zeroes a data register regardless of its previous value', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0xdeadbeef, 'long')
    cpu.status.V = true
    cpu.status.C = true
    memory.write16(0x2000, clrWord(0b10, 0b000, 0)) // CLR.L D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0)
    expect(cpu.status.Z).toBe(true)
    expect(cpu.status.N).toBe(false)
    expect(cpu.status.V).toBe(false)
    expect(cpu.status.C).toBe(false)
  })

  it('zeroes a byte in memory', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x2000 + 4, 'long')
    memory.write8(0x2000 + 4, 0xff)
    memory.write16(0x2000, clrWord(0b00, 0b010, 0)) // CLR.B (A0)

    step(cpu, memory, opcodeTable)

    expect(memory.read8(0x2000 + 4)).toBe(0)
  })
})

describe('SWAP', () => {
  it('swaps the high and low 16-bit halves', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x1234abcd, 'long')
    memory.write16(0x2000, swapWord(0)) // SWAP D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0xabcd1234)
  })

  it('sets Z when the swapped result is zero', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0, 'long')
    memory.write16(0x2000, swapWord(0)) // SWAP D0

    step(cpu, memory, opcodeTable)

    expect(cpu.status.Z).toBe(true)
  })
})

describe('EXT', () => {
  it('EXT.W sign-extends a negative byte into the low word, high word untouched', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x12340080, 'long') // byte = 0x80 (-128)
    memory.write16(0x2000, extWord(false, 0)) // EXT.W D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x1234ff80) // high word (0x1234) preserved
    expect(cpu.status.N).toBe(true)
  })

  it('EXT.L sign-extends a negative word to the full long', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x0000ff80, 'long')
    memory.write16(0x2000, extWord(true, 0)) // EXT.L D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0xffffff80)
    expect(cpu.status.N).toBe(true)
  })

  it('EXT.W of a positive byte clears N and sets Z when zero', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x00000000, 'long')
    memory.write16(0x2000, extWord(false, 0)) // EXT.W D0

    step(cpu, memory, opcodeTable)

    expect(cpu.status.Z).toBe(true)
    expect(cpu.status.N).toBe(false)
  })
})

describe('NEG', () => {
  it('negates a positive register value', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 5, 'long')
    memory.write16(0x2000, negWord(0b10, 0b000, 0)) // NEG.L D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0xfffffffb) // -5
    expect(cpu.status.N).toBe(true)
    expect(cpu.status.C).toBe(true) // real 68000: NEG of a nonzero value sets C
  })

  it('negating zero yields zero and clears C/V/N, sets Z', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0, 'long')
    memory.write16(0x2000, negWord(0b10, 0b000, 0)) // NEG.L D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0)
    expect(cpu.status.Z).toBe(true)
    expect(cpu.status.N).toBe(false)
    expect(cpu.status.C).toBe(false)
  })

  it('negates a byte in memory', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x2000 + 4, 'long')
    memory.write8(0x2000 + 4, 1)
    memory.write16(0x2000, negWord(0b00, 0b010, 0)) // NEG.B (A0)

    step(cpu, memory, opcodeTable)

    expect(memory.read8(0x2000 + 4)).toBe(0xff) // -1
  })
})

describe('TST', () => {
  it('sets flags from the operand without modifying it', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x80000000, 'long')
    memory.write16(0x2000, tstWord(0b10, 0b000, 0)) // TST.L D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x80000000) // unchanged
    expect(cpu.status.N).toBe(true)
    expect(cpu.status.Z).toBe(false)
  })

  it('sets Z for a zero operand and clears V/C', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.V = true
    cpu.status.C = true
    writeRegister(cpu, Register.D0, 0, 'long')
    memory.write16(0x2000, tstWord(0b10, 0b000, 0)) // TST.L D0

    step(cpu, memory, opcodeTable)

    expect(cpu.status.Z).toBe(true)
    expect(cpu.status.V).toBe(false)
    expect(cpu.status.C).toBe(false)
  })
})

describe('MOVEQ', () => {
  it('loads a small positive value', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, moveqWord(0, 42)) // MOVEQ #42,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(42)
    expect(cpu.status.N).toBe(false)
  })

  it('sign-extends a negative 8-bit value to 32 bits', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, moveqWord(1, 0xff)) // MOVEQ #-1,D1

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D1]).toBe(0xffffffff)
    expect(cpu.status.N).toBe(true)
  })
})

describe('Bcc', () => {
  it('BRA always branches, using an 8-bit displacement', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, bccWord(0b0000, 4)) // BRA +4

    step(cpu, memory, opcodeTable)

    // base is cpu.pc right after the opcode word (0x2002) + displacement
    expect(cpu.pc).toBe(0x2006)
  })

  it('BEQ branches only when Z is set', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, bccWord(0b0111, 10)) // BEQ +10
    cpu.status.Z = false

    step(cpu, memory, opcodeTable)
    expect(cpu.pc).toBe(0x2002) // not taken

    cpu.pc = 0x2000
    cpu.status.Z = true
    step(cpu, memory, opcodeTable)
    expect(cpu.pc).toBe(0x200c) // taken
  })

  it('supports a 16-bit displacement when the byte field is 0', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, bccWord(0b0000, 0)) // BRA, word form
    memory.write16(0x2002, 0xfff0) // -16

    step(cpu, memory, opcodeTable)

    // base is 0x2002 (right after the opcode word, before the extension word)
    expect(cpu.pc).toBe(0x2002 - 16)
  })

  it('a negative 8-bit displacement branches backward', () => {
    const cpu = createCPU(0x2010)
    const memory = new SystemMemory()
    memory.write16(0x2010, bccWord(0b0000, 0xfc)) // BRA -4

    step(cpu, memory, opcodeTable)

    // base is 0x2012 (right after the opcode word) - 4 = 0x200e
    expect(cpu.pc).toBe(0x200e)
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

  it('TRAP #5 loads the controller state into D0', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.setButtonState(INPUT_BUTTON_A | INPUT_BUTTON_UP)
    memory.write16(0x2000, 0x4e45) // TRAP #5

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(INPUT_BUTTON_A | INPUT_BUTTON_UP)
  })

  it('TRAP #6 writes D0-D3 into the sound registers and sets the trigger', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 440, 'word') // frequency
    writeRegister(cpu, Register.D1, 250, 'word') // duration
    writeRegister(cpu, Register.D2, 200, 'byte') // volume
    writeRegister(cpu, Register.D3, SOUND_WAVEFORM_TRIANGLE, 'byte') // waveform
    memory.write16(0x2000, 0x4e46) // TRAP #6

    step(cpu, memory, opcodeTable)

    expect(memory.read16(SOUND_FREQUENCY)).toBe(440)
    expect(memory.read16(SOUND_DURATION)).toBe(250)
    expect(memory.read8(SOUND_VOLUME)).toBe(200)
    expect(memory.read8(SOUND_WAVEFORM)).toBe(SOUND_WAVEFORM_TRIANGLE)
    expect(memory.read8(SOUND_TRIGGER)).toBe(1)
  })
})

describe('BTST', () => {
  it('clears Z when the tested register bit is set', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0b0100, 'long')
    memory.write16(0x2000, btstWord(0b000, 0)) // BTST #n,D0
    memory.write16(0x2002, 2) // bit number 2

    step(cpu, memory, opcodeTable)

    expect(cpu.status.Z).toBe(false)
  })

  it('sets Z when the tested register bit is clear', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0b0100, 'long')
    memory.write16(0x2000, btstWord(0b000, 0)) // BTST #n,D0
    memory.write16(0x2002, 0) // bit number 0

    step(cpu, memory, opcodeTable)

    expect(cpu.status.Z).toBe(true)
  })

  it('tests a bit of a memory operand as a byte', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x2000 + 4, 'long')
    memory.write8(0x2000 + 4, 0b00000001)
    memory.write16(0x2000, btstWord(0b010, 0)) // BTST #n,(A0)
    memory.write16(0x2002, 0) // bit number 0

    step(cpu, memory, opcodeTable)

    expect(cpu.status.Z).toBe(false)
  })

  it('rejects an address register as the target', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, btstWord(0b001, 0)) // BTST #n,A0
    memory.write16(0x2002, 0)

    expect(() => step(cpu, memory, opcodeTable)).toThrow(/address register/)
  })

  it('a typical button-polling sequence: read input, then BTST each bit', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.setButtonState(INPUT_BUTTON_B)

    let addr = 0x2000
    const emit = (word: number) => {
      memory.write16(addr, word)
      addr += 2
    }
    const emitLong = (value: number) => {
      memory.write32(addr, value)
      addr += 4
    }

    emit(moveWord(MOVE_L_IMM_TO_Dn, 0b001, 0, 0b111, 0b100)) // MOVEA.L #INPUT_START,A0
    emitLong(INPUT_START)
    emit(moveWord(MOVE_L_IMM_TO_Dn, 0b000, 0, 0b010, 0)) // MOVE.L (A0),D0
    emit(btstWord(0b000, 0)) // BTST #1,D0 (button B)
    emit(1)

    step(cpu, memory, opcodeTable) // MOVEA
    step(cpu, memory, opcodeTable) // MOVE
    step(cpu, memory, opcodeTable) // BTST

    expect(cpu.status.Z).toBe(false) // button B is pressed
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
