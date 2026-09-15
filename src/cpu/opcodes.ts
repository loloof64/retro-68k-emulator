import { Register, type CPUState, type Memory, type OpcodeDefinition, type StatusFlags } from '../types/cpu'
import type { OpcodeEntry } from './index'
import { readRegister, updateFlags, writeRegister } from './index'
import { decodeEA, decodeControlAddress, type Size } from './addressing'
import { addWithFlags, subWithFlags } from './arithmetic'
import {
  ILLEGAL_INSTRUCTION_VECTOR,
  INPUT_START,
  SOUND_DURATION,
  SOUND_FREQUENCY,
  SOUND_TRIGGER,
  SOUND_VOLUME,
  SOUND_WAVEFORM,
  ZERO_DIVIDE_VECTOR,
} from '../memory'

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

// --- CPU-raised exceptions (as opposed to explicit TRAP #n calls) -------
//
// Real 68000: an exception pushes the status register and PC onto the
// *supervisor* stack, then jumps through a vector in low memory. This
// emulator has no SR/supervisor-mode concept, so — like JSR — only PC is
// pushed, onto the one stack there is (A7). A handler routine is expected
// to end with RTS (there's no RTE) to match. See src/memory/index.ts for
// the vector table layout (ZERO_DIVIDE_VECTOR, ILLEGAL_INSTRUCTION_VECTOR).
//
// Only for encodings that are genuinely reserved/invalid on real 68000
// hardware (e.g. MOVE.B to An) or runtime faults (zero divide) — never as
// a stand-in for "this addressing mode/opcode isn't implemented here yet,"
// which would run fine on real silicon and has nothing to do with the
// CPU's actual exception model.

function raiseException(cpu: CPUState, memory: Memory, vectorAddress: number, name: string): void {
  const handlerAddress = memory.read32(vectorAddress)
  if (handlerAddress === 0) {
    throw new Error(
      `${name} exception: no handler installed at vector $${vectorAddress.toString(16)} ` +
        '(write a handler routine\'s address there before this can happen)'
    )
  }

  const sp = readRegister(cpu, Register.A7, 'long') - 4
  memory.write32(sp, cpu.pc)
  writeRegister(cpu, Register.A7, sp, 'long')

  cpu.pc = handlerAddress
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
      // Reserved encoding on real hardware (MOVEA only supports word/long).
      raiseException(cpu, memory, ILLEGAL_INSTRUCTION_VECTOR, 'Illegal Instruction')
      return 34
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

// --- ADDQ/SUBQ #data,<ea> ($5000-$5FFE, bit8=0 ADDQ/1 SUBQ) -------------
//
// Adds/subtracts a small immediate (1-8, encoded in 3 bits with 0 = 8)
// straight into <ea> — no extension word for the operand, unlike ADD/SUB's
// #imm form. `<ea>` = `An` is a hardware special case: always a full
// 32-bit op regardless of the size field, and it touches no flags — the
// same rule MOVEA/ADDA/SUBA already follow, so it's handled separately
// here rather than routed through decodeEA/addWithFlags like every other
// destination.
//
// Shares its `ss=11` subspace with Scc/DBcc ($50C0-$5FFE) the same way
// PEA shares SWAP's opcode: `ss=11` isn't a valid ADDQ/SUBQ size, so
// Scc/DBcc's narrower, already-earlier opcodeTable entries have to keep
// matching first for that reserved combination to resolve correctly.

function decodeQuickData(bits: number): number {
  return bits === 0 ? 8 : bits
}

function addqSubqHandler(sign: 1 | -1): OpcodeDefinition['handler'] {
  return (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const data = decodeQuickData((opcodeWord >> 9) & 0b111)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    if (mode === 0b001) {
      const addrReg = (Register.A0 + reg) as Register
      const current = readRegister(cpu, addrReg, 'long')
      writeRegister(cpu, addrReg, current + sign * data, 'long')
      return 8
    }

    const size = decodeByteWordLongSize((opcodeWord >> 6) & 0b11)
    const ea = decodeEA(cpu, memory, mode, reg, size)
    const { result, flags } =
      sign === 1 ? addWithFlags(ea.read(), data, size) : subWithFlags(ea.read(), data, size)
    ea.write(result)

    cpu.status.N = flags.N
    cpu.status.Z = flags.Z
    cpu.status.V = flags.V
    cpu.status.C = flags.C
    cpu.status.X = flags.X

    return 4
  }
}

const ADDQ: OpcodeDefinition = {
  mnemonic: 'ADDQ',
  encoding: '0101ddd0ssmmmrrr',
  size: 'variable',
  handler: addqSubqHandler(1),
}

const SUBQ: OpcodeDefinition = {
  mnemonic: 'SUBQ',
  encoding: '0101ddd1ssmmmrrr',
  size: 'variable',
  handler: addqSubqHandler(-1),
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

// This is the 68000's one shared 16-entry condition-code table — Bcc uses
// it directly ("branch if true"), and DBcc reuses the exact same table
// ("stop looping if true"). cc=0b0001 is never reached via Bcc (that
// opcode slot is BSR, matched first in opcodeTable), but DBcc does use it:
// it's "F" (always false), the condition behind DBRA/DBF.
function branchConditionTrue(cc: number, status: StatusFlags): boolean {
  switch (cc) {
    case 0b0000:
      return true // BRA / DBT
    case 0b0001:
      return false // DBF / DBRA
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

// --- DBcc Dn,<disp> ($50C8-$5FC8, low 3 bits = Dn) ----------------------
//
// Full conditional family (DBT, DBF/DBRA, DBHI, DBLS, DBCC, DBCS, DBNE,
// DBEQ, DBVC, DBVS, DBPL, DBMI, DBGE, DBLT, DBGT, DBLE), sharing Bcc's
// condition-code table. Unlike Bcc, the displacement is always a 16-bit
// extension word — there's no 8-bit inline form — and the condition means
// something different: if cc is already true, the loop stops immediately
// (Dn is *not* decremented); only when cc is false does Dn get decremented
// and the branch considered, same as DBRA's "decrement unless -1" always
// did (DBRA is cc=F, always false, so it always decrements).

const DBcc: OpcodeDefinition = {
  mnemonic: 'DBcc',
  encoding: '0101cccc11001rrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const cc = (opcodeWord >> 8) & 0xf
    const reg = (Register.D0 + (opcodeWord & 0b111)) as Register

    // Same "relative to the address of the extension word" base as Bcc.
    const base = cpu.pc
    const displacement = toSigned16(memory.read16(cpu.pc))
    cpu.pc += 2

    if (branchConditionTrue(cc, cpu.status)) {
      return 12 // condition already true: loop stops, Dn untouched
    }

    const decremented = (readRegister(cpu, reg, 'word') - 1) & 0xffff
    writeRegister(cpu, reg, decremented, 'word')

    if (decremented !== 0xffff) {
      cpu.pc = base + displacement
      return 10
    }

    return 14 // counter reached -1: loop stops without branching
  },
}

// --- Scc <ea> ($50C0-$5FFE, mode=001 excluded — that's DBcc) ------------
//
// Sets the byte destination to all 1s if condition cc is true, all 0s
// otherwise — no arithmetic, no flags touched. Shares Bcc/DBcc's
// condition-code table (branchConditionTrue) and, at the bit level, DBcc's
// $50C0-$5FFE range: DBcc claims mode=001 (An) as its own marker within
// that space (An isn't a valid Scc destination anyway), so DBcc's
// opcodeTable entry — narrower and listed first — has to keep matching
// before Scc's broader one for that one mode to resolve correctly.
// Destination is any data-alterable <ea>: Dn or writable memory, not An,
// not #imm, not PC-relative — decodeEA already throws on write() for the
// two modes it can't write to, so those get rejected without an extra
// check here.

const Scc: OpcodeDefinition = {
  mnemonic: 'Scc',
  encoding: '0101cccc11mmmrrr',
  size: 'byte',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const cc = (opcodeWord >> 8) & 0xf
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    const dest = decodeEA(cpu, memory, mode, reg, 'byte')
    const isTrue = branchConditionTrue(cc, cpu.status)
    dest.write(isTrue ? 0xff : 0x00)

    // Real 68000: Dn destination costs less, and less still if cc turned
    // out false (no visible-write cycle for the unaffected byte). Memory
    // destinations are a flat cost regardless of cc.
    if (mode === 0b000) return isTrue ? 6 : 4
    return 8
  },
}

// --- LEA <ea>,An ($41C0-$4FFE) - control addressing modes only, same set
// decodeControlAddress validates. Loads the *address* itself into An —
// same reason JSR needs decodeControlAddress rather than decodeEA: an
// address is what's wanted, not a value read through it.

const LEA: OpcodeDefinition = {
  mnemonic: 'LEA',
  encoding: '0100aaa111mmmrrr',
  size: 'long',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const destReg = (Register.A0 + ((opcodeWord >> 9) & 0b111)) as Register
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    const address = decodeControlAddress(cpu, memory, mode, reg)
    writeRegister(cpu, destReg, address, 'long')

    return 4
  },
}

// --- PEA <ea> ($4840-$4FFE, mode=000 excluded — that's SWAP) ------------
//
// Pushes the address <ea> names onto the stack (A7 -= 4) — like LEA, but
// to the stack instead of An. Shares SWAP's $4840 opcode at the bit
// level: mode=000 (Dn) isn't a valid PEA destination anyway (same as
// DBcc/Scc's mode=001 split), so SWAP's narrower, more specific
// opcodeTable entry has to stay listed before PEA's broader one for that
// mode to keep resolving to SWAP.

const PEA: OpcodeDefinition = {
  mnemonic: 'PEA',
  encoding: '0100100001mmmrrr',
  size: 'long',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    const address = decodeControlAddress(cpu, memory, mode, reg)

    const sp = readRegister(cpu, Register.A7, 'long') - 4
    memory.write32(sp, address)
    writeRegister(cpu, Register.A7, sp, 'long')

    return 12
  },
}

// --- JSR/BSR/RTS - subroutine control ------------------------------------
//
// All three push/pop a return address on A7, which decodeEA's -(An)/(An)+
// modes already keep long-aligned for A7 (see addressing.ts's stepFor), so
// a plain readRegister/writeRegister pair around a memory.write32/read32 is
// enough — no need to route through decodeEA for the stack slot itself.

// --- JSR <ea> ($4E80) - control addressing modes only: (An), d16(An),
// d8(An,Xn), xxx.W, xxx.L, d16(PC), d8(PC,Xn) - same set decodeControlAddress
// validates (no Dn/An direct, no (An)+/-(An), no #imm).

const JSR: OpcodeDefinition = {
  mnemonic: 'JSR',
  encoding: '0100111010mmmrrr',
  size: 'long',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    const target = decodeControlAddress(cpu, memory, mode, reg)

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
      // An isn't a valid <ea> for BTST on real hardware (Dn tests as a
      // long, memory as a byte — An direct isn't defined either way).
      raiseException(cpu, memory, ILLEGAL_INSTRUCTION_VECTOR, 'Illegal Instruction')
      return 34
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
// vector on division by zero, and leaves Dn untouched (just V set, C
// cleared) when the quotient overflows 16 bits.

const DIVU: OpcodeDefinition = {
  mnemonic: 'DIVU',
  encoding: '1000ddd011mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { destReg, src } = decodeMulDiv(cpu, memory, opcodeWordOf(args))

    const divisor = src.read() & 0xffff
    if (divisor === 0) {
      raiseException(cpu, memory, ZERO_DIVIDE_VECTOR, 'Zero Divide')
      return 38
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
      raiseException(cpu, memory, ZERO_DIVIDE_VECTOR, 'Zero Divide')
      return 38
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

// --- MOVEM <register list>,<ea> / <ea>,<register list> ($4880-$4CFF) ----
//
// Moves any subset of the 16 registers to/from memory in one instruction,
// driven by a 16-bit register-list mask that's its own extension word
// right after the opcode word — read *before* any <ea> extension word
// (a d16 displacement, an absolute address, ...) that decodeControlAddress
// below might still need, since real hardware always reads it first.
//
// Two real-68000 quirks this has to reproduce:
// - The list is bit0=D0..bit7=D7,bit8=A0..bit15=A7 for every addressing
//   mode *except* predecrement (`-(An)`), where it's reversed:
//   bit0=A7..bit7=A0,bit8=D7..bit15=D0. Predecrement stores backward
//   through memory as it decrements An, so listing the *last*-stored
//   register (A7) at bit0 is what makes a later, forward re-read (e.g. the
//   matching postincrement MOVEM restoring these registers) come back out
//   in D0..A7 order.
// - Loading (memory-to-register) at word size sign-extends each 16-bit
//   value into the full 32-bit register, unlike a plain word MOVE (which
//   only overwrites the low word). Storing at word size just truncates —
//   no extension needed, since only the low word is written out.
//
// Addressing modes split by direction: register-to-memory allows the
// control modes (see decodeControlAddress) plus predecrement; memory-to-
// register allows the control modes plus postincrement. Dn/An direct and
// #imm are invalid either way (reserved encodings) — decodeControlAddress
// already rejects those. mode=000 (Dn) with the register-to-memory
// direction bit also doubles as EXT's opcode: the exact SWAP/PEA and
// DBcc/Scc situation, so EXT's narrower, already-earlier opcodeTable entry
// has to keep matching first for that one mode.

const MOVEM_ORDER: readonly Register[] = [
  Register.D0,
  Register.D1,
  Register.D2,
  Register.D3,
  Register.D4,
  Register.D5,
  Register.D6,
  Register.D7,
  Register.A0,
  Register.A1,
  Register.A2,
  Register.A3,
  Register.A4,
  Register.A5,
  Register.A6,
  Register.A7,
]

const MOVEM: OpcodeDefinition = {
  mnemonic: 'MOVEM',
  encoding: '01001d001smmmrrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const loadToRegisters = ((opcodeWord >> 10) & 1) === 1
    const size: Size = ((opcodeWord >> 6) & 1) === 1 ? 'long' : 'word'
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111
    const step = size === 'long' ? 4 : 2
    const cyclesPerReg = size === 'long' ? 8 : 4

    const mask = memory.read16(cpu.pc)
    cpu.pc += 2

    if (mode === 0b100) {
      if (loadToRegisters) {
        throw new Error('MOVEM memory-to-register does not support predecrement addressing')
      }

      const addrReg = (Register.A0 + reg) as Register
      let address = readRegister(cpu, addrReg, 'long')
      let count = 0
      for (let bit = 0; bit < 16; bit++) {
        if (((mask >> bit) & 1) === 0) continue
        address -= step
        const value = readRegister(cpu, MOVEM_ORDER[15 - bit], size)
        if (size === 'long') memory.write32(address, value)
        else memory.write16(address, value)
        count++
      }
      writeRegister(cpu, addrReg, address, 'long')

      return 8 + cyclesPerReg * count
    }

    if (mode === 0b011 && !loadToRegisters) {
      throw new Error('MOVEM register-to-memory does not support postincrement addressing')
    }

    let address: number
    let addrRegToWriteBack: Register | null = null
    if (mode === 0b011) {
      addrRegToWriteBack = (Register.A0 + reg) as Register
      address = readRegister(cpu, addrRegToWriteBack, 'long')
    } else {
      address = decodeControlAddress(cpu, memory, mode, reg)
    }

    let count = 0
    for (let bit = 0; bit < 16; bit++) {
      if (((mask >> bit) & 1) === 0) continue
      const targetReg = MOVEM_ORDER[bit]
      if (loadToRegisters) {
        const raw = size === 'long' ? memory.read32(address) : memory.read16(address)
        writeRegister(cpu, targetReg, size === 'word' ? toSigned16(raw) : raw, 'long')
      } else if (size === 'long') {
        memory.write32(address, readRegister(cpu, targetReg, 'long'))
      } else {
        memory.write16(address, readRegister(cpu, targetReg, 'word'))
      }
      address += step
      count++
    }
    if (addrRegToWriteBack !== null) writeRegister(cpu, addrRegToWriteBack, address, 'long')

    return (loadToRegisters ? 12 : 8) + cyclesPerReg * count
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

// --- ASL/ASR/LSL/LSR/ROL/ROR/ROXL/ROXR ($E000-$E1FF) - register form ----
//
// Shifts/rotates a Dn in place by an immediate 1-8 count or a dynamic
// count from another Dn, mod 64. The $E0C0-family memory-operand form
// (always a single-bit shift/rotate on an <ea>) is decoded separately,
// further down this file, right after ROXR_MEM.

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

// ROXL/ROXR rotate *through* X: the extend bit is part of the rotation
// (an N+1-bit rotate, not an N-bit one) — the bit shifted out becomes the
// new X, and the bit shifted *in* is whatever X held before this step,
// not the bit that just came out the other end like a plain ROL/ROR.
// Threading `x` through the loop like this also gets the "zero count"
// case right for free: with 0 iterations, the returned `x` is just the
// `xIn` the caller passed in — which is exactly correct, since real
// 68000 ROXL/ROXR always sets C to X's (possibly unchanged) value, even
// when the count is 0, unlike every other shift/rotate here where a
// zero count leaves both flags alone (LSx/ASx) or just clears C (ROx).
function rotateLeftExtend(value: number, count: number, size: Size, xIn: boolean) {
  const mask = maskFor(size)
  const signBit = signBitFor(size)
  let v = value & mask
  let x = xIn
  for (let i = 0; i < count; i++) {
    const bitOut = (v & signBit) !== 0
    v = ((v << 1) & mask) | (x ? 1 : 0)
    x = bitOut
  }
  return { result: v, x }
}

function rotateRightExtend(value: number, count: number, size: Size, xIn: boolean) {
  const mask = maskFor(size)
  const signBit = signBitFor(size)
  let v = value & mask
  let x = xIn
  for (let i = 0; i < count; i++) {
    const bitOut = (v & 1) !== 0
    v = (v >>> 1) | (x ? signBit : 0)
    x = bitOut
  }
  return { result: v, x }
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

// --- ROXL/ROXR Dn ($E110/$E010) - rotate *through* the X flag -----------
//
// Like ROL/ROR, but the rotation includes X as an extra bit: the bit
// shifted out becomes the new X (and C — the two always end up equal
// here), and the bit shifted in is the *old* X, not a wraparound of the
// bit that just left. Shares the register-form's count/size encoding
// (immediate 1-8, or dynamic from a Dn mod 64) with the rest of this
// family — see decodeShiftRotate above.

const ROXL: OpcodeDefinition = {
  mnemonic: 'ROXL',
  encoding: '1110ccc1ssi10rrr',
  size: 'variable',
  handler: (cpu: CPUState, _memory: Memory, args: unknown[]) => {
    const { reg, count, size } = decodeShiftRotate(cpu, opcodeWordOf(args))
    const { result, x } = rotateLeftExtend(readRegister(cpu, reg, size), count, size, cpu.status.X)

    writeRegister(cpu, reg, result, size)
    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = x
    cpu.status.X = x

    return 6 + 2 * count
  },
}

const ROXR: OpcodeDefinition = {
  mnemonic: 'ROXR',
  encoding: '1110ccc0ssi10rrr',
  size: 'variable',
  handler: (cpu: CPUState, _memory: Memory, args: unknown[]) => {
    const { reg, count, size } = decodeShiftRotate(cpu, opcodeWordOf(args))
    const { result, x } = rotateRightExtend(readRegister(cpu, reg, size), count, size, cpu.status.X)

    writeRegister(cpu, reg, result, size)
    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = x
    cpu.status.X = x

    return 6 + 2 * count
  },
}

// --- ASL/ASR/LSL/LSR/ROL/ROR <ea> ($E0C0-$E7FE) - memory-operand form ---
//
// The register form above only shifts/rotates a Dn in place, by a count of
// 1-8 (or a dynamic count from another Dn). The 68000 also has a second,
// distinct form that operates directly on a memory <ea> instead — always
// exactly a *single* bit, word-sized only (there's no count field or size
// field left to encode anything else with).
//
// It reuses the register form's opcode space at the bit level: bits 7-6
// (the register form's size field) only ever take 00/01/10 there —
// decodeByteWordLongSize throws on 11 — and this form sets exactly that
// otherwise-reserved 11 to mean "memory-operand form" instead, with bits
// 11-9 (the register form's count/register field) repurposed as padding
// and bits 4-3 (the register form's type field) moved to bits 10-9. That
// makes this form's opcodeTable entries far more specific (mask 0xffc0,
// vs the register form's 0xf118) — so, same trick as EXT/MOVEM and
// SWAP/PEA, they have to be listed *before* the six register-form entries
// for that reserved size value to resolve here instead.
//
// Valid <ea>: the "memory alterable" modes — anything except `Dn`, `An`,
// `#imm`, and PC-relative. `Dn`/`An` are a genuinely reserved encoding
// here (the register form is what shifts a `Dn`, and there's no such
// thing as shifting an address register), so they're rejected the same
// way MOVEA's byte-size or BTST's `An` destination are — decodeEA can't
// catch `An` on its own since, unlike the PC-relative modes, it's a
// perfectly normal writable destination for every *other* instruction.
// `#imm`/PC-relative fall through to decodeEA's own write()-throws, same
// as every other memory-alterable instruction in this file.

function decodeMemAlterableEA(cpu: CPUState, memory: Memory, mode: number, reg: number) {
  if (mode === 0b000 || mode === 0b001) {
    raiseException(cpu, memory, ILLEGAL_INSTRUCTION_VECTOR, 'Illegal Instruction')
    return null
  }
  return decodeEA(cpu, memory, mode, reg, 'word')
}

const ASL_MEM: OpcodeDefinition = {
  mnemonic: 'ASL',
  encoding: '1110000111mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const ea = decodeMemAlterableEA(cpu, memory, (opcodeWord >> 3) & 0b111, opcodeWord & 0b111)
    if (!ea) return 34

    const { result, carry, overflow } = shiftLeft(ea.read(), 1, 'word', true)
    ea.write(result)

    updateFlags(cpu, result, 'word')
    cpu.status.V = overflow
    cpu.status.C = carry
    cpu.status.X = carry

    return 8
  },
}

const ASR_MEM: OpcodeDefinition = {
  mnemonic: 'ASR',
  encoding: '1110000011mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const ea = decodeMemAlterableEA(cpu, memory, (opcodeWord >> 3) & 0b111, opcodeWord & 0b111)
    if (!ea) return 34

    const { result, carry } = arithmeticShiftRight(ea.read(), 1, 'word')
    ea.write(result)

    updateFlags(cpu, result, 'word')
    cpu.status.V = false
    cpu.status.C = carry
    cpu.status.X = carry

    return 8
  },
}

const LSL_MEM: OpcodeDefinition = {
  mnemonic: 'LSL',
  encoding: '1110001111mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const ea = decodeMemAlterableEA(cpu, memory, (opcodeWord >> 3) & 0b111, opcodeWord & 0b111)
    if (!ea) return 34

    const { result, carry } = shiftLeft(ea.read(), 1, 'word', false)
    ea.write(result)

    updateFlags(cpu, result, 'word')
    cpu.status.V = false
    cpu.status.C = carry
    cpu.status.X = carry

    return 8
  },
}

const LSR_MEM: OpcodeDefinition = {
  mnemonic: 'LSR',
  encoding: '1110001011mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const ea = decodeMemAlterableEA(cpu, memory, (opcodeWord >> 3) & 0b111, opcodeWord & 0b111)
    if (!ea) return 34

    const { result, carry } = shiftRight(ea.read(), 1, 'word')
    ea.write(result)

    updateFlags(cpu, result, 'word')
    cpu.status.V = false
    cpu.status.C = carry
    cpu.status.X = carry

    return 8
  },
}

const ROL_MEM: OpcodeDefinition = {
  mnemonic: 'ROL',
  encoding: '1110011111mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const ea = decodeMemAlterableEA(cpu, memory, (opcodeWord >> 3) & 0b111, opcodeWord & 0b111)
    if (!ea) return 34

    const { result, carry } = rotateLeft(ea.read(), 1, 'word')
    ea.write(result)

    updateFlags(cpu, result, 'word')
    cpu.status.V = false
    cpu.status.C = carry
    // Real 68000: ROL/ROR never touch X, unlike the shift instructions.

    return 8
  },
}

const ROR_MEM: OpcodeDefinition = {
  mnemonic: 'ROR',
  encoding: '1110011011mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const ea = decodeMemAlterableEA(cpu, memory, (opcodeWord >> 3) & 0b111, opcodeWord & 0b111)
    if (!ea) return 34

    const { result, carry } = rotateRight(ea.read(), 1, 'word')
    ea.write(result)

    updateFlags(cpu, result, 'word')
    cpu.status.V = false
    cpu.status.C = carry

    return 8
  },
}

// --- ROXL/ROXR <ea> ($E4C0/$E5C0) - rotate-through-X, memory form -------

const ROXL_MEM: OpcodeDefinition = {
  mnemonic: 'ROXL',
  encoding: '1110010111mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const ea = decodeMemAlterableEA(cpu, memory, (opcodeWord >> 3) & 0b111, opcodeWord & 0b111)
    if (!ea) return 34

    const { result, x } = rotateLeftExtend(ea.read(), 1, 'word', cpu.status.X)
    ea.write(result)

    updateFlags(cpu, result, 'word')
    cpu.status.V = false
    cpu.status.C = x
    cpu.status.X = x

    return 8
  },
}

const ROXR_MEM: OpcodeDefinition = {
  mnemonic: 'ROXR',
  encoding: '1110010011mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const ea = decodeMemAlterableEA(cpu, memory, (opcodeWord >> 3) & 0b111, opcodeWord & 0b111)
    if (!ea) return 34

    const { result, x } = rotateRightExtend(ea.read(), 1, 'word', cpu.status.X)
    ea.write(result)

    updateFlags(cpu, result, 'word')
    cpu.status.V = false
    cpu.status.C = x
    cpu.status.X = x

    return 8
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
  { mask: 0xffc0, pattern: 0x4840, definition: PEA },
  { mask: 0xffb8, pattern: 0x4880, definition: EXT },
  { mask: 0xfb80, pattern: 0x4880, definition: MOVEM },
  { mask: 0xffff, pattern: 0x4e75, definition: RTS },
  { mask: 0xffc0, pattern: 0x4e80, definition: JSR },
  { mask: 0xf1c0, pattern: 0x41c0, definition: LEA },
  { mask: 0xffc0, pattern: 0xe1c0, definition: ASL_MEM },
  { mask: 0xffc0, pattern: 0xe0c0, definition: ASR_MEM },
  { mask: 0xffc0, pattern: 0xe3c0, definition: LSL_MEM },
  { mask: 0xffc0, pattern: 0xe2c0, definition: LSR_MEM },
  { mask: 0xffc0, pattern: 0xe7c0, definition: ROL_MEM },
  { mask: 0xffc0, pattern: 0xe6c0, definition: ROR_MEM },
  { mask: 0xffc0, pattern: 0xe5c0, definition: ROXL_MEM },
  { mask: 0xffc0, pattern: 0xe4c0, definition: ROXR_MEM },
  { mask: 0xf118, pattern: 0xe100, definition: ASL },
  { mask: 0xf118, pattern: 0xe000, definition: ASR },
  { mask: 0xf118, pattern: 0xe108, definition: LSL },
  { mask: 0xf118, pattern: 0xe008, definition: LSR },
  { mask: 0xf118, pattern: 0xe118, definition: ROL },
  { mask: 0xf118, pattern: 0xe018, definition: ROR },
  { mask: 0xf118, pattern: 0xe110, definition: ROXL },
  { mask: 0xf118, pattern: 0xe010, definition: ROXR },
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
  { mask: 0xf0f8, pattern: 0x50c8, definition: DBcc },
  { mask: 0xf0c0, pattern: 0x50c0, definition: Scc },
  { mask: 0xf100, pattern: 0x5000, definition: ADDQ },
  { mask: 0xf100, pattern: 0x5100, definition: SUBQ },
  { mask: 0xc000, pattern: 0x0000, definition: MOVE },
]
