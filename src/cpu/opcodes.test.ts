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
  ZERO_DIVIDE_VECTOR,
  ILLEGAL_INSTRUCTION_VECTOR,
  CHK_VECTOR,
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

// data: 1-8 (8 encodes as 0b000). size: 0b00=byte, 0b01=word, 0b10=long.
function addqSubqWord(sub: boolean, data: number, size: number, mode: number, reg: number) {
  const dataBits = data === 8 ? 0 : data
  return (0b0101 << 12) | (dataBits << 9) | ((sub ? 1 : 0) << 8) | (size << 6) | (mode << 3) | reg
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

function dbraWord(reg: number) {
  return 0x51c8 | reg
}

function dbccWord(cc: number, reg: number) {
  return 0x50c8 | (cc << 8) | reg
}

function sccWord(cc: number, mode: number, reg: number) {
  return 0x50c0 | (cc << 8) | (mode << 3) | reg
}

function chkWord(destReg: number, mode: number, reg: number) {
  return 0x4180 | (destReg << 9) | (mode << 3) | reg
}

function jsrWord(mode: number, reg: number) {
  return 0x4e80 | (mode << 3) | reg
}

function leaWord(destReg: number, mode: number, reg: number) {
  return 0x41c0 | (destReg << 9) | (mode << 3) | reg
}

function peaWord(mode: number, reg: number) {
  return 0x4840 | (mode << 3) | reg
}

function bsrWord(disp8: number) {
  return 0x6100 | (disp8 & 0xff)
}

const RTS_WORD = 0x4e75

function linkWord(reg: number) {
  return 0x4e50 | reg
}

function unlkWord(reg: number) {
  return 0x4e58 | reg
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

// MUL (top nibble 0b1100) / DIV (top nibble 0b1000): bits 7-6 = 11 (fixed,
// the reserved opmode ADD/SUB/AND/OR/XOR/CMP never use), bit 8 picks
// unsigned (0: MULU/DIVU) vs signed (1: MULS/DIVS).
function mulDivWord(topNibble: 0b1100 | 0b1000, destReg: number, signed: boolean, srcMode: number, srcReg: number) {
  return (topNibble << 12) | (destReg << 9) | ((signed ? 1 : 0) << 8) | (0b11 << 6) | (srcMode << 3) | srcReg
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

// dr: 0=register-to-memory 1=memory-to-register. size: 0=word 1=long.
function movemWord(dr: 0 | 1, size: 0 | 1, mode: number, reg: number) {
  return 0x4880 | (dr << 10) | (size << 6) | (mode << 3) | reg
}

function tstWord(size: 0b00 | 0b01 | 0b10, mode: number, reg: number) {
  return (0b0100101000000000) | (size << 6) | (mode << 3) | reg
}

// dr: 1=left 0=right. tt: 0b00=ASx 0b01=LSx 0b11=ROx. isRegisterCount:
// false -> countOrReg is the immediate count (1-7, 0 means 8); true ->
// countOrReg is the Dn holding the dynamic count.
// tt: 0b00=ASx 0b01=LSx 0b10=ROXx 0b11=ROx
function shiftWord(
  dr: 0 | 1,
  tt: 0b00 | 0b01 | 0b10 | 0b11,
  isRegisterCount: boolean,
  countOrReg: number,
  size: 0b00 | 0b01 | 0b10,
  reg: number
) {
  return (0b1110 << 12) | (countOrReg << 9) | (dr << 8) | (size << 6) | ((isRegisterCount ? 1 : 0) << 5) | (tt << 3) | reg
}

// Memory-operand shift/rotate ($E0C0-$E7FE): reuses the register form's
// otherwise-reserved size=11 to mean "memory operand, word, one bit" —
// see decodeMemAlterableEA in opcodes.ts.
function memShiftWord(dr: 0 | 1, tt: 0b00 | 0b01 | 0b10 | 0b11, mode: number, reg: number) {
  return 0xe0c0 | (tt << 9) | (dr << 8) | (mode << 3) | reg
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

  it('MOVEA (An destination) never touches the flags, unlike a plain MOVE', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.N = true
    cpu.status.Z = true
    cpu.status.V = true
    cpu.status.C = true
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b001, 0, 0b111, 0b100)) // MOVE.L #0,A0
    memory.write32(0x2002, 0x00000000) // a value that would set Z if this were a plain MOVE

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.A0]).toBe(0)
    expect(cpu.status.N).toBe(true)
    expect(cpu.status.Z).toBe(true)
    expect(cpu.status.V).toBe(true)
    expect(cpu.status.C).toBe(true)
  })

  it('MOVE.B to an address register raises Illegal Instruction (reserved encoding)', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write32(ILLEGAL_INSTRUCTION_VECTOR, 0x3000)
    memory.write16(0x2000, moveWord(0b01, 0b001, 0, 0b000, 0)) // MOVE.B D0,A0
    memory.write16(0x3000, RTS_WORD)

    step(cpu, memory, opcodeTable) // raises -> pc = 0x3000
    step(cpu, memory, opcodeTable) // RTS -> back to right after the MOVE.B

    expect(cpu.pc).toBe(0x2002)
  })

  it('MOVE.B to an address register throws when no Illegal Instruction handler is installed', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, moveWord(0b01, 0b001, 0, 0b000, 0)) // MOVE.B D0,A0

    expect(() => step(cpu, memory, opcodeTable)).toThrow(/no handler installed/)
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

  it('(xxx).W reads via a sign-extended 16-bit absolute address', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write32(0x100, 0x11223344)
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b000, 0, 0b111, 0b000)) // MOVE.L $100.W,D0
    memory.write16(0x2002, 0x0100)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x11223344)
    expect(cpu.pc).toBe(0x2004)
  })

  it('(xxx).W writes to an absolute short address', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0xdeadbeef, 'long')
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b111, 0b000, 0b000, 0)) // MOVE.L D0,$100.W
    memory.write16(0x2002, 0x0100)

    step(cpu, memory, opcodeTable)

    expect(memory.read32(0x100)).toBe(0xdeadbeef)
  })

  it('(xxx).L reads via a full 32-bit absolute address', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write32(0x40000, 0xffffffff) // e.g. a framebuffer pixel
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b000, 0, 0b111, 0b001)) // MOVE.L $40000.L,D0
    memory.write32(0x2002, 0x00040000)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0xffffffff)
    expect(cpu.pc).toBe(0x2006)
  })

  it('(xxx).L writes to a full 32-bit absolute address', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x00ff00ff, 'long')
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b111, 0b001, 0b000, 0)) // MOVE.L D0,$40000.L
    memory.write32(0x2002, 0x00040000)

    step(cpu, memory, opcodeTable)

    expect(memory.read32(0x40000)).toBe(0x00ff00ff)
  })

  it('d16(An) reads via address register indirect with a 16-bit displacement', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x1000, 'long')
    memory.write32(0x1010, 0x11223344)
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b000, 0, 0b101, 0)) // MOVE.L $10(A0),D0
    memory.write16(0x2002, 0x0010)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x11223344)
    expect(cpu.pc).toBe(0x2004)
  })

  it('d16(An) writes via address register indirect with a negative 16-bit displacement', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0xdeadbeef, 'long')
    writeRegister(cpu, Register.A0, 0x1010, 'long')
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b101, 0, 0b000, 0)) // MOVE.L D0,-4(A0)
    memory.write16(0x2002, 0xfffc) // -4

    step(cpu, memory, opcodeTable)

    expect(memory.read32(0x100c)).toBe(0xdeadbeef)
  })

  it('d8(An,Dn.W) reads via address register indirect with a word index', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x1000, 'long')
    writeRegister(cpu, Register.D1, 0x0010, 'long')
    memory.write32(0x1020, 0x11223344) // 0x1000 (A0) + 0x10 (D1) + 0x10 (d8)
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b000, 0, 0b110, 0)) // MOVE.L $10(A0,D1.W),D0
    memory.write16(0x2002, 0x1010) // Xn=D1, word index, d8=$10

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x11223344)
    expect(cpu.pc).toBe(0x2004)
  })

  it('d8(An,An.L) writes via address register indirect with a long index and a negative displacement', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0xcafebabe, 'long')
    writeRegister(cpu, Register.A0, 0x1000, 'long')
    writeRegister(cpu, Register.A1, 0x0020, 'long')
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b110, 0, 0b000, 0)) // MOVE.L D0,-8(A0,A1.L)
    memory.write16(0x2002, 0x9800 | (0xf8 & 0xff)) // Xn=A1, long index, d8=-8

    step(cpu, memory, opcodeTable)

    // 0x1000 (A0) + 0x20 (A1) - 8 (d8) = 0x1018
    expect(memory.read32(0x1018)).toBe(0xcafebabe)
  })

  it('d16(PC) reads via PC-relative addressing with a 16-bit displacement', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write32(0x2010, 0x11223344)
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b000, 0, 0b111, 0b010)) // MOVE.L $10(PC),D0
    memory.write16(0x2002, 0x000e) // extension word is at 0x2002; +0xe = 0x2010

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x11223344)
    expect(cpu.pc).toBe(0x2004)
  })

  it('d16(PC) cannot be used as a write destination', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b111, 0b010, 0b000, 0)) // MOVE.L D0,$10(PC)
    memory.write16(0x2002, 0x0010)

    expect(() => step(cpu, memory, opcodeTable)).toThrow('Cannot write to a PC-relative operand')
  })

  it('d8(PC,Xn) reads via PC-relative indexed addressing', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D1, 0x0004, 'long')
    memory.write32(0x2010, 0x55667788) // extension word at 0x2002 + 0x04 (D1) + 0x0a (d8) = 0x2010
    memory.write16(0x2000, moveWord(MOVE_L_IMM_TO_Dn, 0b000, 0, 0b111, 0b011)) // MOVE.L $a(PC,D1.W),D0
    memory.write16(0x2002, 0x100a) // Xn=D1, word index, d8=$0a

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x55667788)
    expect(cpu.pc).toBe(0x2004)
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

describe('ADDQ/SUBQ', () => {
  it('ADDQ adds a small immediate directly into Dn, data=0 encoding meaning 8', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 10, 'long')
    memory.write16(0x2000, addqSubqWord(false, 8, 0b10, 0b000, 0)) // ADDQ.L #8,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(18)
  })

  it('SUBQ subtracts a small immediate directly from Dn and updates flags', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 3, 'word')
    memory.write16(0x2000, addqSubqWord(true, 3, 0b01, 0b000, 0)) // SUBQ.W #3,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xffff).toBe(0)
    expect(cpu.status.Z).toBe(true)
  })

  it('operates on the full 32-bit An without touching flags, regardless of the size field', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x1000, 'long')
    cpu.status.Z = true // should survive untouched
    memory.write16(0x2000, addqSubqWord(false, 4, 0b00, 0b001, 0)) // ADDQ.B #4,A0 (size ignored for An)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.A0]).toBe(0x1004)
    expect(cpu.status.Z).toBe(true) // untouched
  })

  it('writes to a memory destination via decodeEA', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write32(0x3000, 10)
    memory.write16(0x2000, addqSubqWord(false, 5, 0b10, 0b010, 0)) // ADDQ.L #5,(A0)

    step(cpu, memory, opcodeTable)

    expect(memory.read32(0x3000)).toBe(15)
  })

  it('ss=11 in this bit range still dispatches to Scc, not ADDQ, since the two share an encoding space', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.Z = true
    writeRegister(cpu, Register.D0, 0x12345678, 'long')
    memory.write16(0x2000, sccWord(0b0111, 0b000, 0)) // SEQ D0 - same bits as ADDQ with ss=11

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x123456ff) // Scc's effect, not ADDQ's
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

describe('MULU', () => {
  it('multiplies two unsigned 16-bit values into a 32-bit result', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 1000, 'word')
    memory.write16(0x2000, mulDivWord(0b1100, 0, false, 0b111, 0b100)) // MULU #imm,D0
    memory.write16(0x2002, 2000)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(2000000)
    expect(cpu.status.N).toBe(false)
    expect(cpu.status.Z).toBe(false)
    expect(cpu.status.V).toBe(false)
    expect(cpu.status.C).toBe(false)
  })
})

describe('MULS', () => {
  it('multiplies two signed 16-bit values, sign-extending the result', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, -5, 'word')
    memory.write16(0x2000, mulDivWord(0b1100, 0, true, 0b111, 0b100)) // MULS #imm,D0
    memory.write16(0x2002, 3)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0xffffffff - 15 + 1) // -15 as unsigned 32-bit
    expect(cpu.status.N).toBe(true)
  })
})

describe('DIVU', () => {
  it('divides, storing quotient in the low word and remainder in the high word', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 100, 'long')
    memory.write16(0x2000, mulDivWord(0b1000, 0, false, 0b111, 0b100)) // DIVU #imm,D0
    memory.write16(0x2002, 3)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xffff).toBe(33) // quotient
    expect((cpu.registers[Register.D0] >>> 16) & 0xffff).toBe(1) // remainder
    expect(cpu.status.V).toBe(false)
  })

  it('sets V and leaves the destination unchanged when the quotient overflows a word', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x00020000, 'long') // quotient would be 131072 (> 0xffff)
    memory.write16(0x2000, mulDivWord(0b1000, 0, false, 0b111, 0b100))
    memory.write16(0x2002, 1)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x00020000) // untouched
    expect(cpu.status.V).toBe(true)
  })

  it('raises the Zero Divide exception, jumping to the installed handler', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write32(ZERO_DIVIDE_VECTOR, 0x3000) // handler address
    writeRegister(cpu, Register.D0, 100, 'long')
    memory.write16(0x2000, mulDivWord(0b1000, 0, false, 0b111, 0b100)) // DIVU #0,D0
    memory.write16(0x2002, 0)
    memory.write16(0x3000, RTS_WORD)
    const spBefore = cpu.registers[Register.A7]

    step(cpu, memory, opcodeTable) // DIVU -> raises, pc = 0x3000
    step(cpu, memory, opcodeTable) // RTS -> pops back to right after DIVU

    expect(cpu.pc).toBe(0x2004)
    expect(cpu.registers[Register.A7]).toBe(spBefore)
  })

  it('throws when dividing by zero with no handler installed', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 100, 'long')
    memory.write16(0x2000, mulDivWord(0b1000, 0, false, 0b111, 0b100))
    memory.write16(0x2002, 0)

    expect(() => step(cpu, memory, opcodeTable)).toThrow(/no handler installed/)
  })
})

describe('DIVS', () => {
  it('truncates toward zero, remainder following the dividend sign', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, -100, 'long')
    memory.write16(0x2000, mulDivWord(0b1000, 0, true, 0b111, 0b100)) // DIVS #imm,D0
    memory.write16(0x2002, 3)

    step(cpu, memory, opcodeTable)

    // -100 / 3 truncates to -33, remainder -1 (68000: -100 = 3*-33 + -1)
    expect(cpu.registers[Register.D0] & 0xffff).toBe(0x10000 - 33)
    expect((cpu.registers[Register.D0] >>> 16) & 0xffff).toBe(0xffff) // -1
    expect(cpu.status.N).toBe(true) // quotient is negative
  })

  it('sets V and leaves the destination unchanged when the quotient overflows a signed word', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 100000, 'long') // quotient would be 100000 (> 0x7fff)
    memory.write16(0x2000, mulDivWord(0b1000, 0, true, 0b111, 0b100))
    memory.write16(0x2002, 1)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(100000) // untouched
    expect(cpu.status.V).toBe(true)
  })

  it('raises the same Zero Divide exception as DIVU', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write32(ZERO_DIVIDE_VECTOR, 0x3000)
    writeRegister(cpu, Register.D0, -100, 'long')
    memory.write16(0x2000, mulDivWord(0b1000, 0, true, 0b111, 0b100)) // DIVS #0,D0
    memory.write16(0x2002, 0)

    step(cpu, memory, opcodeTable)

    expect(cpu.pc).toBe(0x3000)
  })
})

describe('CHK', () => {
  it('does not trap when Dn is within 0..bound', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 5, 'long')
    memory.write16(0x2000, chkWord(0, 0b111, 0b100)) // CHK #10,D0
    memory.write16(0x2002, 10)

    const cycles = step(cpu, memory, opcodeTable)

    expect(cpu.pc).toBe(0x2004) // straight past the extension word, no trap
    expect(cycles).toBe(10)
  })

  it('traps and sets N when Dn is negative', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write32(CHK_VECTOR, 0x3000)
    writeRegister(cpu, Register.D0, -1, 'long')
    memory.write16(0x2000, chkWord(0, 0b111, 0b100)) // CHK #10,D0
    memory.write16(0x2002, 10)

    const cycles = step(cpu, memory, opcodeTable)

    expect(cpu.status.N).toBe(true)
    expect(cpu.pc).toBe(0x3000)
    expect(cycles).toBe(40)
  })

  it('traps and clears N when Dn exceeds the bound', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write32(CHK_VECTOR, 0x3000)
    writeRegister(cpu, Register.D0, 20, 'long')
    memory.write16(0x2000, chkWord(0, 0b111, 0b100)) // CHK #10,D0
    memory.write16(0x2002, 10)

    step(cpu, memory, opcodeTable)

    expect(cpu.status.N).toBe(false)
    expect(cpu.pc).toBe(0x3000)
  })

  it('round-trips through the installed handler and back via RTS', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write32(CHK_VECTOR, 0x3000)
    writeRegister(cpu, Register.D0, -1, 'long')
    memory.write16(0x2000, chkWord(0, 0b111, 0b100)) // CHK #10,D0
    memory.write16(0x2002, 10)
    memory.write16(0x3000, RTS_WORD)
    const spBefore = cpu.registers[Register.A7]

    step(cpu, memory, opcodeTable) // CHK -> raises, pc = 0x3000
    step(cpu, memory, opcodeTable) // RTS -> pops back to right after CHK

    expect(cpu.pc).toBe(0x2004)
    expect(cpu.registers[Register.A7]).toBe(spBefore)
  })

  it('throws when trapping with no handler installed', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, -1, 'long')
    memory.write16(0x2000, chkWord(0, 0b111, 0b100)) // CHK #10,D0
    memory.write16(0x2002, 10)

    expect(() => step(cpu, memory, opcodeTable)).toThrow(/no handler installed/)
  })

  it('rejects An direct as a reserved encoding', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write32(ILLEGAL_INSTRUCTION_VECTOR, 0x3000)
    memory.write16(0x2000, chkWord(0, 0b001, 0)) // CHK A0,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.pc).toBe(0x3000)
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

describe('MOVEM', () => {
  it('register-to-memory, (An): stores selected registers in D0..A7 order at ascending addresses', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    writeRegister(cpu, Register.D0, 0x11111111, 'long')
    writeRegister(cpu, Register.D1, 0x22222222, 'long')
    writeRegister(cpu, Register.A1, 0x33333333, 'long')
    // D0 (bit0), D1 (bit1), A1 (bit9)
    memory.write16(0x2000, movemWord(0, 0, 0b010, 0)) // MOVEM.W D0/D1/A1,(A0)
    memory.write16(0x2002, 0b0000001000000011)

    const cycles = step(cpu, memory, opcodeTable)

    expect(memory.read16(0x3000)).toBe(0x1111)
    expect(memory.read16(0x3002)).toBe(0x2222)
    expect(memory.read16(0x3004)).toBe(0x3333)
    expect(cpu.registers[Register.A0]).toBe(0x3000) // (An) never modifies An
    expect(cpu.pc).toBe(0x2004)
    expect(cycles).toBe(8 + 4 * 3)
  })

  it('register-to-memory, -(An): reversed register list, so the lowest-numbered register ends up at the lowest address', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x4020, 'long')
    writeRegister(cpu, Register.D0, 0x11111111, 'long')
    writeRegister(cpu, Register.A1, 0x33333333, 'long')
    // Predecrement's list is reversed (bit0=A7..bit15=D0): D0 is bit15, A1 is bit6.
    memory.write16(0x2000, movemWord(0, 1, 0b100, 0)) // MOVEM.L D0/A1,-(A0)
    memory.write16(0x2002, (1 << 15) | (1 << 6))

    const cycles = step(cpu, memory, opcodeTable)

    expect(memory.read32(0x4018)).toBe(0x11111111) // D0: last stored, lowest address
    expect(memory.read32(0x401c)).toBe(0x33333333) // A1: stored first
    expect(cpu.registers[Register.A0]).toBe(0x4018)
    expect(cycles).toBe(8 + 8 * 2)
  })

  it('memory-to-register, (An): word size sign-extends each loaded value to the full register', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x5000, 'long')
    memory.write16(0x5000, 0xfffe) // -2, should sign-extend
    memory.write16(0x5002, 0x0007) // positive, unaffected by sign-extension
    memory.write16(0x2000, movemWord(1, 0, 0b010, 0)) // MOVEM.W (A0),D2/D3
    memory.write16(0x2002, (1 << 2) | (1 << 3))

    const cycles = step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D2]).toBe(0xfffffffe)
    expect(cpu.registers[Register.D3]).toBe(0x00000007)
    expect(cpu.registers[Register.A0]).toBe(0x5000) // (An) never modifies An
    expect(cycles).toBe(12 + 4 * 2)
  })

  it('memory-to-register, (An)+: normal register order, An advances past every register read', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x6000, 'long')
    memory.write32(0x6000, 0xaaaabbbb)
    memory.write32(0x6004, 0x11112222)
    // D5 (bit5), A2 (bit10)
    memory.write16(0x2000, movemWord(1, 1, 0b011, 0)) // MOVEM.L (A0)+,D5/A2
    memory.write16(0x2002, (1 << 5) | (1 << 10))

    const cycles = step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D5]).toBe(0xaaaabbbb)
    expect(cpu.registers[Register.A2]).toBe(0x11112222)
    expect(cpu.registers[Register.A0]).toBe(0x6008)
    expect(cycles).toBe(12 + 8 * 2)
  })

  it('a predecrement store followed by a postincrement load round-trips the same registers and address', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x4020, 'long')
    writeRegister(cpu, Register.D0, 0x11111111, 'long')
    writeRegister(cpu, Register.D1, 0x22222222, 'long')
    writeRegister(cpu, Register.A1, 0x33333333, 'long')
    memory.write16(0x2000, movemWord(0, 1, 0b100, 0)) // MOVEM.L D0/D1/A1,-(A0)
    memory.write16(0x2002, (1 << 15) | (1 << 14) | (1 << 6))
    memory.write16(0x2004, movemWord(1, 1, 0b011, 0)) // MOVEM.L (A0)+,D0/D1/A1
    memory.write16(0x2006, (1 << 0) | (1 << 1) | (1 << 9))

    step(cpu, memory, opcodeTable) // store
    writeRegister(cpu, Register.D0, 0, 'long')
    writeRegister(cpu, Register.D1, 0, 'long')
    writeRegister(cpu, Register.A1, 0, 'long')
    step(cpu, memory, opcodeTable) // load back

    expect(cpu.registers[Register.D0]).toBe(0x11111111)
    expect(cpu.registers[Register.D1]).toBe(0x22222222)
    expect(cpu.registers[Register.A1]).toBe(0x33333333)
    expect(cpu.registers[Register.A0]).toBe(0x4020) // back to the original address
  })

  it('reads an absolute long address after the register-list mask word, in that order', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x42, 'long')
    memory.write16(0x2000, movemWord(0, 1, 0b111, 0b001)) // MOVEM.L D0,$40000.L
    memory.write16(0x2002, 1 << 0) // D0
    memory.write32(0x2004, 0x00040000)

    step(cpu, memory, opcodeTable)

    expect(memory.read32(0x40000)).toBe(0x42)
    expect(cpu.pc).toBe(0x2008)
  })

  it('rejects predecrement addressing in the memory-to-register direction', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, movemWord(1, 0, 0b100, 0)) // MOVEM.W -(A0),D0 - not valid
    memory.write16(0x2002, 1)

    expect(() => step(cpu, memory, opcodeTable)).toThrow(/predecrement/)
  })

  it('rejects postincrement addressing in the register-to-memory direction', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, movemWord(0, 0, 0b011, 0)) // MOVEM.W D0,(A0)+ - not valid
    memory.write16(0x2002, 1)

    expect(() => step(cpu, memory, opcodeTable)).toThrow(/postincrement/)
  })

  it('mode=000 in this bit range still dispatches to EXT, not MOVEM, since the two share an opcode', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x12340080, 'long')
    memory.write16(0x2000, movemWord(0, 0, 0b000, 0)) // same bits as EXT.W D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x1234ff80) // EXT's effect
    expect(cpu.pc).toBe(0x2002) // EXT reads no extension word; MOVEM would have read a mask
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

describe('ASL', () => {
  it('shifts left, setting C/X to the bit shifted out and V on sign change', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x40, 'byte') // 0100_0000
    memory.write16(0x2000, shiftWord(1, 0b00, false, 1, 0b00, 0)) // ASL.B #1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xff).toBe(0x80) // 1000_0000
    expect(cpu.status.N).toBe(true)
    expect(cpu.status.C).toBe(false) // bit shifted out was 0
    expect(cpu.status.X).toBe(false)
    expect(cpu.status.V).toBe(true) // sign flipped 0 -> 1 mid-shift
  })

  it('an immediate count of 0 means 8', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0xff, 'byte')
    memory.write16(0x2000, shiftWord(1, 0b00, false, 0, 0b00, 0)) // ASL.B #8,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xff).toBe(0) // shifted all 8 bits out
    expect(cpu.status.Z).toBe(true)
  })
})

describe('ASR', () => {
  it('sign-extends on the way right, C/X from the bit shifted out', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x81, 'byte') // 1000_0001
    memory.write16(0x2000, shiftWord(0, 0b00, false, 1, 0b00, 0)) // ASR.B #1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xff).toBe(0xc0) // 1100_0000 (sign preserved)
    expect(cpu.status.C).toBe(true) // bit 0 (1) shifted out
    expect(cpu.status.X).toBe(true)
    expect(cpu.status.V).toBe(false)
  })
})

describe('LSL', () => {
  it('shifts left filling with 0, V always clear', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x81, 'byte') // 1000_0001
    memory.write16(0x2000, shiftWord(1, 0b01, false, 1, 0b00, 0)) // LSL.B #1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xff).toBe(0x02)
    expect(cpu.status.C).toBe(true) // bit 7 (1) shifted out
    expect(cpu.status.V).toBe(false)
  })
})

describe('LSR', () => {
  it('shifts right filling with 0', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x03, 'byte')
    memory.write16(0x2000, shiftWord(0, 0b01, false, 1, 0b00, 0)) // LSR.B #1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xff).toBe(0x01)
    expect(cpu.status.C).toBe(true)
  })

  it('supports a dynamic count from a data register', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x80, 'byte')
    writeRegister(cpu, Register.D1, 3, 'long') // shift count
    memory.write16(0x2000, shiftWord(0, 0b01, true, 1, 0b00, 0)) // LSR.B D1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xff).toBe(0x10) // 0x80 >> 3
  })

  it('a dynamic count of 0 clears C but leaves X untouched', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0xff, 'byte')
    writeRegister(cpu, Register.D1, 0, 'long') // shift count = 0
    cpu.status.C = true
    cpu.status.X = true
    memory.write16(0x2000, shiftWord(0, 0b01, true, 1, 0b00, 0)) // LSR.B D1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xff).toBe(0xff) // unchanged
    expect(cpu.status.C).toBe(false)
    expect(cpu.status.X).toBe(true) // unaffected, per real 68000 behavior
  })
})

describe('ROL', () => {
  it('rotates left, wrapping the bit shifted out into bit 0', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x81, 'byte') // 1000_0001
    memory.write16(0x2000, shiftWord(1, 0b11, false, 1, 0b00, 0)) // ROL.B #1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xff).toBe(0x03) // 0000_0011
    expect(cpu.status.C).toBe(true)
  })
})

describe('ROR', () => {
  it('rotates right, wrapping the bit shifted out into the top bit', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x01, 'byte')
    memory.write16(0x2000, shiftWord(0, 0b11, false, 1, 0b00, 0)) // ROR.B #1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xff).toBe(0x80)
    expect(cpu.status.C).toBe(true)
  })
})

describe('ROXL', () => {
  it('rotates left through X: the bit shifted out becomes the new X/C', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x81, 'byte') // 1000_0001
    cpu.status.X = false
    memory.write16(0x2000, shiftWord(1, 0b10, false, 1, 0b00, 0)) // ROXL.B #1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xff).toBe(0x02) // old bit 7 (1) shifted out, old X (0) shifted in
    expect(cpu.status.C).toBe(true)
    expect(cpu.status.X).toBe(true)
  })

  it('shifts the old X value in at bit 0, unlike a plain ROL', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x02, 'byte') // 0000_0010
    cpu.status.X = true
    memory.write16(0x2000, shiftWord(1, 0b10, false, 1, 0b00, 0)) // ROXL.B #1,D0

    step(cpu, memory, opcodeTable)

    // A plain ROL would give 0x04 (bit 7, which is 0, wraps to bit 0).
    // ROXL instead brings in the *old X* (1), giving 0x05.
    expect(cpu.registers[Register.D0] & 0xff).toBe(0x05)
    expect(cpu.status.X).toBe(false) // old bit 7 (0) is the new X
  })

  it('a dynamic count of 0 still sets C to X, unlike ROL', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0xff, 'byte')
    writeRegister(cpu, Register.D1, 0, 'long')
    cpu.status.X = true
    cpu.status.C = false
    memory.write16(0x2000, shiftWord(1, 0b10, true, 1, 0b00, 0)) // ROXL.B D1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xff).toBe(0xff) // unchanged - count was 0
    expect(cpu.status.C).toBe(true) // still set to X, even though nothing rotated
    expect(cpu.status.X).toBe(true)
  })
})

describe('ROXR', () => {
  it('rotates right through X: the bit shifted out becomes the new X/C', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x01, 'byte')
    cpu.status.X = false
    memory.write16(0x2000, shiftWord(0, 0b10, false, 1, 0b00, 0)) // ROXR.B #1,D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xff).toBe(0x00) // old bit 0 (1) shifted out, old X (0) shifted in
    expect(cpu.status.C).toBe(true)
    expect(cpu.status.X).toBe(true)
  })

  it('shifts the old X value in at the top bit, unlike a plain ROR', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x00, 'byte')
    cpu.status.X = true
    memory.write16(0x2000, shiftWord(0, 0b10, false, 1, 0b00, 0)) // ROXR.B #1,D0

    step(cpu, memory, opcodeTable)

    // A plain ROR would give 0x00 (bit 0, which is 0, wraps to the top).
    // ROXR instead brings in the *old X* (1), giving 0x80.
    expect(cpu.registers[Register.D0] & 0xff).toBe(0x80)
    expect(cpu.status.X).toBe(false) // old bit 0 (0) is the new X
  })
})

describe('ASL/ASR/LSL/LSR/ROL/ROR/ROXL/ROXR <ea> (memory-operand form)', () => {
  it('ASL shifts a memory word left by exactly one bit, tracking overflow', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x3000, 0xc001) // 1100_0000_0000_0001
    memory.write16(0x2000, memShiftWord(1, 0b00, 0b010, 0)) // ASL (A0)

    const cycles = step(cpu, memory, opcodeTable)

    expect(memory.read16(0x3000)).toBe(0x8002)
    expect(cpu.status.C).toBe(true) // bit 15 (1) shifted out
    expect(cpu.status.X).toBe(true)
    expect(cpu.status.V).toBe(false) // sign stayed negative (1 -> 1)
    expect(cycles).toBe(8)
  })

  it('ASR sign-extends a memory word right by one bit', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x3000, 0x8001)
    memory.write16(0x2000, memShiftWord(0, 0b00, 0b010, 0)) // ASR (A0)

    step(cpu, memory, opcodeTable)

    expect(memory.read16(0x3000)).toBe(0xc000)
    expect(cpu.status.C).toBe(true)
    expect(cpu.status.X).toBe(true)
    expect(cpu.status.V).toBe(false)
  })

  it('LSL shifts a memory word left, filling with 0', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x3000, 0x8001)
    memory.write16(0x2000, memShiftWord(1, 0b01, 0b010, 0)) // LSL (A0)

    step(cpu, memory, opcodeTable)

    expect(memory.read16(0x3000)).toBe(0x0002)
    expect(cpu.status.C).toBe(true)
    expect(cpu.status.V).toBe(false)
  })

  it('LSR shifts a memory word right, filling with 0, and reads/writes an absolute long address', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x40000, 0x0003)
    memory.write16(0x2000, memShiftWord(0, 0b01, 0b111, 0b001)) // LSR $40000.L
    memory.write32(0x2002, 0x00040000)

    step(cpu, memory, opcodeTable)

    expect(memory.read16(0x40000)).toBe(0x0001)
    expect(cpu.status.C).toBe(true)
    expect(cpu.pc).toBe(0x2006)
  })

  it('ROL rotates a memory word left, wrapping the top bit into bit 0', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x3000, 0x8001)
    memory.write16(0x2000, memShiftWord(1, 0b11, 0b010, 0)) // ROL (A0)

    step(cpu, memory, opcodeTable)

    expect(memory.read16(0x3000)).toBe(0x0003)
    expect(cpu.status.C).toBe(true)
  })

  it('ROR rotates a memory word right, wrapping bit 0 into the top bit', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x3000, 0x0001)
    memory.write16(0x2000, memShiftWord(0, 0b11, 0b010, 0)) // ROR (A0)

    step(cpu, memory, opcodeTable)

    expect(memory.read16(0x3000)).toBe(0x8000)
    expect(cpu.status.C).toBe(true)
  })

  it('ROXL rotates a memory word left through X, bringing the old X in at bit 0', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x3000, 0x0001) // bit 15 clear
    cpu.status.X = true
    memory.write16(0x2000, memShiftWord(1, 0b10, 0b010, 0)) // ROXL (A0)

    step(cpu, memory, opcodeTable)

    // A plain ROL would give 0x0002 (bit 15, which is 0, wraps to bit 0).
    // ROXL instead brings in the old X (1), giving 0x0003.
    expect(memory.read16(0x3000)).toBe(0x0003)
    expect(cpu.status.C).toBe(false) // old bit 15 (0) is the new X/C
    expect(cpu.status.X).toBe(false)
  })

  it('ROXR rotates a memory word right through X, bringing the old X in at the top bit', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x3000, 0x0000)
    cpu.status.X = true
    memory.write16(0x2000, memShiftWord(0, 0b10, 0b010, 0)) // ROXR (A0)

    step(cpu, memory, opcodeTable)

    // A plain ROR would give 0x0000 (bit 0, which is 0, wraps to the top).
    // ROXR instead brings in the old X (1), giving 0x8000.
    expect(memory.read16(0x3000)).toBe(0x8000)
    expect(cpu.status.C).toBe(false) // old bit 0 (0) is the new X/C
    expect(cpu.status.X).toBe(false)
  })

  it('the reserved size=11 resolves to the memory form for ROXL too, not the register form', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x3000, 0x0001)
    memory.write16(0x2000, memShiftWord(1, 0b10, 0b010, 0)) // ROXL (A0)

    expect(() => step(cpu, memory, opcodeTable)).not.toThrow()
  })

  it('rejects Dn as a destination (reserved - that is what the register form is for)', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write32(ILLEGAL_INSTRUCTION_VECTOR, 0x3000)
    memory.write16(0x2000, memShiftWord(1, 0b00, 0b000, 0)) // ASL D0 - not valid in this form
    memory.write16(0x3000, RTS_WORD)

    step(cpu, memory, opcodeTable) // raises -> pc = 0x3000
    step(cpu, memory, opcodeTable) // RTS -> back to right after the faulting word

    expect(cpu.pc).toBe(0x2002)
  })

  it('rejects An as a destination', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write32(ILLEGAL_INSTRUCTION_VECTOR, 0x3000)
    memory.write16(0x2000, memShiftWord(1, 0b00, 0b001, 0)) // ASL A0 - not valid
    memory.write16(0x3000, RTS_WORD)

    step(cpu, memory, opcodeTable)
    step(cpu, memory, opcodeTable)

    expect(cpu.pc).toBe(0x2002)
  })

  it('the reserved size=11 still resolves to the memory form, not the register form', () => {
    // As a register-form opcode, size bits = 11 (encoded by memShiftWord)
    // would hit decodeByteWordLongSize's throw for unsupported size bits -
    // so successfully reaching a plain result here proves the more
    // specific memory-form opcodeTable entry won the match instead.
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x3000, 0x0001)
    memory.write16(0x2000, memShiftWord(1, 0b00, 0b010, 0)) // ASL (A0)

    expect(() => step(cpu, memory, opcodeTable)).not.toThrow()
    expect(memory.read16(0x3000)).toBe(0x0002)
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

describe('DBRA', () => {
  it('decrements and branches while the counter has not reached -1', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 3, 'word')
    memory.write16(0x2000, dbraWord(0)) // DBRA D0,<disp>
    memory.write16(0x2002, 0xfffc) // -4: loop back to 0x2000

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xffff).toBe(2)
    // base is 0x2002 (right after the opcode word) - 4 = 0x1ffe
    expect(cpu.pc).toBe(0x1ffe)
  })

  it('falls through without branching once the counter reaches -1', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0, 'word') // decrements to -1 (0xffff)
    memory.write16(0x2000, dbraWord(0))
    memory.write16(0x2002, 0xfff0) // would branch backward if taken

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xffff).toBe(0xffff)
    expect(cpu.pc).toBe(0x2004) // past the extension word, no branch
  })

  it('only touches the low word of Dn, leaving the high word untouched', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x12340005, 'long')
    memory.write16(0x2000, dbraWord(0))
    memory.write16(0x2002, 0)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x12340004)
  })
})

describe('DBcc', () => {
  it('stops looping immediately when the condition is already true, without decrementing Dn', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.Z = true
    writeRegister(cpu, Register.D0, 5, 'word')
    memory.write16(0x2000, dbccWord(0b0111, 0)) // DBEQ D0,<disp>
    memory.write16(0x2002, 0xfff0) // would branch backward if taken

    const cycles = step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xffff).toBe(5) // untouched
    expect(cpu.pc).toBe(0x2004) // past the extension word, no branch
    expect(cycles).toBe(12)
  })

  it('decrements and branches when the condition is false and the counter has not reached -1', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.Z = false
    writeRegister(cpu, Register.D0, 3, 'word')
    memory.write16(0x2000, dbccWord(0b0111, 0)) // DBEQ D0,<disp>
    memory.write16(0x2002, 0xfffc) // -4: loop back to 0x2000

    const cycles = step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xffff).toBe(2)
    // base is 0x2002 (right after the opcode word) - 4 = 0x1ffe
    expect(cpu.pc).toBe(0x1ffe)
    expect(cycles).toBe(10)
  })

  it('falls through without branching once a false condition drives the counter to -1', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.Z = false
    writeRegister(cpu, Register.D0, 0, 'word') // decrements to -1 (0xffff)
    memory.write16(0x2000, dbccWord(0b0111, 0)) // DBEQ D0,<disp>
    memory.write16(0x2002, 0xfff0) // would branch backward if taken

    const cycles = step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xffff).toBe(0xffff)
    expect(cpu.pc).toBe(0x2004) // past the extension word, no branch
    expect(cycles).toBe(14)
  })

  it('DBNE loops on a different condition than DBEQ, for the same Z flag', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.Z = false // NE is true, so DBNE stops immediately
    writeRegister(cpu, Register.D0, 5, 'word')
    memory.write16(0x2000, dbccWord(0b0110, 0)) // DBNE D0,<disp>
    memory.write16(0x2002, 0xfff0)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0] & 0xffff).toBe(5) // untouched
    expect(cpu.pc).toBe(0x2004) // no branch
  })
})

describe('Scc', () => {
  it('sets the byte destination to all 1s when the condition is true, without touching the rest of Dn', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.Z = true
    writeRegister(cpu, Register.D0, 0x12345678, 'long')
    memory.write16(0x2000, sccWord(0b0111, 0b000, 0)) // SEQ D0

    const cycles = step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x123456ff)
    expect(cycles).toBe(6)
  })

  it('sets the byte destination to all 0s when the condition is false', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.Z = false
    writeRegister(cpu, Register.D0, 0x12345678, 'long')
    memory.write16(0x2000, sccWord(0b0111, 0b000, 0)) // SEQ D0

    const cycles = step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x12345600)
    expect(cycles).toBe(4)
  })

  it('writes to a memory destination via decodeEA, at a flat cost regardless of the condition', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.C = false // CC (carry clear) is true
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x2000, sccWord(0b0100, 0b010, 0)) // SCC (A0)

    const cycles = step(cpu, memory, opcodeTable)

    expect(memory.read8(0x3000)).toBe(0xff)
    expect(cycles).toBe(8)
  })

  it("doesn't touch any status flags", () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.Z = true
    cpu.status.N = true
    cpu.status.V = true
    cpu.status.C = true
    cpu.status.X = true
    memory.write16(0x2000, sccWord(0b0111, 0b000, 0)) // SEQ D0

    step(cpu, memory, opcodeTable)

    expect(cpu.status.N).toBe(true)
    expect(cpu.status.V).toBe(true)
    expect(cpu.status.C).toBe(true)
    expect(cpu.status.X).toBe(true)
  })

  it('mode=001 in this bit range still dispatches to DBcc, not Scc, since the two share an encoding space', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    cpu.status.Z = true // condition true -> DBcc stops immediately (12 cycles) without touching A0
    writeRegister(cpu, Register.A0, 0x12345678, 'long')
    memory.write16(0x2000, sccWord(0b0111, 0b001, 0)) // same bits as DBEQ D0,<disp> — mode=001 is DBcc's marker
    memory.write16(0x2002, 0xfff0)

    const cycles = step(cpu, memory, opcodeTable)

    expect(cycles).toBe(12) // DBcc's condition-true cost, not Scc's (6)
    expect(cpu.registers[Register.A0]).toBe(0x12345678) // untouched - Scc's handler never ran
  })
})

describe('LEA', () => {
  it('loads the address from (An) into a destination address register', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x2000, leaWord(1, 0b010, 0)) // LEA (A0),A1

    const cycles = step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.A1]).toBe(0x3000)
    expect(cycles).toBe(4)
  })

  it('loads an address computed from d16(An)', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x2000, leaWord(1, 0b101, 0)) // LEA $10(A0),A1
    memory.write16(0x2002, 0x0010)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.A1]).toBe(0x3010)
    expect(cpu.pc).toBe(0x2004)
  })

  it('loads a full 32-bit absolute address', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, leaWord(0, 0b111, 0b001)) // LEA $40000.L,A0
    memory.write32(0x2002, 0x00040000)

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.A0]).toBe(0x40000)
  })

  it('rejects a non-control addressing mode', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, leaWord(0, 0b000, 0)) // LEA D0,A0 - not a valid control mode

    expect(() => step(cpu, memory, opcodeTable)).toThrow(/not a control addressing mode/)
  })
})

describe('PEA', () => {
  it('pushes the address from (An) onto the stack', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x2000, peaWord(0b010, 0)) // PEA (A0)
    const spBefore = cpu.registers[Register.A7]

    const cycles = step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.A7]).toBe(spBefore - 4)
    expect(memory.read32(spBefore - 4)).toBe(0x3000)
    expect(cycles).toBe(12)
  })

  it('pushes a full 32-bit absolute address', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, peaWord(0b111, 0b001)) // PEA $40000.L
    memory.write32(0x2002, 0x00040000)
    const spBefore = cpu.registers[Register.A7]

    step(cpu, memory, opcodeTable)

    expect(memory.read32(spBefore - 4)).toBe(0x40000)
    expect(cpu.pc).toBe(0x2006)
  })

  it('mode=000 in this bit range still dispatches to SWAP, not PEA, since the two share an opcode', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D0, 0x12340005, 'long')
    const spBefore = cpu.registers[Register.A7]
    memory.write16(0x2000, peaWord(0b000, 0)) // same bits as SWAP D0

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.D0]).toBe(0x00051234) // SWAP's effect
    expect(cpu.registers[Register.A7]).toBe(spBefore) // untouched - PEA's handler never ran
  })
})

describe('JSR/BSR/RTS', () => {
  it('JSR (An) pushes the return address and jumps to the register', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x2000, jsrWord(0b010, 0)) // JSR (A0)
    const spBefore = cpu.registers[Register.A7]

    step(cpu, memory, opcodeTable)

    expect(cpu.pc).toBe(0x3000)
    expect(cpu.registers[Register.A7]).toBe(spBefore - 4)
    expect(memory.read32(spBefore - 4)).toBe(0x2002) // return address, right after the opcode word
  })

  it('JSR rejects an addressing mode that is not a control mode', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, jsrWord(0b000, 0)) // JSR Dn - not a valid control mode

    expect(() => step(cpu, memory, opcodeTable)).toThrow(/not a control addressing mode/)
  })

  it('JSR d16(An) jumps to a base register plus a 16-bit displacement', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x2000, jsrWord(0b101, 0)) // JSR $10(A0)
    memory.write16(0x2002, 0x0010)

    step(cpu, memory, opcodeTable)

    expect(cpu.pc).toBe(0x3010)
    expect(memory.read32(cpu.registers[Register.A7])).toBe(0x2004) // return address, past the extension word
  })

  it('JSR d8(An,Xn) jumps to a base register plus an index and an 8-bit displacement', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    writeRegister(cpu, Register.D1, 0x0004, 'long')
    memory.write16(0x2000, jsrWord(0b110, 0)) // JSR $6(A0,D1.W)
    memory.write16(0x2002, 0x1006) // Xn=D1, word index, d8=$06

    step(cpu, memory, opcodeTable)

    expect(cpu.pc).toBe(0x300a) // 0x3000 + 0x4 (D1) + 0x6 (d8)
  })

  it('JSR xxx.L jumps to a full 32-bit absolute address', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, jsrWord(0b111, 0b001)) // JSR $40000.L
    memory.write32(0x2002, 0x00040000)

    step(cpu, memory, opcodeTable)

    expect(cpu.pc).toBe(0x40000)
    expect(memory.read32(cpu.registers[Register.A7])).toBe(0x2006)
  })

  it('JSR d16(PC) jumps relative to the address of its extension word', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, jsrWord(0b111, 0b010)) // JSR $10(PC)
    memory.write16(0x2002, 0x0010)

    step(cpu, memory, opcodeTable)

    expect(cpu.pc).toBe(0x2012) // 0x2002 (extension word address) + 0x10
  })

  it('JSR d8(PC,Xn) jumps relative to the extension word plus an index', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.D1, 0x0004, 'long')
    memory.write16(0x2000, jsrWord(0b111, 0b011)) // JSR $6(PC,D1.W)
    memory.write16(0x2002, 0x1006) // Xn=D1, word index, d8=$06

    step(cpu, memory, opcodeTable)

    expect(cpu.pc).toBe(0x200c) // 0x2002 (extension word address) + 0x4 (D1) + 0x6 (d8)
  })

  it('BSR pushes the return address and branches, using an 8-bit displacement', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, bsrWord(4)) // BSR +4
    const spBefore = cpu.registers[Register.A7]

    step(cpu, memory, opcodeTable)

    expect(cpu.pc).toBe(0x2006)
    expect(cpu.registers[Register.A7]).toBe(spBefore - 4)
    expect(memory.read32(spBefore - 4)).toBe(0x2002) // return address, right after the opcode word
  })

  it('BSR supports a 16-bit displacement when the byte field is 0', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, bsrWord(0)) // BSR, word form
    memory.write16(0x2002, 0xfff0) // -16

    step(cpu, memory, opcodeTable)

    // base is 0x2002 (right after the opcode word, before the extension word)
    expect(cpu.pc).toBe(0x2002 - 16)
    // return address is past the extension word, at 0x2004
    expect(memory.read32(cpu.registers[Register.A7])).toBe(0x2004)
  })

  it('RTS pops the return address pushed by JSR and resumes there', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long')
    memory.write16(0x2000, jsrWord(0b010, 0)) // JSR (A0)
    memory.write16(0x3000, RTS_WORD)
    const spBefore = cpu.registers[Register.A7]

    step(cpu, memory, opcodeTable) // JSR -> pc = 0x3000
    step(cpu, memory, opcodeTable) // RTS -> pc = 0x2002

    expect(cpu.pc).toBe(0x2002)
    expect(cpu.registers[Register.A7]).toBe(spBefore)
  })
})

describe('LINK/UNLK', () => {
  it('LINK pushes An, points An at the new frame, then moves SP by the displacement', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0xabcd1234, 'long')
    memory.write16(0x2000, linkWord(0)) // LINK A0,#-8
    memory.write16(0x2002, 0xfff8) // -8
    const spBefore = cpu.registers[Register.A7]

    const cycles = step(cpu, memory, opcodeTable)

    const frame = spBefore - 4
    expect(memory.read32(frame)).toBe(0xabcd1234) // old A0 pushed
    expect(cpu.registers[Register.A0]).toBe(frame) // A0 now points at the pushed value
    expect(cpu.registers[Register.A7]).toBe(frame - 8) // SP moved by the displacement
    expect(cpu.pc).toBe(0x2004)
    expect(cycles).toBe(16)
  })

  it('LINK A7 pushes the already-decremented SP, not the pre-decrement value', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, linkWord(7)) // LINK A7,#-4
    memory.write16(0x2002, 0xfffc) // -4
    const spBefore = cpu.registers[Register.A7]

    step(cpu, memory, opcodeTable)

    const frame = spBefore - 4
    expect(memory.read32(frame)).toBe(frame) // pushed value is the decremented SP itself
    expect(cpu.registers[Register.A7]).toBe(frame - 4)
  })

  it('UNLK restores SP from An, then pops the old An value', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0x3000, 'long') // frame pointer
    memory.write32(0x3000, 0x9999) // old A0 value sitting at the frame
    memory.write16(0x2000, unlkWord(0)) // UNLK A0

    const cycles = step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.A0]).toBe(0x9999)
    expect(cpu.registers[Register.A7]).toBe(0x3004)
    expect(cycles).toBe(12)
  })

  it('UNLK A7 computes the final SP from the just-popped value, not the frame pointer', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A7, 0x3000, 'long')
    memory.write32(0x3000, 0x7000) // value sitting at the frame
    memory.write16(0x2000, unlkWord(7)) // UNLK A7

    step(cpu, memory, opcodeTable)

    expect(cpu.registers[Register.A7]).toBe(0x7004) // popped value + 4, not 0x3000 + 4
  })

  it('LINK then UNLK round-trips: An and SP both end up back where they started', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    writeRegister(cpu, Register.A0, 0xabcd1234, 'long')
    memory.write16(0x2000, linkWord(0)) // LINK A0,#-8
    memory.write16(0x2002, 0xfff8) // -8
    memory.write16(0x2004, unlkWord(0)) // UNLK A0
    const spBefore = cpu.registers[Register.A7]

    step(cpu, memory, opcodeTable) // LINK
    step(cpu, memory, opcodeTable) // UNLK

    expect(cpu.registers[Register.A0]).toBe(0xabcd1234)
    expect(cpu.registers[Register.A7]).toBe(spBefore)
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

  it('an address register target raises Illegal Instruction', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write32(ILLEGAL_INSTRUCTION_VECTOR, 0x3000)
    memory.write16(0x2000, btstWord(0b001, 0)) // BTST #n,A0
    memory.write16(0x3000, RTS_WORD)

    step(cpu, memory, opcodeTable) // raises -> pc = 0x3000
    step(cpu, memory, opcodeTable) // RTS -> back to right after the BTST

    expect(cpu.pc).toBe(0x2002)
  })

  it('throws when no Illegal Instruction handler is installed', () => {
    const cpu = createCPU(0x2000)
    const memory = new SystemMemory()
    memory.write16(0x2000, btstWord(0b001, 0)) // BTST #n,A0
    memory.write16(0x2002, 0)

    expect(() => step(cpu, memory, opcodeTable)).toThrow(/no handler installed/)
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
