import { Register, type CPUState, type Memory, type OpcodeDefinition, type StatusFlags } from '../types/cpu'
import type { OpcodeEntry } from './index'
import { updateFlags, writeRegister } from './index'
import { decodeEA, type Size } from './addressing'
import { addWithFlags, subWithFlags } from './arithmetic'

function opcodeWordOf(args: unknown[]): number {
  return args[0] as number
}

function toSigned8(value: number): number {
  return (value << 24) >> 24
}

function toSigned16(value: number): number {
  return (value << 16) >> 16
}

// Shared by ADD/SUB/CMP: opmode bits 8-6 (with bit 8 already known to be 0
// by the caller's mask) select the operand size.
function decodeStandardOpSize(bits: number): Size {
  if (bits === 0b000) return 'byte'
  if (bits === 0b001) return 'word'
  if (bits === 0b010) return 'long'
  throw new Error(`Unsupported opmode: ${bits.toString(2)}`)
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

// --- ADD/SUB <ea>,Dn (opmode bits 8-6 = 0xx: EA (+/-) Dn -> Dn) ---------

function decodeEaAndDest(cpu: CPUState, memory: Memory, opcodeWord: number) {
  const destReg = (opcodeWord >> 9) & 0b111
  const size = decodeStandardOpSize((opcodeWord >> 6) & 0b111)
  const srcMode = (opcodeWord >> 3) & 0b111
  const srcReg = opcodeWord & 0b111

  const src = decodeEA(cpu, memory, srcMode, srcReg, size)
  const dest = decodeEA(cpu, memory, 0b000, destReg, size)
  return { src, dest, size }
}

const ADD: OpcodeDefinition = {
  mnemonic: 'ADD',
  encoding: '1101rrr0ssmmmRRR',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { src, dest, size } = decodeEaAndDest(cpu, memory, opcodeWordOf(args))

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

// --- SUB <ea>,Dn (opmode bits 8-6 = 0xx: Dn - EA -> Dn) -----------------

const SUB: OpcodeDefinition = {
  mnemonic: 'SUB',
  encoding: '1001rrr0ssmmmRRR',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { src, dest, size } = decodeEaAndDest(cpu, memory, opcodeWordOf(args))

    const { result, flags } = subWithFlags(dest.read(), src.read(), size)
    dest.write(result)

    cpu.status.N = flags.N
    cpu.status.Z = flags.Z
    cpu.status.V = flags.V
    cpu.status.C = flags.C
    cpu.status.X = flags.X

    return 4
  },
}

// --- CMP <ea>,Dn (opmode bits 8-6 = 0xx: Dn - EA, result discarded) -----

const CMP: OpcodeDefinition = {
  mnemonic: 'CMP',
  encoding: '1011rrr0ssmmmRRR',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { src, dest, size } = decodeEaAndDest(cpu, memory, opcodeWordOf(args))

    const { flags } = subWithFlags(dest.read(), src.read(), size)

    cpu.status.N = flags.N
    cpu.status.Z = flags.Z
    cpu.status.V = flags.V
    cpu.status.C = flags.C
    // Real 68000 CMP leaves X untouched (unlike SUB).

    return 4
  },
}

// --- MOVEQ #imm,Dn ($7000-$7EFE, bit8 = 0) ------------------------------

const MOVEQ: OpcodeDefinition = {
  mnemonic: 'MOVEQ',
  encoding: '0111rrr0dddddddd',
  size: 'long',
  handler: (cpu: CPUState, _memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const destReg = (Register.D0 + ((opcodeWord >> 9) & 0b111)) as Register
    const value = toSigned8(opcodeWord & 0xff)

    writeRegister(cpu, destReg, value, 'long')

    updateFlags(cpu, cpu.registers[destReg], 'long')
    cpu.status.V = false
    cpu.status.C = false

    return 4
  },
}

// --- Bcc / BRA ($6000-$6FFE; cc=0000 is BRA, cc=0001 (BSR) unimplemented)

function branchConditionTrue(cc: number, status: StatusFlags): boolean {
  switch (cc) {
    case 0b0000:
      return true // BRA
    case 0b0010:
      return !status.C && !status.Z // BHI
    case 0b0011:
      return status.C || status.Z // BLS
    case 0b0100:
      return !status.C // BCC/BHS
    case 0b0101:
      return status.C // BCS/BLO
    case 0b0110:
      return !status.Z // BNE
    case 0b0111:
      return status.Z // BEQ
    case 0b1000:
      return !status.V // BVC
    case 0b1001:
      return status.V // BVS
    case 0b1010:
      return !status.N // BPL
    case 0b1011:
      return status.N // BMI
    case 0b1100:
      return status.N === status.V // BGE
    case 0b1101:
      return status.N !== status.V // BLT
    case 0b1110:
      return !status.Z && status.N === status.V // BGT
    case 0b1111:
      return status.Z || status.N !== status.V // BLE
    default:
      throw new Error(`Unsupported branch condition: ${cc.toString(2)} (BSR not implemented)`)
  }
}

const Bcc: OpcodeDefinition = {
  mnemonic: 'Bcc',
  encoding: '0110ccccdddddddd',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const cc = (opcodeWord >> 8) & 0xf
    const disp8 = opcodeWord & 0xff

    // Real 68000: the branch is always relative to "address of the opcode
    // word + 2" — i.e. cpu.pc right now, *before* reading any 16-bit
    // displacement extension word below.
    const base = cpu.pc
    let displacement: number
    if (disp8 === 0x00) {
      displacement = toSigned16(memory.read16(cpu.pc))
      cpu.pc += 2
    } else {
      displacement = toSigned8(disp8)
    }

    if (branchConditionTrue(cc, cpu.status)) {
      cpu.pc = base + displacement
    }

    return 10
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
  { mask: 0xf100, pattern: 0x9000, definition: SUB },
  { mask: 0xf100, pattern: 0xb000, definition: CMP },
  { mask: 0xf100, pattern: 0x7000, definition: MOVEQ },
  { mask: 0xf000, pattern: 0x6000, definition: Bcc },
  { mask: 0xc000, pattern: 0x0000, definition: MOVE },
]
