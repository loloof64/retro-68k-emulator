import { Register, type CPUState, type Memory, type OpcodeDefinition, type StatusFlags } from '../types/cpu'
import type { OpcodeEntry } from './index'
import { readRegister, updateFlags, writeRegister } from './index'
import { decodeEA, type Size } from './addressing'
import { addWithFlags, subWithFlags } from './arithmetic'
import { INPUT_START, SOUND_DURATION, SOUND_FREQUENCY, SOUND_TRIGGER, SOUND_VOLUME, SOUND_WAVEFORM } from '../memory'

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

// --- BTST #<data>,<ea> ($0800) -------------------------------------------
//
// Tests a single bit and sets Z accordingly (Z=1 when the bit is clear) —
// unlike AND, it never modifies its operand. That makes it the natural way
// to poll one button at a time out of the packed bitmask at INPUT_START
// (see docs/MEMORY.md): MOVE the input word into Dn, then BTST each bit.

const BTST: OpcodeDefinition = {
  mnemonic: 'BTST',
  encoding: '0000100000mmmrrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    if (mode === 0b001) {
      throw new Error('BTST cannot target an address register')
    }

    // Extension word carries the bit number to test.
    const bitNumberWord = memory.read16(cpu.pc)
    cpu.pc += 2

    // Real 68000: a register operand is tested as a full 32-bit long (bit
    // number mod 32); a memory operand is tested as a single byte (mod 8).
    const isRegisterOperand = mode === 0b000
    const size: Size = isRegisterOperand ? 'long' : 'byte'
    const bitNumber = bitNumberWord & (isRegisterOperand ? 0x1f : 0x07)

    const ea = decodeEA(cpu, memory, mode, reg, size)
    const value = ea.read()

    cpu.status.Z = ((value >>> bitNumber) & 1) === 0

    return isRegisterOperand ? 4 : 8
  },
}

// --- AND <ea>,Dn (opmode bits 8-6 = 0xx: EA & Dn -> Dn) -----------------

const AND: OpcodeDefinition = {
  mnemonic: 'AND',
  encoding: '1100rrr0ssmmmRRR',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { src, dest, size } = decodeEaAndDest(cpu, memory, opcodeWordOf(args))

    const result = dest.read() & src.read()
    dest.write(result)

    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = false

    return 4
  },
}

// --- OR <ea>,Dn (opmode bits 8-6 = 0xx: EA | Dn -> Dn) ------------------

const OR: OpcodeDefinition = {
  mnemonic: 'OR',
  encoding: '1000rrr0ssmmmRRR',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { src, dest, size } = decodeEaAndDest(cpu, memory, opcodeWordOf(args))

    const result = dest.read() | src.read()
    dest.write(result)

    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = false

    return 4
  },
}

// --- EOR Dn,<ea> (opmode bits 8-6 = 1xx: Dn ^ EA -> EA) ------------------
//
// Unlike AND/OR/ADD/SUB, EOR only exists in this one direction: it shares
// its top nibble with CMP (both $B000), split by opmode's high bit — 0xx is
// CMP (EA-Dn, discarded), 1xx is EOR (Dn^EA, written back to EA). So the
// source is always Dn (the Rn field) and the destination is the decoded EA,
// the mirror image of decodeEaAndDest.

function decodeDnAndEa(cpu: CPUState, memory: Memory, opcodeWord: number) {
  const srcReg = (opcodeWord >> 9) & 0b111
  // Opmode here is 1xx (100/101/110); only the low 2 bits pick the size —
  // same byte/word/long values decodeStandardOpSize already handles.
  const size = decodeStandardOpSize((opcodeWord >> 6) & 0b011)
  const destMode = (opcodeWord >> 3) & 0b111
  const destReg = opcodeWord & 0b111

  const src = decodeEA(cpu, memory, 0b000, srcReg, size)
  const dest = decodeEA(cpu, memory, destMode, destReg, size)
  return { src, dest, size }
}

const XOR: OpcodeDefinition = {
  mnemonic: 'XOR',
  encoding: '1011rrr1ssmmmRRR',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { src, dest, size } = decodeDnAndEa(cpu, memory, opcodeWordOf(args))

    const result = dest.read() ^ src.read()
    dest.write(result)

    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = false

    return 4
  },
}

// --- NOT <ea> ($4600) -----------------------------------------------------

function decodeByteWordLongSize(bits: number): Size {
  if (bits === 0b00) return 'byte'
  if (bits === 0b01) return 'word'
  if (bits === 0b10) return 'long'
  throw new Error(`Unsupported size bits: ${bits.toString(2)}`)
}

const NOT: OpcodeDefinition = {
  mnemonic: 'NOT',
  encoding: '01000110ssmmmrrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const size = decodeByteWordLongSize((opcodeWord >> 6) & 0b11)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    const ea = decodeEA(cpu, memory, mode, reg, size)
    const result = ~ea.read()
    ea.write(result)

    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = false

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
  // TRAP #5: read controller state -> D0 (convenience wrapper around a
  // plain MOVE.L from INPUT_START; see docs/MEMORY.md).
  5: (cpu, memory) => {
    writeRegister(cpu, Register.D0, memory.read32(INPUT_START), 'long')
  },
  // TRAP #6: play tone. D0=frequency (Hz, word), D1=duration (ms, word),
  // D2=volume (0-255, byte), D3=waveform (byte, see SOUND_WAVEFORM_* in
  // src/memory/index.ts). Writes those into the sound registers and sets
  // the trigger byte — see docs/MEMORY.md. This only updates memory: no
  // audio backend consumes the trigger yet, so nothing is heard today.
  6: (cpu, memory) => {
    memory.write16(SOUND_FREQUENCY, readRegister(cpu, Register.D0, 'word'))
    memory.write16(SOUND_DURATION, readRegister(cpu, Register.D1, 'word'))
    memory.write8(SOUND_VOLUME, readRegister(cpu, Register.D2, 'byte'))
    memory.write8(SOUND_WAVEFORM, readRegister(cpu, Register.D3, 'byte'))
    memory.write8(SOUND_TRIGGER, 1)
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
  { mask: 0xffc0, pattern: 0x0800, definition: BTST },
  { mask: 0xff00, pattern: 0x4600, definition: NOT },
  { mask: 0xf100, pattern: 0xd000, definition: ADD },
  { mask: 0xf100, pattern: 0x9000, definition: SUB },
  { mask: 0xf100, pattern: 0xb000, definition: CMP },
  { mask: 0xf100, pattern: 0xb100, definition: XOR },
  { mask: 0xf100, pattern: 0xc000, definition: AND },
  { mask: 0xf100, pattern: 0x8000, definition: OR },
  { mask: 0xf100, pattern: 0x7000, definition: MOVEQ },
  { mask: 0xf000, pattern: 0x6000, definition: Bcc },
  { mask: 0xc000, pattern: 0x0000, definition: MOVE },
]
