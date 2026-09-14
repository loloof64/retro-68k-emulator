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

// MOVEA isn't a separate opcode encoding on real 68000 hardware — a MOVE
// whose destination mode is "An direct" *is* MOVEA, word-for-word the same
// bit pattern. The only behavioral difference is that it never touches the
// flags (and byte-sized MOVEA is a reserved/invalid encoding). So instead
// of a second table entry, MOVE just special-cases an An destination here.
const MOVEA_DEST_MODE = 0b001

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

    const isMovea = destMode === MOVEA_DEST_MODE
    if (isMovea && size === 'byte') {
      throw new Error('MOVE.B to an address register is a reserved encoding (MOVEA only supports word/long)')
    }

    // Source decoded before destination: extension words (e.g. #imm) follow
    // the opcode word in that same order in memory.
    const src = decodeEA(cpu, memory, srcMode, srcReg, size)
    const dest = decodeEA(cpu, memory, destMode, destReg, size)

    const value = src.read()
    dest.write(value)

    // Real 68000 MOVE: N/Z from the result, V and C always cleared, X
    // unaffected. MOVEA (An destination) affects no flags at all.
    if (!isMovea) {
      updateFlags(cpu, value, size)
      cpu.status.V = false
      cpu.status.C = false
    }

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
      throw new Error(`Unsupported branch condition: ${cc.toString(2)}`)
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

// --- DBRA Dn,<disp> ($51C8-$51CF) - decrement and branch unless -1 ------
//
// Only DBRA (the "always decrement" DBcc, condition code F) is implemented
// — not the full DBcc family (DBEQ, DBNE, ...), which would need the same
// condition-code table as Bcc but over a different truth table (Scc/DBcc
// conditions, not branch conditions). Unlike Bcc, DBcc's displacement is
// always a 16-bit extension word — there's no 8-bit inline form.

const DBRA: OpcodeDefinition = {
  mnemonic: 'DBRA',
  encoding: '0101000111001rrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const reg = (Register.D0 + (opcodeWord & 0b111)) as Register

    // Same "relative to the address of the extension word" base as Bcc.
    const base = cpu.pc
    const displacement = toSigned16(memory.read16(cpu.pc))
    cpu.pc += 2

    const decremented = (readRegister(cpu, reg, 'word') - 1) & 0xffff
    writeRegister(cpu, reg, decremented, 'word')

    if (decremented !== 0xffff) {
      cpu.pc = base + displacement
      return 10
    }

    return 12
  },
}

// --- JSR/BSR/RTS - subroutine control ------------------------------------
//
// All three push/pop a return address on A7, which decodeEA's -(An)/(An)+
// modes already keep long-aligned for A7 (see addressing.ts's stepFor), so
// a plain readRegister/writeRegister pair around a memory.write32/read32 is
// enough — no need to route through decodeEA for the stack slot itself.

// --- JSR <ea> ($4E80) - only (An) indirect supported so far, like decodeEA
// itself (absolute/indexed/PC-relative modes aren't implemented yet).

const JSR: OpcodeDefinition = {
  mnemonic: 'JSR',
  encoding: '0100111010mmmrrr',
  size: 'long',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    if (mode !== 0b010) {
      throw new Error(`JSR only supports (An) addressing so far, got mode ${mode.toString(2)}`)
    }

    const target = readRegister(cpu, (Register.A0 + reg) as Register, 'long')

    const sp = readRegister(cpu, Register.A7, 'long') - 4
    memory.write32(sp, cpu.pc)
    writeRegister(cpu, Register.A7, sp, 'long')

    cpu.pc = target

    return 16
  },
}

// --- BSR <disp> ($6100) - like Bcc's BRA, but pushes the return address --

const BSR: OpcodeDefinition = {
  mnemonic: 'BSR',
  encoding: '01100001dddddddd',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const disp8 = opcodeWord & 0xff

    // Same "relative to the opcode word's address + 2" base as Bcc.
    const base = cpu.pc
    let displacement: number
    if (disp8 === 0x00) {
      displacement = toSigned16(memory.read16(cpu.pc))
      cpu.pc += 2
    } else {
      displacement = toSigned8(disp8)
    }

    const sp = readRegister(cpu, Register.A7, 'long') - 4
    memory.write32(sp, cpu.pc)
    writeRegister(cpu, Register.A7, sp, 'long')

    cpu.pc = base + displacement

    return 18
  },
}

// --- RTS ($4E75) - pop the return address pushed by JSR/BSR --------------

const RTS: OpcodeDefinition = {
  mnemonic: 'RTS',
  encoding: '0100111001110101',
  size: 'long',
  handler: (cpu: CPUState, memory: Memory) => {
    const sp = readRegister(cpu, Register.A7, 'long')
    cpu.pc = memory.read32(sp)
    writeRegister(cpu, Register.A7, sp + 4, 'long')

    return 16
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

// --- MULU/MULS <ea>,Dn ($C0C0/$C1C0) - word x word -> long -------------
//
// Bits 7-6 = 11 is a reserved opmode in the ADD/SUB/CMP/AND/OR/XOR family
// (which only uses 00/01/10 for byte/word/long) — real 68000 repurposes it
// for MUL. Those other opcodes' table entries use a coarser mask that
// wildcards bits 7-6, so MUL/DIV need to be checked first (earlier in
// opcodeTable) or they'd be misrouted to AND/OR's handlers instead.
//
// Only <ea> is read from memory; the other operand is always Dn.W, which
// this also *writes* the full 32-bit product back into.

function decodeMulDiv(cpu: CPUState, memory: Memory, opcodeWord: number) {
  const destReg = (Register.D0 + ((opcodeWord >> 9) & 0b111)) as Register
  const mode = (opcodeWord >> 3) & 0b111
  const reg = opcodeWord & 0b111
  const src = decodeEA(cpu, memory, mode, reg, 'word')
  return { destReg, src }
}

const MULU: OpcodeDefinition = {
  mnemonic: 'MULU',
  encoding: '1100ddd011mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { destReg, src } = decodeMulDiv(cpu, memory, opcodeWordOf(args))

    const srcValue = src.read() & 0xffff
    const destValue = readRegister(cpu, destReg, 'word') & 0xffff
    const result = (srcValue * destValue) >>> 0 // max $FFFE0001, fits in 32 bits unsigned

    writeRegister(cpu, destReg, result, 'long')
    updateFlags(cpu, result, 'long')
    cpu.status.V = false
    cpu.status.C = false

    return 70
  },
}

const MULS: OpcodeDefinition = {
  mnemonic: 'MULS',
  encoding: '1100ddd111mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { destReg, src } = decodeMulDiv(cpu, memory, opcodeWordOf(args))

    const srcValue = toSigned16(src.read() & 0xffff)
    const destValue = toSigned16(readRegister(cpu, destReg, 'word'))
    const result = srcValue * destValue // max magnitude 2^30, well within safe-integer range

    writeRegister(cpu, destReg, result, 'long')
    updateFlags(cpu, result, 'long')
    cpu.status.V = false
    cpu.status.C = false

    return 71
  },
}

// --- DIVU/DIVS <ea>,Dn ($80C0/$81C0) - long / word -> word:word --------
//
// Dn (32-bit dividend) / <ea> (16-bit divisor) -> quotient in Dn's low
// word, remainder in Dn's high word. Real 68000 traps to an exception
// vector on division by zero and leaves Dn untouched (just V set, C
// cleared) when the quotient overflows 16 bits — there's no exception
// system here yet, so divide-by-zero throws instead of trapping.

const DIVU: OpcodeDefinition = {
  mnemonic: 'DIVU',
  encoding: '1000ddd011mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { destReg, src } = decodeMulDiv(cpu, memory, opcodeWordOf(args))

    const divisor = src.read() & 0xffff
    if (divisor === 0) {
      throw new Error('DIVU by zero (divide-by-zero exception not implemented)')
    }

    const dividend = readRegister(cpu, destReg, 'long')
    const quotient = Math.floor(dividend / divisor)
    const remainder = dividend % divisor

    if (quotient > 0xffff) {
      cpu.status.V = true
      cpu.status.C = false
      return 10
    }

    writeRegister(cpu, destReg, ((remainder & 0xffff) << 16) | (quotient & 0xffff), 'long')
    updateFlags(cpu, quotient, 'word')
    cpu.status.V = false
    cpu.status.C = false

    return 138
  },
}

const DIVS: OpcodeDefinition = {
  mnemonic: 'DIVS',
  encoding: '1000ddd111mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { destReg, src } = decodeMulDiv(cpu, memory, opcodeWordOf(args))

    const divisor = toSigned16(src.read() & 0xffff)
    if (divisor === 0) {
      throw new Error('DIVS by zero (divide-by-zero exception not implemented)')
    }

    const dividend = readRegister(cpu, destReg, 'long') | 0 // reinterpret as signed
    const quotient = Math.trunc(dividend / divisor)
    const remainder = dividend % divisor // JS % already follows the dividend's sign, like real DIVS

    if (quotient > 0x7fff || quotient < -0x8000) {
      cpu.status.V = true
      cpu.status.C = false
      return 10
    }

    writeRegister(cpu, destReg, ((remainder & 0xffff) << 16) | (quotient & 0xffff), 'long')
    updateFlags(cpu, quotient, 'word')
    cpu.status.V = false
    cpu.status.C = false

    return 158
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

// --- CLR <ea> ($4200) -----------------------------------------------------

const CLR: OpcodeDefinition = {
  mnemonic: 'CLR',
  encoding: '01000010ssmmmrrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const size = decodeByteWordLongSize((opcodeWord >> 6) & 0b11)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    const ea = decodeEA(cpu, memory, mode, reg, size)
    ea.write(0)

    updateFlags(cpu, 0, size)
    cpu.status.V = false
    cpu.status.C = false

    return 4
  },
}

// --- SWAP Dn ($4840) - swaps the two 16-bit halves of a data register ----

const SWAP: OpcodeDefinition = {
  mnemonic: 'SWAP',
  encoding: '0100100001000rrr',
  size: 'long',
  handler: (cpu: CPUState, _memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const reg = (Register.D0 + (opcodeWord & 0b111)) as Register
    const value = readRegister(cpu, reg, 'long')
    const swapped = ((value << 16) | (value >>> 16)) >>> 0

    writeRegister(cpu, reg, swapped, 'long')
    updateFlags(cpu, swapped, 'long')
    cpu.status.V = false
    cpu.status.C = false

    return 4
  },
}

// --- EXT Dn ($4880 word, $48C0 long) - sign-extend byte->word / word->long

const EXT: OpcodeDefinition = {
  mnemonic: 'EXT',
  encoding: '010010001s000rrr',
  size: 'variable',
  handler: (cpu: CPUState, _memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const reg = (Register.D0 + (opcodeWord & 0b111)) as Register
    const toLong = ((opcodeWord >> 6) & 0b1) === 1

    if (toLong) {
      const value = toSigned16(readRegister(cpu, reg, 'word'))
      writeRegister(cpu, reg, value, 'long')
      updateFlags(cpu, value, 'long')
    } else {
      const value = toSigned8(readRegister(cpu, reg, 'byte'))
      writeRegister(cpu, reg, value, 'word')
      updateFlags(cpu, value, 'word')
    }

    cpu.status.V = false
    cpu.status.C = false

    return 4
  },
}

// --- NEG <ea> ($4400) - dst = 0 - dst, full flags (unlike CLR/NOT) -------

const NEG: OpcodeDefinition = {
  mnemonic: 'NEG',
  encoding: '01000100ssmmmrrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const size = decodeByteWordLongSize((opcodeWord >> 6) & 0b11)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    const ea = decodeEA(cpu, memory, mode, reg, size)
    const { result, flags } = subWithFlags(0, ea.read(), size)
    ea.write(result)

    cpu.status.N = flags.N
    cpu.status.Z = flags.Z
    cpu.status.V = flags.V
    cpu.status.C = flags.C
    cpu.status.X = flags.X

    return 4
  },
}

// --- TST <ea> ($4A00) - like CMP against 0, doesn't write back ------------

const TST: OpcodeDefinition = {
  mnemonic: 'TST',
  encoding: '01001010ssmmmrrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const size = decodeByteWordLongSize((opcodeWord >> 6) & 0b11)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    const ea = decodeEA(cpu, memory, mode, reg, size)

    updateFlags(cpu, ea.read(), size)
    cpu.status.V = false
    cpu.status.C = false

    return 4
  },
}

// --- ASL/ASR/LSL/LSR/ROL/ROR ($E000-$E1FF) - register shifts/rotates ----
//
// Only the register form is implemented (shift/rotate a Dn in place by an
// immediate 1-8 count or a dynamic count from another Dn, mod 64) — the
// $E0C0-family memory-operand form (always a single-bit shift on an <ea>)
// isn't decoded here. ROXL/ROXR (rotate-through-extend, type bits 10) also
// aren't implemented; only ASx/LSx/ROx (type bits 00/01/11).

function maskFor(size: Size): number {
  return size === 'byte' ? 0xff : size === 'word' ? 0xffff : 0xffffffff
}

function signBitFor(size: Size): number {
  return size === 'byte' ? 0x80 : size === 'word' ? 0x8000 : 0x80000000
}

// count/register field (bits 11-9) is either a Dn holding the shift count
// (mod 64) or, in "quick" form, the count itself (1-7, with 0 meaning 8).
function decodeShiftRotate(cpu: CPUState, opcodeWord: number) {
  const countOrReg = (opcodeWord >> 9) & 0b111
  const size = decodeByteWordLongSize((opcodeWord >> 6) & 0b11)
  const isRegisterCount = ((opcodeWord >> 5) & 0b1) === 1
  const reg = (Register.D0 + (opcodeWord & 0b111)) as Register

  const count = isRegisterCount
    ? readRegister(cpu, (Register.D0 + countOrReg) as Register, 'long') % 64
    : countOrReg === 0
      ? 8
      : countOrReg

  return { reg, count, size }
}

// Real 68000: with a dynamic (register-sourced) count of 0, no shift/rotate
// happens at all — C (and V) come out cleared, but X is left untouched.
// That falls out for free from looping `count` times below (0 iterations
// leaves `carry`/`overflow` at their initial `false`); only X's "leave it
// alone when count is 0" needs an explicit check in each handler.

function shiftLeft(value: number, count: number, size: Size, trackOverflow: boolean) {
  const mask = maskFor(size)
  const signBit = signBitFor(size)
  let v = value & mask
  let carry = false
  let overflow = false
  for (let i = 0; i < count; i++) {
    const signBefore = (v & signBit) !== 0
    v = (v << 1) & mask
    carry = signBefore
    if (trackOverflow && signBefore !== ((v & signBit) !== 0)) overflow = true
  }
  return { result: v, carry, overflow }
}

function shiftRight(value: number, count: number, size: Size) {
  const mask = maskFor(size)
  let v = value & mask
  let carry = false
  for (let i = 0; i < count; i++) {
    carry = (v & 1) !== 0
    v = v >>> 1
  }
  return { result: v, carry }
}

// Sign-extending right shift: the same original sign bit is copied back in
// at every step (a negative value's sign never flips mid-shift for ASR).
function arithmeticShiftRight(value: number, count: number, size: Size) {
  const mask = maskFor(size)
  const signBit = signBitFor(size)
  let v = value & mask
  const signSet = (v & signBit) !== 0
  let carry = false
  for (let i = 0; i < count; i++) {
    carry = (v & 1) !== 0
    v = v >>> 1
    if (signSet) v |= signBit
  }
  return { result: v, carry }
}

function rotateLeft(value: number, count: number, size: Size) {
  const mask = maskFor(size)
  const signBit = signBitFor(size)
  let v = value & mask
  let carry = false
  for (let i = 0; i < count; i++) {
    const bitOut = (v & signBit) !== 0
    v = ((v << 1) & mask) | (bitOut ? 1 : 0)
    carry = bitOut
  }
  return { result: v, carry }
}

function rotateRight(value: number, count: number, size: Size) {
  const mask = maskFor(size)
  const signBit = signBitFor(size)
  let v = value & mask
  let carry = false
  for (let i = 0; i < count; i++) {
    const bitOut = (v & 1) !== 0
    v = (v >>> 1) | (bitOut ? signBit : 0)
    carry = bitOut
  }
  return { result: v, carry }
}

const ASL: OpcodeDefinition = {
  mnemonic: 'ASL',
  encoding: '1110ccc1ssi00rrr',
  size: 'variable',
  handler: (cpu: CPUState, _memory: Memory, args: unknown[]) => {
    const { reg, count, size } = decodeShiftRotate(cpu, opcodeWordOf(args))
    const { result, carry, overflow } = shiftLeft(readRegister(cpu, reg, size), count, size, true)

    writeRegister(cpu, reg, result, size)
    updateFlags(cpu, result, size)
    cpu.status.V = overflow
    cpu.status.C = carry
    if (count > 0) cpu.status.X = carry

    return 6 + 2 * count
  },
}

const ASR: OpcodeDefinition = {
  mnemonic: 'ASR',
  encoding: '1110ccc0ssi00rrr',
  size: 'variable',
  handler: (cpu: CPUState, _memory: Memory, args: unknown[]) => {
    const { reg, count, size } = decodeShiftRotate(cpu, opcodeWordOf(args))
    const { result, carry } = arithmeticShiftRight(readRegister(cpu, reg, size), count, size)

    writeRegister(cpu, reg, result, size)
    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = carry
    if (count > 0) cpu.status.X = carry

    return 6 + 2 * count
  },
}

const LSL: OpcodeDefinition = {
  mnemonic: 'LSL',
  encoding: '1110ccc1ssi01rrr',
  size: 'variable',
  handler: (cpu: CPUState, _memory: Memory, args: unknown[]) => {
    const { reg, count, size } = decodeShiftRotate(cpu, opcodeWordOf(args))
    const { result, carry } = shiftLeft(readRegister(cpu, reg, size), count, size, false)

    writeRegister(cpu, reg, result, size)
    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = carry
    if (count > 0) cpu.status.X = carry

    return 6 + 2 * count
  },
}

const LSR: OpcodeDefinition = {
  mnemonic: 'LSR',
  encoding: '1110ccc0ssi01rrr',
  size: 'variable',
  handler: (cpu: CPUState, _memory: Memory, args: unknown[]) => {
    const { reg, count, size } = decodeShiftRotate(cpu, opcodeWordOf(args))
    const { result, carry } = shiftRight(readRegister(cpu, reg, size), count, size)

    writeRegister(cpu, reg, result, size)
    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = carry
    if (count > 0) cpu.status.X = carry

    return 6 + 2 * count
  },
}

const ROL: OpcodeDefinition = {
  mnemonic: 'ROL',
  encoding: '1110ccc1ssi11rrr',
  size: 'variable',
  handler: (cpu: CPUState, _memory: Memory, args: unknown[]) => {
    const { reg, count, size } = decodeShiftRotate(cpu, opcodeWordOf(args))
    const { result, carry } = rotateLeft(readRegister(cpu, reg, size), count, size)

    writeRegister(cpu, reg, result, size)
    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = carry
    // Real 68000: ROL/ROR never touch X, unlike the shift instructions.

    return 6 + 2 * count
  },
}

const ROR: OpcodeDefinition = {
  mnemonic: 'ROR',
  encoding: '1110ccc0ssi11rrr',
  size: 'variable',
  handler: (cpu: CPUState, _memory: Memory, args: unknown[]) => {
    const { reg, count, size } = decodeShiftRotate(cpu, opcodeWordOf(args))
    const { result, carry } = rotateRight(readRegister(cpu, reg, size), count, size)

    writeRegister(cpu, reg, result, size)
    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = carry

    return 6 + 2 * count
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
  { mask: 0xff00, pattern: 0x4200, definition: CLR },
  { mask: 0xff00, pattern: 0x4400, definition: NEG },
  { mask: 0xff00, pattern: 0x4a00, definition: TST },
  { mask: 0xfff8, pattern: 0x4840, definition: SWAP },
  { mask: 0xffb8, pattern: 0x4880, definition: EXT },
  { mask: 0xffff, pattern: 0x4e75, definition: RTS },
  { mask: 0xffc0, pattern: 0x4e80, definition: JSR },
  { mask: 0xf118, pattern: 0xe100, definition: ASL },
  { mask: 0xf118, pattern: 0xe000, definition: ASR },
  { mask: 0xf118, pattern: 0xe108, definition: LSL },
  { mask: 0xf118, pattern: 0xe008, definition: LSR },
  { mask: 0xf118, pattern: 0xe118, definition: ROL },
  { mask: 0xf118, pattern: 0xe018, definition: ROR },
  { mask: 0xf100, pattern: 0xd000, definition: ADD },
  { mask: 0xf100, pattern: 0x9000, definition: SUB },
  { mask: 0xf100, pattern: 0xb000, definition: CMP },
  { mask: 0xf100, pattern: 0xb100, definition: XOR },
  { mask: 0xf1c0, pattern: 0xc0c0, definition: MULU },
  { mask: 0xf1c0, pattern: 0xc1c0, definition: MULS },
  { mask: 0xf1c0, pattern: 0x80c0, definition: DIVU },
  { mask: 0xf1c0, pattern: 0x81c0, definition: DIVS },
  { mask: 0xf100, pattern: 0xc000, definition: AND },
  { mask: 0xf100, pattern: 0x8000, definition: OR },
  { mask: 0xf100, pattern: 0x7000, definition: MOVEQ },
  { mask: 0xff00, pattern: 0x6100, definition: BSR },
  { mask: 0xf000, pattern: 0x6000, definition: Bcc },
  { mask: 0xfff8, pattern: 0x51c8, definition: DBRA },
  { mask: 0xc000, pattern: 0x0000, definition: MOVE },
]
