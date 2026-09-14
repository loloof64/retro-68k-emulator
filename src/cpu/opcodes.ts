import type { CPUState, Memory, OpcodeDefinition } from '../types/cpu'
import type { OpcodeEntry } from './index'
import { updateFlags } from './index'
import { decodeEA, type Size } from './addressing'
import { addWithFlags } from './arithmetic'

function opcodeWordOf(args: unknown[]): number {
  return args[0] as number
}

// --- NOP ($4E71) --------------------------------------------------------

const NOP: OpcodeDefinition = {
  mnemonic: 'NOP',
  encoding: '0100111001110001',
  size: 'word',
  handler: () => 4,
}

// --- MOVE (bits 15-14 = 00, size in bits 13-12: 1=byte 3=word 2=long) ---

function decodeMoveSize(bits: number): Size {
  if (bits === 0b01) return 'byte'
  if (bits === 0b11) return 'word'
  if (bits === 0b10) return 'long'
  throw new Error(`Invalid MOVE size bits: ${bits.toString(2)}`)
}

const MOVE: OpcodeDefinition = {
  mnemonic: 'MOVE',
  encoding: '00SSdddDDDsssRRR',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const size = decodeMoveSize((opcodeWord >> 12) & 0b11)
    const destReg = (opcodeWord >> 9) & 0b111
    const destMode = (opcodeWord >> 6) & 0b111
    const srcMode = (opcodeWord >> 3) & 0b111
    const srcReg = opcodeWord & 0b111

    // Source decoded before destination: extension words (e.g. #imm) follow
    // the opcode word in that same order in memory.
    const src = decodeEA(cpu, memory, srcMode, srcReg, size)
    const dest = decodeEA(cpu, memory, destMode, destReg, size)

    const value = src.read()
    dest.write(value)

    // Real 68000 MOVE: N/Z from the result, V and C always cleared, X unaffected.
    updateFlags(cpu, value, size)
    cpu.status.V = false
    cpu.status.C = false

    return 4
  },
}

// --- ADD <ea>,Dn (opmode bits 8-6 = 0xx: EA + Dn -> Dn) -----------------

function decodeAddSize(bits: number): Size {
  if (bits === 0b000) return 'byte'
  if (bits === 0b001) return 'word'
  if (bits === 0b010) return 'long'
  throw new Error(`Unsupported ADD opmode: ${bits.toString(2)}`)
}

const ADD: OpcodeDefinition = {
  mnemonic: 'ADD',
  encoding: '1101rrr0ssmmmRRR',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const destReg = (opcodeWord >> 9) & 0b111
    const size = decodeAddSize((opcodeWord >> 6) & 0b111)
    const srcMode = (opcodeWord >> 3) & 0b111
    const srcReg = opcodeWord & 0b111

    const src = decodeEA(cpu, memory, srcMode, srcReg, size)
    const dest = decodeEA(cpu, memory, 0b000, destReg, size)

    const { result, flags } = addWithFlags(dest.read(), src.read(), size)
    dest.write(result)

    cpu.status.N = flags.N
    cpu.status.Z = flags.Z
    cpu.status.V = flags.V
    cpu.status.C = flags.C
    cpu.status.X = flags.X

    return 4
  },
}

// --- TRAP #n ($4E40-$4E4F) ----------------------------------------------

export type TrapHandler = (cpu: CPUState, memory: Memory, vector: number) => void

// TRAP #0 matches docs/MEMORY.md's vector table: "exit program".
export const trapHandlers: Record<number, TrapHandler> = {
  0: (cpu) => {
    cpu.halted = true
  },
}

const TRAP: OpcodeDefinition = {
  mnemonic: 'TRAP',
  encoding: '010011100100vvvv',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const vector = opcodeWordOf(args) & 0xf
    const handler = trapHandlers[vector]
    if (!handler) {
      throw new Error(`Unimplemented TRAP vector: ${vector}`)
    }
    handler(cpu, memory, vector)
    return 4
  },
}

export const opcodeTable: readonly OpcodeEntry[] = [
  { mask: 0xffff, pattern: 0x4e71, definition: NOP },
  { mask: 0xfff0, pattern: 0x4e40, definition: TRAP },
  { mask: 0xf100, pattern: 0xd000, definition: ADD },
  { mask: 0xc000, pattern: 0x0000, definition: MOVE },
]
