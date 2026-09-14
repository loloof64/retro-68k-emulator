import { Register, type CPUState, type Memory, type OpcodeDefinition } from '../types/cpu'
import { USER_RAM_START } from '../memory'

// Matches docs/MEMORY.md: "Stack Pointer (A7) starts at $03FFF".
export const DEFAULT_STACK_POINTER = 0x03fff

export function createCPU(startPC: number = USER_RAM_START): CPUState {
  const registers = new Uint32Array(16)
  registers[Register.A7] = DEFAULT_STACK_POINTER

  return {
    registers,
    pc: startPC,
    sp: DEFAULT_STACK_POINTER,
    status: { C: false, V: false, Z: false, N: false, X: false },
    halted: false,
    cycles: 0,
  }
}

export function reset(cpu: CPUState, startPC: number = USER_RAM_START): void {
  cpu.registers.fill(0)
  cpu.registers[Register.A7] = DEFAULT_STACK_POINTER
  cpu.pc = startPC
  cpu.sp = DEFAULT_STACK_POINTER
  cpu.status.C = false
  cpu.status.V = false
  cpu.status.Z = false
  cpu.status.N = false
  cpu.status.X = false
  cpu.halted = false
  cpu.cycles = 0
}

export type Size = 'byte' | 'word' | 'long'

function sizeMask(size: Size): number {
  return size === 'byte' ? 0xff : size === 'word' ? 0xffff : 0xffffffff
}

export function readRegister(cpu: CPUState, reg: Register, size: Size = 'long'): number {
  return cpu.registers[reg] & sizeMask(size)
}

export function writeRegister(cpu: CPUState, reg: Register, value: number, size: Size = 'long'): void {
  const isAddressRegister = reg >= Register.A0

  // Address registers always hold a full 32-bit address: a word/byte move
  // to An sign-extends rather than merging into the low bits like Dn does.
  if (isAddressRegister) {
    const extended =
      size === 'byte' ? (value << 24) >> 24 : size === 'word' ? (value << 16) >> 16 : value
    cpu.registers[reg] = extended >>> 0
  } else if (size === 'long') {
    cpu.registers[reg] = value >>> 0
  } else {
    const mask = sizeMask(size)
    cpu.registers[reg] = (cpu.registers[reg] & ~mask) | (value & mask)
  }

  // `sp` mirrors registers[A7] — see the duplication in types/cpu.ts's CPUState.
  if (reg === Register.A7) {
    cpu.sp = cpu.registers[reg]
  }
}

// Sets N/Z from a result truncated to `size`. V/C are operation-specific
// (overflow/carry mean different things per instruction) and left to the
// individual opcode handler.
export function updateFlags(cpu: CPUState, result: number, size: Size): void {
  const mask = sizeMask(size)
  const signBit = size === 'byte' ? 0x80 : size === 'word' ? 0x8000 : 0x80000000
  const masked = result & mask
  cpu.status.Z = masked === 0
  cpu.status.N = (masked & signBit) !== 0
}

// An opcode "family": every instruction whose word matches `pattern` once
// masked by `mask` is decoded by the same handler (e.g. all ~2000 MOVE word
// encodings share one entry). A single fixed-value instruction like NOP is
// just the degenerate case: mask = 0xffff.
export interface OpcodeEntry {
  mask: number
  pattern: number
  definition: OpcodeDefinition
}

// Fetches the opcode word at PC, finds the matching family, and executes
// it. Advances PC past the opcode word before running the handler, so a
// handler that reads further extension words via `memory` and bumps
// `cpu.pc` itself ends up leaving PC at the next instruction — no separate
// "instruction length" bookkeeping needed here. The raw opcode word is
// passed as args[0], for handlers that decode their own operand fields
// from it (register numbers, size bits, addressing modes, ...).
export function step(cpu: CPUState, memory: Memory, opcodeTable: readonly OpcodeEntry[]): number {
  if (cpu.halted) {
    return 0
  }

  const opcodeWord = memory.read16(cpu.pc)
  cpu.pc += 2

  const entry = opcodeTable.find((e) => (opcodeWord & e.mask) === e.pattern)
  if (!entry) {
    throw new Error(`Unknown instruction: $${opcodeWord.toString(16).padStart(4, '0')}`)
  }

  const cycles = entry.definition.handler(cpu, memory, [opcodeWord])
  cpu.cycles += cycles
  return cycles
}
