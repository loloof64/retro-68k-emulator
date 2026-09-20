import { drawString } from '../graphics/font'
import { Register, type CPUState, type Memory, type OpcodeDefinition, type StatusFlags } from '../types/cpu'
import type { OpcodeEntry } from './index'
import { readRegister, updateFlags, writeRegister } from './index'
import { encodeEA, immWords, isControl, isDataAlterable, isMemory, sizeBits } from '../assembler/encodeEA'
import { decodeEA, decodeControlAddress, type Size } from './addressing'
import { addWithFlags, subWithFlags, type ArithmeticFlags } from './arithmetic'
import {
  CHK_VECTOR,
  FRAMEBUFFER_BYTES_PER_PIXEL,
  FRAMEBUFFER_END,
  FRAMEBUFFER_START,
  ILLEGAL_INSTRUCTION_VECTOR,
  INPUT_START,
  SOUND_DURATION,
  SOUND_FREQUENCY,
  SOUND_TRIGGER,
  SOUND_VOLUME,
  SOUND_WAVEFORM,
  TRAPV_VECTOR,
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
  encode: (ops) => (ops.length === 0 ? [0x4e71] : null),
  handler: () => 4,
}

// --- MOVE (bits 15-14 = 00, size in bits 13-12: 1=byte 3=word 2=long) ---

function decodeMoveSize(bits: number): Size {
  if (bits === 0b01) return 'byte'
  if (bits === 0b11) return 'word'
  if (bits === 0b10) return 'long'
  throw new Error(`Invalid MOVE size bits: ${bits.toString(2)}`)
}

// <ea>,Dn form shared by ADD/SUB/CMP.
function eaToDn(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 2 || ops[1].kind !== 'dn') return null
    if (size === 'byte' && ops[0].kind === 'an') return null
    const src = encodeEA(ops[0], size, ctx)
    return [base | (ops[1].n << 9) | (sizeBits(size) << 6) | src.field, ...src.ext]
  }
}

// Dn,<ea> form shared by ADD/SUB (memory destinations only).
function dnToMem(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 2 || ops[0].kind !== 'dn' || !isMemory(ops[1])) return null
    const dst = encodeEA(ops[1], size, ctx)
    return [base | 0x100 | (ops[0].n << 9) | (sizeBits(size) << 6) | dst.field, ...dst.ext]
  }
}

// <ea>,An form shared by ADDA/SUBA/CMPA.
function eaToAn(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 2 || ops[1].kind !== 'an' || size === 'byte') return null
    const src = encodeEA(ops[0], size, ctx)
    return [base | (ops[1].n << 9) | (size === 'long' ? 0x1c0 : 0xc0) | src.field, ...src.ext]
  }
}

// #imm,<ea> form shared by ADDI/SUBI/CMPI.
function immToEa(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 2 || ops[0].kind !== 'imm' || !isDataAlterable(ops[1])) return null
    const dst = encodeEA(ops[1], size, ctx)
    const imm = encodeEA(ops[0], size, ctx)
    return [base | (sizeBits(size) << 6) | dst.field, ...imm.ext, ...dst.ext]
  }
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
  encode: (ops, size, ctx) => {
    if (ops.length !== 2 || ops[1].kind === 'imm') return null
    if (size === 'byte' && (ops[0].kind === 'an' || ops[1].kind === 'an')) return null
    const src = encodeEA(ops[0], size, ctx)
    const dst = encodeEA(ops[1], size, ctx)
    const sizeField = size === 'byte' ? 0b01 : size === 'word' ? 0b11 : 0b10
    const word =
      (sizeField << 12) | ((dst.field & 7) << 9) | ((dst.field >> 3) << 6) | src.field
    return [word, ...src.ext, ...dst.ext]
  },
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
  encode: eaToDn(0xd000),
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
  encode: eaToDn(0x9000),
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

// --- ABCD/SBCD Dy,Dx / -(Ay),-(Ax) ($C100-$C1F8 / $8100-$81F8) ----------
//
// Packed-BCD add/subtract with extend: two decimal digits per byte (a
// "hundreds" nibble and a "tens" nibble aren't a thing here — just two
// 0-9 digits packed high/low), used to build decimal arithmetic wider
// than one byte by chaining bytes together through the X flag exactly
// like ADDX/SUBX would for binary. Register form operates on `Dy`/`Dx`
// directly; the `-(Ay),-(Ax)` memory form predecrements *two* address
// registers, source before destination (same "source before
// destination" order `decodeEaAndDest` documents), so a chain reads
// backward through memory the same way `MOVEM`'s predecrement store
// does. Bit 8 is fixed at `1` in both encodings, which is exactly what
// keeps this family from ever colliding with `AND`/`OR`/`MULU`/`MULS`/
// `DIVU`/`DIVS`'s own reserved-opmode slots in the same `$C000`/`$8000`
// nibble - those all require bit 8 clear, so no opcodeTable-ordering
// trick is needed here despite living in the same top nibble.
//
// Flags follow the real (undefined-flag-heavy) 68000 definition rather
// than this codebase's usual "compute N from the sign bit" default: `N`
// and `V` are genuinely undefined on real hardware for a BCD result (a
// packed-decimal byte's bit 7 isn't a sign bit), so - same principle
// `CHK` established for its own undefined flags - they're simply left
// untouched. `Z` has its own unusual rule too: cleared if the result is
// non-zero, *left alone* if it's zero - not a plain assignment - so a
// multi-byte chain can clear `Z` once up front and have it read true at
// the end only if every byte came out zero.

function bcdAdd(src: number, dst: number, x: number): { result: number; carry: number } {
  let sum = src + dst + x
  if (((src & 0x0f) + (dst & 0x0f) + x) > 9) sum += 6
  let carry = 0
  if (sum > 0x99) {
    sum += 0x60
    carry = 1
  }
  return { result: sum & 0xff, carry }
}

function bcdSub(src: number, dst: number, x: number): { result: number; carry: number } {
  let diff = dst - src - x
  if (((dst & 0x0f) - (src & 0x0f) - x) < 0) diff -= 6
  let carry = 0
  if (diff < 0) {
    diff -= 0x60
    carry = 1
  }
  return { result: diff & 0xff, carry }
}

function bcdHandler(op: (src: number, dst: number, x: number) => { result: number; carry: number }) {
  return (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const destReg = (opcodeWord >> 9) & 0b111
    const isMemoryForm = ((opcodeWord >> 3) & 1) === 1
    const srcReg = opcodeWord & 0b111
    const mode = isMemoryForm ? 0b100 : 0b000

    const src = decodeEA(cpu, memory, mode, srcReg, 'byte')
    const dst = decodeEA(cpu, memory, mode, destReg, 'byte')

    const x = cpu.status.X ? 1 : 0
    const { result, carry } = op(src.read(), dst.read(), x)
    dst.write(result)

    cpu.status.X = carry === 1
    cpu.status.C = carry === 1
    if (result !== 0) cpu.status.Z = false

    return isMemoryForm ? 18 : 6
  }
}

const ABCD: OpcodeDefinition = {
  mnemonic: 'ABCD',
  encode: pair(0xc100, false, ['dn', 'pre']),
  encoding: '1100xxx10000ryyy',
  size: 'byte',
  handler: bcdHandler(bcdAdd),
}

const SBCD: OpcodeDefinition = {
  mnemonic: 'SBCD',
  encode: pair(0x8100, false, ['dn', 'pre']),
  encoding: '1000xxx10000ryyy',
  size: 'byte',
  handler: bcdHandler(bcdSub),
}

// --- ADDX/SUBX Dy,Dx / -(Ay),-(Ax) ($D100-$D1F8 / $9100-$91F8) ----------
//
// The binary counterparts to ABCD/SBCD - same register-pair/predecrement-
// pair shape and the same chaining use case (building an operation wider
// than one register out of several, one piece at a time through X), but
// ordinary binary arithmetic instead of packed BCD, and with a real size
// field (byte/word/long) since there's no BCD-style "always one byte"
// restriction here.
//
// `dst = dst +/- src +/- X` is computed as two chained addWithFlags/
// subWithFlags calls (dst OP src, then that result OP x) rather than a
// bespoke three-operand version of those helpers: N/Z come from the
// final result, but C/V/X each have to be the OR of *both* steps' own
// C/V - either step overflowing/carrying means the real three-operand
// operation does too. Z follows the same "cleared if non-zero, left
// alone if zero" chaining rule ABCD/SBCD already use, for the same
// reason (a multi-word chain needs to read Z back only if every piece
// came out zero).

function addExtend(destVal: number, srcVal: number, x: number, size: Size) {
  const step1 = addWithFlags(destVal, srcVal, size)
  const step2 = addWithFlags(step1.result, x, size)
  const carry = step1.flags.C || step2.flags.C
  return {
    result: step2.result,
    flags: { N: step2.flags.N, Z: step2.result === 0, V: step1.flags.V || step2.flags.V, C: carry, X: carry },
  }
}

function subExtend(destVal: number, srcVal: number, x: number, size: Size) {
  const step1 = subWithFlags(destVal, srcVal, size)
  const step2 = subWithFlags(step1.result, x, size)
  const carry = step1.flags.C || step2.flags.C
  return {
    result: step2.result,
    flags: { N: step2.flags.N, Z: step2.result === 0, V: step1.flags.V || step2.flags.V, C: carry, X: carry },
  }
}

function extendHandler(
  combine: (destVal: number, srcVal: number, x: number, size: Size) => { result: number; flags: ArithmeticFlags }
): OpcodeDefinition['handler'] {
  return (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const destReg = (opcodeWord >> 9) & 0b111
    const size = decodeStandardOpSize((opcodeWord >> 6) & 0b11)
    const isMemoryForm = ((opcodeWord >> 3) & 1) === 1
    const srcReg = opcodeWord & 0b111
    const mode = isMemoryForm ? 0b100 : 0b000

    const src = decodeEA(cpu, memory, mode, srcReg, size)
    const dest = decodeEA(cpu, memory, mode, destReg, size)

    const x = cpu.status.X ? 1 : 0
    const { result, flags } = combine(dest.read(), src.read(), x, size)
    dest.write(result)

    cpu.status.N = flags.N
    cpu.status.V = flags.V
    cpu.status.C = flags.C
    cpu.status.X = flags.X
    if (result !== 0) cpu.status.Z = false

    if (isMemoryForm) return size === 'long' ? 30 : 18
    return size === 'long' ? 8 : 4
  }
}

const ADDX: OpcodeDefinition = {
  mnemonic: 'ADDX',
  encode: pair(0xd100, true, ['dn', 'pre']),
  encoding: '1101xxx1ss00ryyy',
  size: 'variable',
  handler: extendHandler(addExtend),
}

const SUBX: OpcodeDefinition = {
  mnemonic: 'SUBX',
  encode: pair(0x9100, true, ['dn', 'pre']),
  encoding: '1001xxx1ss00ryyy',
  size: 'variable',
  handler: extendHandler(subExtend),
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

// ADDQ/SUBQ #1..8,<ea> (8 is stored as 0).
function quick(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 2 || ops[0].kind !== 'imm' || ops[1].kind === 'imm') return null
    if (size === 'byte' && ops[1].kind === 'an') return null
    const d = ctx.eval(ops[0].expr)
    if (ctx.final && (d < 1 || d > 8)) throw new Error(`Quick value ${d} out of range (1..8)`)
    const dst = encodeEA(ops[1], size, ctx)
    return [base | ((d & 7) << 9) | (sizeBits(size) << 6) | dst.field, ...dst.ext]
  }
}

// CLR/TST/NOT/NEG/NEGX <ea> (data-alterable); TAS/NBCD have no size field.
function unary(base: number, sized = true): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 1 || !isDataAlterable(ops[0])) return null
    const dst = encodeEA(ops[0], size, ctx)
    return [base | (sized ? sizeBits(size) << 6 : 0) | dst.field, ...dst.ext]
  }
}

// <ea>,Dn where <ea> is a data source (no An): AND/OR (sized), MULU/MULS/
// DIVU/DIVS/CHK (word only, opmode already in `base`).
function dataToDn(base: number, sized: boolean): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 2 || ops[1].kind !== 'dn' || ops[0].kind === 'an') return null
    if (!sized && size !== 'word') return null
    const src = encodeEA(ops[0], size, ctx)
    return [base | (ops[1].n << 9) | (sized ? sizeBits(size) << 6 : 0) | src.field, ...src.ext]
  }
}

// Dn,<ea> (data-alterable): EOR.
function dnToEa(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 2 || ops[0].kind !== 'dn' || !isDataAlterable(ops[1])) return null
    const dst = encodeEA(ops[1], size, ctx)
    return [base | (ops[0].n << 9) | (sizeBits(size) << 6) | dst.field, ...dst.ext]
  }
}

// Register-to-register / memory-to-memory pairs: ADDX/SUBX/ABCD/SBCD (Dy,Dx or
// -(Ay),-(Ax)) and CMPM ((Ay)+,(Ax)+). For CMPM the "memory" bit is already in `base`.
function pair(base: number, sized: boolean, forms: string[]): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size) => {
    if (ops.length !== 2) return null
    const [s, d] = ops
    if (s.kind !== d.kind || !forms.includes(s.kind) || !('n' in s) || !('n' in d)) return null
    return [base | (d.n << 9) | (sized ? sizeBits(size) << 6 : 0) | (s.kind === 'pre' ? 8 : 0) | s.n]
  }
}

// ASL/ASR/LSL/LSR/ROL/ROR/ROXL/ROXR #1..8,Dy or Dx,Dy (register forms).
function shiftReg(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 2 || ops[1].kind !== 'dn') return null
    const sizeField = sizeBits(size) << 6
    if (ops[0].kind === 'dn') return [base | (ops[0].n << 9) | sizeField | 0x20 | ops[1].n]
    if (ops[0].kind !== 'imm') return null
    const count = ctx.eval(ops[0].expr)
    if (ctx.final && (count < 1 || count > 8)) throw new Error(`Shift count ${count} out of range (1..8)`)
    return [base | ((count & 7) << 9) | sizeField | ops[1].n]
  }
}

// Same mnemonics, one memory operand: shifts a word by exactly 1.
function shiftMem(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 1 || !isMemory(ops[0])) return null
    const dst = encodeEA(ops[0], size, ctx)
    return [base | dst.field, ...dst.ext]
  }
}

// BTST/BCHG/BCLR/BSET #n,<ea> (bit number in an extension word) and Dn,<ea>.
function bitImm(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, _size, ctx) => {
    if (ops.length !== 2 || ops[0].kind !== 'imm' || !isDataAlterable(ops[1])) return null
    const dst = encodeEA(ops[1], 'byte', ctx)
    return [base | dst.field, ...immWords(ctx.eval(ops[0].expr), 'byte', ctx.final), ...dst.ext]
  }
}

function bitDyn(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, _size, ctx) => {
    if (ops.length !== 2 || ops[0].kind !== 'dn' || !isDataAlterable(ops[1])) return null
    const dst = encodeEA(ops[1], 'byte', ctx)
    return [base | (ops[0].n << 9) | dst.field, ...dst.ext]
  }
}

// Single fixed word, no operands: TRAPV/RTR/ILLEGAL.
const fixed = (word: number): NonNullable<OpcodeDefinition['encode']> => (ops) => (ops.length === 0 ? [word] : null)

// JMP/JSR <ea> (control modes only).
function jump(base: number): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 1 || !isControl(ops[0])) return null
    const ea = encodeEA(ops[0], size, ctx)
    return [base | ea.field, ...ea.ext]
  }
}

const ADDQ: OpcodeDefinition = {
  mnemonic: 'ADDQ',
  encode: quick(0x5000),
  encoding: '0101ddd0ssmmmrrr',
  size: 'variable',
  handler: addqSubqHandler(1),
}

const SUBQ: OpcodeDefinition = {
  mnemonic: 'SUBQ',
  encode: quick(0x5100),
  encoding: '0101ddd1ssmmmrrr',
  size: 'variable',
  handler: addqSubqHandler(-1),
}

// --- CMP <ea>,Dn (opmode bits 8-6 = 0xx: Dn - EA, result discarded) -----

const CMP: OpcodeDefinition = {
  mnemonic: 'CMP',
  encoding: '1011rrr0ssmmmRRR',
  size: 'variable',
  encode: eaToDn(0xb000),
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

// --- ADDA/SUBA <ea>,An ($D0C0-$D1FE / $90C0-$91FE) -----------------------
//
// The `An`-destination form of `ADD`/`SUB` - exactly the relationship
// `MOVEA` has to `MOVE`: always a full 32-bit op on `An` regardless of
// source size, and it never touches the flags (real 68000: `ADDA`/`SUBA`
// affect no condition codes at all, not even the ones a same-size `ADD`/
// `SUB` would set). A word-sized source is sign-extended to 32 bits
// before the add/subtract - `toSigned16` already produces a JS number
// that `writeRegister`'s `>>> 0` reinterprets correctly as the 32-bit
// two's-complement value, so no separate extension step is needed here.
//
// Opmode bits 8-6 select `ADDA`/`SUBA` at `011` (word) and `111` (long) -
// note bit 8 (word/long) sits in the *middle* of the fixed `ADD`/`SUB`
// opmode space rather than at either end, so `decodeStandardOpSize`
// (which only defines byte/word/long as 000/001/010) can't be reused
// here. Both opmodes share `ADDA`/`SUBA`'s own narrower opcodeTable
// entry (mask `0xf0c0`, matching bits 7-6 = `11` with bit 8 free), which
// has to be listed *before* `ADD`/`SUB`'s broader entry (mask `0xf100`,
// bit 8 fixed at `0`) - otherwise a word-sized `ADDA`/`SUBA` (bit 8 = 0)
// would wrongly resolve to plain `ADD`/`SUB` and crash trying to decode
// `011` as if it were a byte/word/long size. `ADDA`/`SUBA`'s long form
// (bit 8 = 1) doesn't collide with `ADD`/`SUB` at all - only with word.
//
// Real 68000 cycle counts split cleanly by size here (word costs more:
// the sign-extension is an extra internal step), so - same precision
// this codebase already applies to MOVEM's word/long split - it's
// modeled exactly rather than flattened to one number.

function addaSubaHandler(sign: 1 | -1): OpcodeDefinition['handler'] {
  return (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const destReg = (Register.A0 + ((opcodeWord >> 9) & 0b111)) as Register
    const isLong = ((opcodeWord >> 8) & 1) === 1
    const size: Size = isLong ? 'long' : 'word'
    const srcMode = (opcodeWord >> 3) & 0b111
    const srcReg = opcodeWord & 0b111

    const src = decodeEA(cpu, memory, srcMode, srcReg, size)
    const value = isLong ? src.read() : toSigned16(src.read())

    const current = readRegister(cpu, destReg, 'long')
    writeRegister(cpu, destReg, current + sign * value, 'long')

    return isLong ? 6 : 8
  }
}

const ADDA: OpcodeDefinition = {
  mnemonic: 'ADDA',
  encoding: '1101aaas11mmmrrr',
  size: 'variable',
  encode: eaToAn(0xd000),
  handler: addaSubaHandler(1),
}

const SUBA: OpcodeDefinition = {
  mnemonic: 'SUBA',
  encoding: '1001aaas11mmmrrr',
  size: 'variable',
  encode: eaToAn(0x9000),
  handler: addaSubaHandler(-1),
}

// --- CMPA <ea>,An ($B0C0-$B1FE) - like CMP, but a 32-bit An comparison --
//
// Same opmode `011`/`111` slot `ADDA`/`SUBA` use, same word-source
// sign-extension, but sets flags like `CMP` instead of writing back to
// `An` - N/Z/V/C from the 32-bit subtraction, X left untouched, exactly
// `CMP`'s own rule. Its long form (bit 8 = 1) shares `XOR`'s opcodeTable
// range too (`XOR`'s mask only fixes bit 8 = 1, wildcarding bits 7-6),
// so `CMPA`'s narrower entry has to be listed before *both* `CMP`'s and
// `XOR`'s broader ones.

const CMPA: OpcodeDefinition = {
  mnemonic: 'CMPA',
  encoding: '1011aaas11mmmrrr',
  size: 'variable',
  encode: eaToAn(0xb000),
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const destReg = (Register.A0 + ((opcodeWord >> 9) & 0b111)) as Register
    const isLong = ((opcodeWord >> 8) & 1) === 1
    const size: Size = isLong ? 'long' : 'word'
    const srcMode = (opcodeWord >> 3) & 0b111
    const srcReg = opcodeWord & 0b111

    const src = decodeEA(cpu, memory, srcMode, srcReg, size)
    const value = isLong ? src.read() : toSigned16(src.read())
    const current = readRegister(cpu, destReg, 'long')

    const { flags } = subWithFlags(current, value, 'long')

    cpu.status.N = flags.N
    cpu.status.Z = flags.Z
    cpu.status.V = flags.V
    cpu.status.C = flags.C
    // Real 68000 CMPA leaves X untouched, same as CMP.

    return 6
  },
}

// --- MOVEQ #imm,Dn ($7000-$7EFE, bit8 = 0) ------------------------------

const MOVEQ: OpcodeDefinition = {
  mnemonic: 'MOVEQ',
  encoding: '0111rrr0dddddddd',
  size: 'long',
  encode: (ops, _size, ctx) => {
    if (ops.length !== 2 || ops[0].kind !== 'imm' || ops[1].kind !== 'dn') return null
    const v = ctx.eval(ops[0].expr)
    if (ctx.final && (v < -128 || v > 127)) throw new Error(`MOVEQ value ${v} out of range (-128..127)`)
    return [0x7000 | (ops[1].n << 9) | (v & 0xff)]
  },
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

function branch(base: number, useCc: boolean): NonNullable<OpcodeDefinition['encode']> {
  return (ops, size, ctx) => {
    if (ops.length !== 1 || ops[0].kind !== 'abs') return null
    if (size === 'long') throw new Error('Branches are .S or .W only')
    const opcode = base | (useCc ? (ctx.cc ?? 0) << 8 : 0)
    const disp = ctx.eval(ops[0].expr) - (ctx.pc + 2)
    if (size === 'byte') {
      if (ctx.final && disp === 0) throw new Error('Short branch with zero displacement (use .W)')
      if (ctx.final && (disp < -128 || disp > 127)) throw new Error(`Branch displacement ${disp} out of range for .S`)
      return [opcode | (disp & 0xff)]
    }
    if (ctx.final && (disp < -32768 || disp > 32767)) throw new Error(`Branch displacement ${disp} out of range`)
    return [opcode, disp & 0xffff]
  }
}

const Bcc: OpcodeDefinition = {
  mnemonic: 'Bcc',
  encode: branch(0x6000, true),
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
  encode: (ops, _size, ctx) => {
    if (ops.length !== 2 || ops[0].kind !== 'dn' || ops[1].kind !== 'abs') return null
    const disp = ctx.eval(ops[1].expr) - (ctx.pc + 2)
    if (ctx.final && (disp < -32768 || disp > 32767)) throw new Error(`DBcc displacement ${disp} out of range`)
    return [0x50c8 | ((ctx.cc ?? 0) << 8) | ops[0].n, disp & 0xffff]
  },
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
  encode: (ops, size, ctx) => {
    if (ops.length !== 1 || !isDataAlterable(ops[0])) return null
    const dst = encodeEA(ops[0], size, ctx)
    return [0x50c0 | ((ctx.cc ?? 0) << 8) | dst.field, ...dst.ext]
  },
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
  encode: (ops, size, ctx) => {
    if (ops.length !== 2 || !isControl(ops[0]) || ops[1].kind !== 'an') return null
    const src = encodeEA(ops[0], size, ctx)
    return [0x41c0 | (ops[1].n << 9) | src.field, ...src.ext]
  },
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
  encode: jump(0x4840),
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
  encode: jump(0x4e80),
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

// --- JMP <ea> ($4EC0) - like JSR but no return address is pushed - just
// an unconditional jump to <ea>, same control addressing modes as JSR.

const JMP: OpcodeDefinition = {
  mnemonic: 'JMP',
  encode: jump(0x4ec0),
  encoding: '0100111011mmmrrr',
  size: 'long',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    cpu.pc = decodeControlAddress(cpu, memory, mode, reg)

    return 8
  },
}

// --- BSR <disp> ($6100) - like Bcc's BRA, but pushes the return address --

const BSR: OpcodeDefinition = {
  mnemonic: 'BSR',
  encode: branch(0x6100, false),
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
  encode: (ops) => (ops.length === 0 ? [0x4e75] : null),
  handler: (cpu: CPUState, memory: Memory) => {
    const sp = readRegister(cpu, Register.A7, 'long')
    cpu.pc = memory.read32(sp)
    writeRegister(cpu, Register.A7, sp + 4, 'long')

    return 16
  },
}

// --- TRAPV ($4E76) ---------------------------------------------------------
//
// Raises the TRAPV exception if V is set, otherwise falls through as a
// no-op - the classic "check for overflow right after an ADD/SUB, bail
// out if so" idiom, without hand-coding a separate BVC/TRAP pair.

const TRAPV: OpcodeDefinition = {
  mnemonic: 'TRAPV',
  encode: fixed(0x4e76),
  encoding: '0100111001110110',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory) => {
    if (cpu.status.V) {
      raiseException(cpu, memory, TRAPV_VECTOR, 'TRAPV')
      return 34
    }
    return 4
  },
}

// --- RTR ($4E77) - pop the flags, then the return address ---------------
//
// RTS's sibling: pops a 16-bit CCR-shaped word (only the low 5 bits are
// meaningful - X,N,Z,V,C from bit4 down to bit0, matching the real 68000
// CCR bit layout) into the flags, then pops PC exactly like RTS. Unlike
// RTE, this isn't tied to the exception mechanism or supervisor mode at
// all (see docs/OPCODES.md's "Why doesn't this emulator implement RTE/
// STOP/RESET/MOVE SR?") - it's an ordinary, unprivileged instruction any
// program can use to restore flags it saved earlier (e.g. with MOVE
// <ea>,CCR building the word by hand, or a manual push), the same way
// RTS restores PC.

const RTR: OpcodeDefinition = {
  mnemonic: 'RTR',
  encode: fixed(0x4e77),
  encoding: '0100111001110111',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory) => {
    const sp = readRegister(cpu, Register.A7, 'long')
    const ccr = memory.read16(sp)
    cpu.status.C = (ccr & 0b00001) !== 0
    cpu.status.V = (ccr & 0b00010) !== 0
    cpu.status.Z = (ccr & 0b00100) !== 0
    cpu.status.N = (ccr & 0b01000) !== 0
    cpu.status.X = (ccr & 0b10000) !== 0
    cpu.pc = memory.read32(sp + 2)
    writeRegister(cpu, Register.A7, sp + 6, 'long')

    return 20
  },
}

// --- LINK An,#<displacement> ($4E50-$4E57) -------------------------------
//
// Classic stack-frame prologue: pushes An, points An at the new frame,
// then grows/shrinks the stack by `displacement` bytes for locals. Coded
// as Motorola's exact micro-op sequence (SP-4->SP; An->(SP); SP->An;
// SP+d->SP), each step reading registers fresh rather than caching An's
// value up front, so the documented "LINK A7" quirk — the value actually
// pushed is the *already-decremented* SP, since An and SP are the same
// register there — falls out for free. Same trick ROXL/ROXR's count=0
// case uses (see [[project-opcode-progress]]).

const LINK: OpcodeDefinition = {
  mnemonic: 'LINK',
  encode: (ops, _size, ctx) =>
    ops.length === 2 && ops[0].kind === 'an' && ops[1].kind === 'imm'
      ? [0x4e50 | ops[0].n, ...immWords(ctx.eval(ops[1].expr), 'word', ctx.final)]
      : null,
  encoding: '0100111001010rrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const reg = opcodeWord & 0b111
    const addrReg = (Register.A0 + reg) as Register

    const displacement = toSigned16(memory.read16(cpu.pc))
    cpu.pc += 2

    writeRegister(cpu, Register.A7, readRegister(cpu, Register.A7, 'long') - 4, 'long')
    memory.write32(readRegister(cpu, Register.A7, 'long'), readRegister(cpu, addrReg, 'long'))
    writeRegister(cpu, addrReg, readRegister(cpu, Register.A7, 'long'), 'long')
    writeRegister(cpu, Register.A7, readRegister(cpu, Register.A7, 'long') + displacement, 'long')

    return 16
  },
}

// --- UNLK An ($4E58-$4E5F) ------------------------------------------------
//
// Stack-frame epilogue, LINK's inverse (SP<-An; An<-(SP); SP<-SP+4). Same
// "sequential register ops, no caching" style reproduces the "UNLK A7"
// quirk automatically: SP<-An is a no-op there, so An<-(SP) overwrites
// A7/SP itself with the popped value, and the final SP+4 is computed from
// *that* new value rather than the original frame pointer.

const UNLK: OpcodeDefinition = {
  mnemonic: 'UNLK',
  encode: (ops) => (ops.length === 1 && ops[0].kind === 'an' ? [0x4e58 | ops[0].n] : null),
  encoding: '0100111001011rrr',
  size: 'long',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const reg = opcodeWord & 0b111
    const addrReg = (Register.A0 + reg) as Register

    writeRegister(cpu, Register.A7, readRegister(cpu, addrReg, 'long'), 'long')
    writeRegister(cpu, addrReg, memory.read32(readRegister(cpu, Register.A7, 'long')), 'long')
    writeRegister(cpu, Register.A7, readRegister(cpu, Register.A7, 'long') + 4, 'long')

    return 12
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
  encode: bitImm(0x0800),
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

    return isRegisterOperand ? 10 : 8
  },
}

// --- BCHG/BCLR/BSET #<data>,<ea> ($0840/$0880/$08C0) ---------------------
//
// BTST's write-back siblings: same bit-number extension word and the same
// register-tests-as-long/memory-tests-as-byte split, but each also writes
// the modified value back to <ea> after setting Z from the bit's *previous*
// state — BCHG toggles the bit, BCLR clears it, BSET sets it.

function bitOpHandler(
  apply: (value: number, mask: number) => number,
  registerCycles: number
): OpcodeDefinition['handler'] {
  return (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    if (mode === 0b001) {
      // Same "An isn't valid either way" rule BTST follows.
      raiseException(cpu, memory, ILLEGAL_INSTRUCTION_VECTOR, 'Illegal Instruction')
      return 34
    }

    const bitNumberWord = memory.read16(cpu.pc)
    cpu.pc += 2

    const isRegisterOperand = mode === 0b000
    const size: Size = isRegisterOperand ? 'long' : 'byte'
    const bitNumber = bitNumberWord & (isRegisterOperand ? 0x1f : 0x07)
    const mask = 1 << bitNumber

    const ea = decodeEA(cpu, memory, mode, reg, size)
    const value = ea.read()

    cpu.status.Z = ((value >>> bitNumber) & 1) === 0
    ea.write(apply(value, mask))

    return isRegisterOperand ? registerCycles : 12
  }
}

const BCHG: OpcodeDefinition = {
  mnemonic: 'BCHG',
  encode: bitImm(0x0840),
  encoding: '0000100001mmmrrr',
  size: 'variable',
  handler: bitOpHandler((value, mask) => value ^ mask, 12),
}

const BCLR: OpcodeDefinition = {
  mnemonic: 'BCLR',
  encode: bitImm(0x0880),
  encoding: '0000100010mmmrrr',
  size: 'variable',
  handler: bitOpHandler((value, mask) => value & ~mask, 14),
}

const BSET: OpcodeDefinition = {
  mnemonic: 'BSET',
  encode: bitImm(0x08c0),
  encoding: '0000100011mmmrrr',
  size: 'variable',
  handler: bitOpHandler((value, mask) => value | mask, 12),
}

// --- BTST/BCHG/BCLR/BSET Dn,<ea> ($0100-$01FF) - dynamic bit number -----
//
// The dynamic sibling of the four static `#<data>,<ea>` forms above: the
// bit number comes from a data register (bits 11-9 of the opcode word)
// instead of an extension word, so no extra word is fetched. Shares the
// static forms' `oo` field (bits 7-6: 00=BTST/01=BCHG/10=BCLR/11=BSET)
// and the same register-tests-as-long(mod 32)/memory-tests-as-byte(mod 8)
// split.
//
// Costs less than the static form on a register destination (no
// extension-word fetch), but exactly the same on a memory destination -
// see the two `registerCycles` values below versus `bitOpHandler`'s.
//
// `mode=001` (`An` direct, invalid as a bit destination here too) is real
// hardware's `MOVEP` slot, not a genuinely reachable case for these four
// - see `MOVEP`'s own comment below, whose narrower opcodeTable entry
// always wins first-match for that specific mode. No explicit `An` guard
// is added here for that reason, the same precedent `Scc`'s own
// `DBcc`-shadowed `mode=001` slot already established.

function dynamicBitNumber(cpu: CPUState, opcodeWord: number, isRegisterOperand: boolean) {
  const bitReg = (Register.D0 + ((opcodeWord >> 9) & 0b111)) as Register
  const bitNumberValue = readRegister(cpu, bitReg, 'long')
  return bitNumberValue & (isRegisterOperand ? 0x1f : 0x07)
}

const BTST_DYNAMIC: OpcodeDefinition = {
  mnemonic: 'BTST',
  encode: bitDyn(0x0100),
  encoding: '0000ddd100mmmrrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    const isRegisterOperand = mode === 0b000
    const size: Size = isRegisterOperand ? 'long' : 'byte'
    const bitNumber = dynamicBitNumber(cpu, opcodeWord, isRegisterOperand)

    const ea = decodeEA(cpu, memory, mode, reg, size)
    const value = ea.read()

    cpu.status.Z = ((value >>> bitNumber) & 1) === 0

    return isRegisterOperand ? 6 : 8
  },
}

function dynamicBitOpHandler(
  apply: (value: number, mask: number) => number,
  registerCycles: number
): OpcodeDefinition['handler'] {
  return (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    const isRegisterOperand = mode === 0b000
    const size: Size = isRegisterOperand ? 'long' : 'byte'
    const bitNumber = dynamicBitNumber(cpu, opcodeWord, isRegisterOperand)
    const mask = 1 << bitNumber

    const ea = decodeEA(cpu, memory, mode, reg, size)
    const value = ea.read()

    cpu.status.Z = ((value >>> bitNumber) & 1) === 0
    ea.write(apply(value, mask))

    return isRegisterOperand ? registerCycles : 12
  }
}

const BCHG_DYNAMIC: OpcodeDefinition = {
  mnemonic: 'BCHG',
  encode: bitDyn(0x0140),
  encoding: '0000ddd101mmmrrr',
  size: 'variable',
  handler: dynamicBitOpHandler((value, mask) => value ^ mask, 8),
}

const BCLR_DYNAMIC: OpcodeDefinition = {
  mnemonic: 'BCLR',
  encode: bitDyn(0x0180),
  encoding: '0000ddd110mmmrrr',
  size: 'variable',
  handler: dynamicBitOpHandler((value, mask) => value & ~mask, 10),
}

const BSET_DYNAMIC: OpcodeDefinition = {
  mnemonic: 'BSET',
  encode: bitDyn(0x01c0),
  encoding: '0000ddd111mmmrrr',
  size: 'variable',
  handler: dynamicBitOpHandler((value, mask) => value | mask, 8),
}

// --- MOVEP Dx,(d16,Ay) / (d16,Ay),Dx ($0108) ------------------------------
//
// Transfers 2 (.W) or 4 (.L) bytes between a data register and alternating
// bytes of memory starting at (d16,Ay), stepping the address by 2 each
// byte, most-significant byte first — built for wiring an 8-bit peripheral
// onto the 16-bit data bus. Always this one fixed addressing form, never
// any of decodeEA's regular modes, but it's exactly `decodeControlAddress`'s
// d16(An) case (mode 0b101), so it's reused directly for the address rather
// than hand-rolling the displacement extension word again.
//
// Shares its top-nibble/bit-8 opcode space with BTST/BCHG/BCLR/BSET's
// dynamic Dn,<ea> form above: mode field bits 5-3 fixed to `001` is the
// one combination that form can never produce for a valid destination
// (`001` is An direct, invalid for a bit destination), which is exactly
// the slot real 68000 hardware repurposes for MOVEP - so MOVEP's own
// narrower opcodeTable entry (mask 0xf138, wildcarding only Dx/opmode/Ay)
// has to be listed before the dynamic bit-op entries' broader ones (mask
// 0xf1c0, wildcarding the full mode+reg field) for first-match-wins to
// resolve mode=001 correctly.

const MOVEP: OpcodeDefinition = {
  mnemonic: 'MOVEP',
  encoding: '0000ddd1oo001aaa',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const dataReg = (Register.D0 + ((opcodeWord >> 9) & 0b111)) as Register
    const opmode = (opcodeWord >> 6) & 0b11
    const isLong = (opmode & 0b01) === 0b01
    const isStore = (opmode & 0b10) === 0b10

    const address = decodeControlAddress(cpu, memory, 0b101, opcodeWord & 0b111)
    const byteCount = isLong ? 4 : 2

    if (isStore) {
      const value = readRegister(cpu, dataReg, 'long')
      for (let i = 0; i < byteCount; i++) {
        const shift = (byteCount - 1 - i) * 8
        memory.write8(address + i * 2, (value >>> shift) & 0xff)
      }
    } else {
      let value = 0
      for (let i = 0; i < byteCount; i++) {
        value = (value << 8) | memory.read8(address + i * 2)
      }
      writeRegister(cpu, dataReg, value, isLong ? 'long' : 'word')
    }

    return isLong ? 24 : 16
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
  encode: dataToDn(0xc0c0, false),
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
  encode: dataToDn(0xc1c0, false),
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
  encode: dataToDn(0x80c0, false),
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
  encode: dataToDn(0x81c0, false),
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
  encode: dataToDn(0xc000, true),
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
  encode: dataToDn(0x8000, true),
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
  encode: dnToEa(0xb100),
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

// --- CMPM (Ay)+,(Ax)+ ($B108-$B1FF) - compare two memory operands -------
//
// `CMP`'s dedicated memory-to-memory form: always postincrement on both
// sides, no register operand at all - computes (Ax) - (Ay), same "src,
// dst" order every other instruction here uses, and only sets flags like
// CMP (X untouched). `Ay` postincrements first, then `Ax` - "source
// before destination", the same convention ABCD/SBCD/ADDX/SUBX use for
// their own dual-operand forms, though the two increments are only
// actually observable in that order if Ax and Ay happen to be the same
// register.
//
// Shares opcode space with XOR (`Dn,<ea>`) at the bit level, the same way
// ADDX/SUBX share space with ADD/SUB's own memory-destination forms:
// XOR's own `<ea>` is unrestricted in this codebase (see decodeDnAndEa
// above - it doesn't even exclude `An`, a pre-existing gap), so its mask
// would otherwise swallow CMPM's words too. CMPM's narrower entry has to
// be listed first.

const CMPM: OpcodeDefinition = {
  mnemonic: 'CMPM',
  encode: pair(0xb108, true, ['post']),
  encoding: '1011xxx1ss001yyy',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const destReg = (opcodeWord >> 9) & 0b111
    const size = decodeStandardOpSize((opcodeWord >> 6) & 0b11)
    const srcReg = opcodeWord & 0b111

    const src = decodeEA(cpu, memory, 0b011, srcReg, size)
    const dest = decodeEA(cpu, memory, 0b011, destReg, size)

    const { flags } = subWithFlags(dest.read(), src.read(), size)

    cpu.status.N = flags.N
    cpu.status.Z = flags.Z
    cpu.status.V = flags.V
    cpu.status.C = flags.C
    // X untouched, same as CMP.

    return size === 'long' ? 20 : 12
  },
}

// --- EXG Rx,Ry ($C140/$C148/$C188) - exchange two registers -------------
//
// Swaps two full 32-bit registers in one instruction - `Dx,Dy`, `Ax,Ay`,
// or `Dx,Ay` (never `Ax,Dy`; the assembler picks the encoding that
// matches which operand is which). No flags touched, flat 6 cycles
// regardless of which pair. Three exact opmode values (5 bits, bits
// 7-3) pick the register-file combination - `01000`/`01001`/`10001` -
// with nothing else valid in between, so this is three narrow
// opcodeTable entries (mask `0xf1f8`, one exact pattern each) sharing
// one handler, rather than one entry decoding a variable field.
//
// All three share the `AND`/`ABCD` top nibble (`$C000`) with bit 8 = 1,
// same as `ABCD`'s own reserved slot - but `EXG`'s opmode values (bit 6
// or bit 7 always set) never overlap `ABCD`'s fixed `0000`/`0001`
// opmode, so the two never collide with each other. They *do* collide
// with `AND`'s new `Dn,<ea>` memory-destination form above, though:
// that entry's mask only fixes bit 8, wildcarding the rest, so it would
// otherwise swallow `EXG`'s words too. `EXG`'s narrower entries have to
// be listed first in opcodeTable for that reason - same trick, new
// instance of it.

const EXG_DATA = 0b01000
const EXG_ADDRESS = 0b01001
const EXG_DATA_ADDRESS = 0b10001

const EXG: OpcodeDefinition = {
  mnemonic: 'EXG',
  encode: (ops) => {
    if (ops.length !== 2 || !('n' in ops[0]) || !('n' in ops[1])) return null
    const [a, b] = ops
    if (a.kind === 'dn' && b.kind === 'dn') return [0xc100 | (EXG_DATA << 3) | (a.n << 9) | b.n]
    if (a.kind === 'an' && b.kind === 'an') return [0xc100 | (EXG_ADDRESS << 3) | (a.n << 9) | b.n]
    if (a.kind === 'dn' && b.kind === 'an') return [0xc100 | (EXG_DATA_ADDRESS << 3) | (a.n << 9) | b.n]
    if (a.kind === 'an' && b.kind === 'dn') return [0xc100 | (EXG_DATA_ADDRESS << 3) | (b.n << 9) | a.n]
    return null
  },
  encoding: '1100rrr1ooooosss',
  size: 'long',
  handler: (cpu: CPUState, _memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const rx = (opcodeWord >> 9) & 0b111
    const opmode = (opcodeWord >> 3) & 0b11111
    const ry = opcodeWord & 0b111

    const regX = (opmode === EXG_ADDRESS ? Register.A0 : Register.D0) + rx
    const regY = (opmode === EXG_DATA ? Register.D0 : Register.A0) + ry

    const valueX = readRegister(cpu, regX as Register, 'long')
    const valueY = readRegister(cpu, regY as Register, 'long')
    writeRegister(cpu, regX as Register, valueY, 'long')
    writeRegister(cpu, regY as Register, valueX, 'long')

    return 6
  },
}

// --- ADD/SUB/AND/OR Dn,<ea> - the missing memory-destination direction --
//
// `ADD`/`SUB`/`AND`/`OR` above only cover `<ea>,Dn -> Dn` (opmode `0xx`);
// real 68000 also has the mirror image, `Dn,<ea> -> <ea>` (opmode `1xx`),
// writing the result to memory instead of a data register - the same
// direction `EOR` already uses above (`EOR` just never had the other
// direction to begin with). `<ea>` here must be a *memory-alterable*
// mode - not `Dn`, not `An` - unlike `EOR`'s own `decodeDnAndEa`, which
// allows `Dn` too (a real `EOR` restriction this codebase doesn't
// enforce, same class of gap as `CLR`/`NEG`/`NOT`/`TST`/`Scc`'s `An`
// laxity). `decodeMemAlterableEA` (below, shared with the shift/rotate
// memory form) already rejects exactly `Dn`/`An`, so it's reused here
// with an explicit size instead of its `ASL`-family default of `word`.
//
// This restriction isn't just correctness for its own sake: `Dn`/`An`
// (mode `000`/`001`) are *structurally* excluded from every valid
// encoding here, because real hardware reuses exactly that slot for
// `ABCD`/`SBCD` (bit 8 = `1`, byte size, mode `000`/`001`) in the `AND`/
// `OR` top nibbles specifically - the same reserved-encoding split this
// codebase already resolved with an opcodeTable-ordering trick. `ADD`/
// `SUB`'s own top nibbles don't have that particular collision (no BCD
// instruction lives there), but the restriction is identical either way
// since it's a real, not incidental, hardware rule.
//
// Cycles are higher than the `<ea>,Dn` direction's flat `4`: writing
// back to memory costs a real extra bus cycle on top of the read, split
// cleanly by size (byte/word vs. long) the same way this codebase
// already models `ADDA`/`SUBA`'s split.

function decodeDnAndMemDest(cpu: CPUState, memory: Memory, opcodeWord: number) {
  const srcReg = (opcodeWord >> 9) & 0b111
  const size = decodeStandardOpSize((opcodeWord >> 6) & 0b011)
  const destMode = (opcodeWord >> 3) & 0b111
  const destReg = opcodeWord & 0b111

  const src = decodeEA(cpu, memory, 0b000, srcReg, size)
  const dest = decodeMemAlterableEA(cpu, memory, destMode, destReg, size)
  return { src, dest, size }
}

const ADD_MEM: OpcodeDefinition = {
  mnemonic: 'ADD',
  encoding: '1101rrr1ssmmmrrr',
  size: 'variable',
  encode: dnToMem(0xd000),
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { src, dest, size } = decodeDnAndMemDest(cpu, memory, opcodeWordOf(args))
    if (!dest) return 34

    const { result, flags } = addWithFlags(dest.read(), src.read(), size)
    dest.write(result)

    cpu.status.N = flags.N
    cpu.status.Z = flags.Z
    cpu.status.V = flags.V
    cpu.status.C = flags.C
    cpu.status.X = flags.X

    return size === 'long' ? 12 : 8
  },
}

const SUB_MEM: OpcodeDefinition = {
  mnemonic: 'SUB',
  encoding: '1001rrr1ssmmmrrr',
  size: 'variable',
  encode: dnToMem(0x9000),
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { src, dest, size } = decodeDnAndMemDest(cpu, memory, opcodeWordOf(args))
    if (!dest) return 34

    const { result, flags } = subWithFlags(dest.read(), src.read(), size)
    dest.write(result)

    cpu.status.N = flags.N
    cpu.status.Z = flags.Z
    cpu.status.V = flags.V
    cpu.status.C = flags.C
    cpu.status.X = flags.X

    return size === 'long' ? 12 : 8
  },
}

const AND_MEM: OpcodeDefinition = {
  mnemonic: 'AND',
  encode: dnToMem(0xc000),
  encoding: '1100rrr1ssmmmrrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { src, dest, size } = decodeDnAndMemDest(cpu, memory, opcodeWordOf(args))
    if (!dest) return 34

    const result = dest.read() & src.read()
    dest.write(result)

    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = false

    return size === 'long' ? 12 : 8
  },
}

const OR_MEM: OpcodeDefinition = {
  mnemonic: 'OR',
  encode: dnToMem(0x8000),
  encoding: '1000rrr1ssmmmrrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const { src, dest, size } = decodeDnAndMemDest(cpu, memory, opcodeWordOf(args))
    if (!dest) return 34

    const result = dest.read() | src.read()
    dest.write(result)

    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = false

    return size === 'long' ? 12 : 8
  },
}

// --- NOT <ea> ($4600) -----------------------------------------------------

function decodeByteWordLongSize(bits: number): Size {
  if (bits === 0b00) return 'byte'
  if (bits === 0b01) return 'word'
  if (bits === 0b10) return 'long'
  throw new Error(`Unsupported size bits: ${bits.toString(2)}`)
}

// --- ADDI/SUBI/ANDI/ORI/EORI/CMPI #<data>,<ea> ($0000-$0CFF) -------------
//
// The immediate-operand siblings of ADD/SUB/AND/OR/EOR/CMP: the value to
// combine is an extension word (or longword) read straight out of the
// instruction stream, not another register or memory operand. `<ea>` can
// be `Dn` or any of the usual writable memory modes - unlike ADD_MEM/
// SUB_MEM/etc. above, `Dn` *is* valid here (there's no separate register
// form to collide with the way there is for ADD/SUB/AND/OR), so this
// reuses plain `decodeEA` rather than `decodeMemAlterableEA`. `An` direct
// isn't a valid destination on real hardware either - rejected below in
// `decodeImmediateAndEa` itself, the one shared entry point all six of
// these go through, same restriction CLR/NEG/NOT/TST/NBCD/BTST/CHK/TAS
// already enforce for their own `<ea>`.
//
// The immediate is read *before* `<ea>` is decoded, matching real
// hardware's instruction layout: opcode word, then the immediate data,
// then any `<ea>` extension words (a displacement, an absolute address)
// only after that.
//
// Real hardware also repurposes `<ea>` = `#imm` (mode 111, reg 100) as a
// completely different instruction here - `ORI`/`ANDI`/`EORI #imm,CCR`
// (implemented separately below, as ORI_TO_CCR/ANDI_TO_CCR/EORI_TO_CCR)
// or `,SR` (not implemented - see docs/OPCODES.md's "Why doesn't this
// emulator implement RTE/STOP/RESET/MOVE SR?"). The `,SR` encodings are
// still left unhandled rather than silently misdecoded: decodeEA's own
// #imm case still consumes an extension word and then throws on
// `ea.write()` - not silently wrong, just not yet a catchable Illegal
// Instruction either.

function decodeImmediateAndEa(cpu: CPUState, memory: Memory, opcodeWord: number) {
  const size = decodeByteWordLongSize((opcodeWord >> 6) & 0b11)
  const mode = (opcodeWord >> 3) & 0b111
  const reg = opcodeWord & 0b111

  if (mode === 0b001) {
    raiseException(cpu, memory, ILLEGAL_INSTRUCTION_VECTOR, 'Illegal Instruction')
    return null
  }

  const raw = size === 'long' ? memory.read32(cpu.pc) : memory.read16(cpu.pc)
  cpu.pc += size === 'long' ? 4 : 2
  const immediate = size === 'byte' ? raw & 0xff : raw

  const ea = decodeEA(cpu, memory, mode, reg, size)
  const isRegisterDest = mode === 0b000
  return { immediate, ea, size, isRegisterDest }
}

const ADDI: OpcodeDefinition = {
  mnemonic: 'ADDI',
  encoding: '00000110ssmmmrrr',
  size: 'variable',
  encode: immToEa(0x0600),
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const decoded = decodeImmediateAndEa(cpu, memory, opcodeWordOf(args))
    if (!decoded) return 34
    const { immediate, ea, size, isRegisterDest } = decoded

    const { result, flags } = addWithFlags(ea.read(), immediate, size)
    ea.write(result)

    cpu.status.N = flags.N
    cpu.status.Z = flags.Z
    cpu.status.V = flags.V
    cpu.status.C = flags.C
    cpu.status.X = flags.X

    if (isRegisterDest) return size === 'long' ? 16 : 8
    return size === 'long' ? 28 : 16
  },
}

const SUBI: OpcodeDefinition = {
  mnemonic: 'SUBI',
  encoding: '00000100ssmmmrrr',
  size: 'variable',
  encode: immToEa(0x0400),
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const decoded = decodeImmediateAndEa(cpu, memory, opcodeWordOf(args))
    if (!decoded) return 34
    const { immediate, ea, size, isRegisterDest } = decoded

    const { result, flags } = subWithFlags(ea.read(), immediate, size)
    ea.write(result)

    cpu.status.N = flags.N
    cpu.status.Z = flags.Z
    cpu.status.V = flags.V
    cpu.status.C = flags.C
    cpu.status.X = flags.X

    if (isRegisterDest) return size === 'long' ? 16 : 8
    return size === 'long' ? 28 : 16
  },
}

function immediateLogicalHandler(op: (dest: number, imm: number) => number): OpcodeDefinition['handler'] {
  return (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const decoded = decodeImmediateAndEa(cpu, memory, opcodeWordOf(args))
    if (!decoded) return 34
    const { immediate, ea, size, isRegisterDest } = decoded

    const result = op(ea.read(), immediate)
    ea.write(result)

    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = false

    if (isRegisterDest) return size === 'long' ? 16 : 8
    return size === 'long' ? 28 : 16
  }
}

const ANDI: OpcodeDefinition = {
  mnemonic: 'ANDI',
  encode: immToEa(0x0200),
  encoding: '00000010ssmmmrrr',
  size: 'variable',
  handler: immediateLogicalHandler((dest, imm) => dest & imm),
}

const ORI: OpcodeDefinition = {
  mnemonic: 'ORI',
  encode: immToEa(0x0000),
  encoding: '00000000ssmmmrrr',
  size: 'variable',
  handler: immediateLogicalHandler((dest, imm) => dest | imm),
}

const EORI: OpcodeDefinition = {
  mnemonic: 'EORI',
  encode: immToEa(0x0a00),
  encoding: '00001010ssmmmrrr',
  size: 'variable',
  handler: immediateLogicalHandler((dest, imm) => dest ^ imm),
}

// --- ANDI/ORI/EORI #<data>,CCR ($003C/$023C/$0A3C) ----------------------
//
// The `<ea>` = `#imm` (mode 111, reg 100) encodings that ANDI/ORI/EORI's
// general `<ea>` form above repurposes as a completely different
// instruction (see the comment on `decodeImmediateAndEa`): rather than
// combining the immediate into a memory/register operand, it combines it
// into the CCR itself. Each is a single fixed opcode word, not a range -
// size is always effectively byte (the CCR only has 5 meaningful bits) -
// but real hardware still fetches a full extension word for the
// immediate, with the upper byte reserved/ignored, so this reads a word
// and masks it down rather than reusing `decodeImmediateAndEa`'s
// byte-size path (which expects a following `<ea>`, and there isn't one
// here).
//
// Shares ORI/ANDI/EORI's own `$0000`/`$0200`/$0A00`-`$00FF`/`$02FF`/
// `$0AFF` byte at the bit level (mode=111,reg=100 is one point inside
// each one's otherwise-unconstrained `mmmrrr` field), so these narrower
// entries have to be listed before the broader ones in opcodeTable - the
// same trick MOVE_TO_CCR/MOVE_FROM_SR play against NEG/NEGX above.

function logicalToCcrHandler(op: (ccr: number, imm: number) => number): OpcodeDefinition['handler'] {
  return (cpu: CPUState, memory: Memory) => {
    const immediate = memory.read16(cpu.pc) & 0xff
    cpu.pc += 2

    const ccr =
      (cpu.status.C ? 0b00001 : 0) |
      (cpu.status.V ? 0b00010 : 0) |
      (cpu.status.Z ? 0b00100 : 0) |
      (cpu.status.N ? 0b01000 : 0) |
      (cpu.status.X ? 0b10000 : 0)
    const result = op(ccr, immediate)
    cpu.status.C = (result & 0b00001) !== 0
    cpu.status.V = (result & 0b00010) !== 0
    cpu.status.Z = (result & 0b00100) !== 0
    cpu.status.N = (result & 0b01000) !== 0
    cpu.status.X = (result & 0b10000) !== 0

    return 20
  }
}

const ANDI_TO_CCR: OpcodeDefinition = {
  mnemonic: 'ANDI',
  encoding: '0000001000111100',
  size: 'byte',
  handler: logicalToCcrHandler((ccr, imm) => ccr & imm),
}

const ORI_TO_CCR: OpcodeDefinition = {
  mnemonic: 'ORI',
  encoding: '0000000000111100',
  size: 'byte',
  handler: logicalToCcrHandler((ccr, imm) => ccr | imm),
}

const EORI_TO_CCR: OpcodeDefinition = {
  mnemonic: 'EORI',
  encoding: '0000101000111100',
  size: 'byte',
  handler: logicalToCcrHandler((ccr, imm) => ccr ^ imm),
}

const CMPI: OpcodeDefinition = {
  mnemonic: 'CMPI',
  encoding: '00001100ssmmmrrr',
  size: 'variable',
  encode: immToEa(0x0c00),
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const decoded = decodeImmediateAndEa(cpu, memory, opcodeWordOf(args))
    if (!decoded) return 34
    const { immediate, ea, size, isRegisterDest } = decoded

    const { flags } = subWithFlags(ea.read(), immediate, size)

    cpu.status.N = flags.N
    cpu.status.Z = flags.Z
    cpu.status.V = flags.V
    cpu.status.C = flags.C
    // Real 68000 CMPI leaves X untouched, same as CMP.

    if (isRegisterDest) return size === 'long' ? 14 : 8
    return size === 'long' ? 20 : 12
  },
}

const NOT: OpcodeDefinition = {
  mnemonic: 'NOT',
  encode: unary(0x4600),
  encoding: '01000110ssmmmrrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const size = decodeByteWordLongSize((opcodeWord >> 6) & 0b11)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    if (mode === 0b001) {
      // Reserved encoding, same as CLR/NEG/TST below - see CLR's comment.
      raiseException(cpu, memory, ILLEGAL_INSTRUCTION_VECTOR, 'Illegal Instruction')
      return 34
    }

    const ea = decodeEA(cpu, memory, mode, reg, size)
    const result = ~ea.read()
    ea.write(result)

    updateFlags(cpu, result, size)
    cpu.status.V = false
    cpu.status.C = false

    return 4
  },
}

// --- MOVE SR,<ea> ($40C0-$40FF) - read back the flags as a word --------
//
// Real 68000: reads the full 16-bit SR (supervisor bit, interrupt mask,
// trace bit, and the CCR low byte). This emulator only ever models the
// CCR half - see docs/OPCODES.md's "Why doesn't this emulator implement
// RTE/STOP/RESET/MOVE SR?" - so the high byte here is always 0 rather
// than reporting fictional supervisor-mode state. Not privileged on the
// real MC68000 this codebase targets (that only started with the 68010),
// so it's implemented like any other data-movement instruction.
//
// Shares NEGX's `$4000`-`$40FF` byte at the bit level, reusing the
// reserved size=`11` slot NEGX's own byte/word/long encoding never
// produces - same trick EXT/MOVEM and TAS/TST use - so this narrower
// entry has to be listed before NEGX's broader one in opcodeTable.

const MOVE_FROM_SR: OpcodeDefinition = {
  mnemonic: 'MOVE',
  encoding: '0100000011mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    const ea = decodeEA(cpu, memory, mode, reg, 'word')
    const ccr =
      (cpu.status.C ? 0b00001 : 0) |
      (cpu.status.V ? 0b00010 : 0) |
      (cpu.status.Z ? 0b00100 : 0) |
      (cpu.status.N ? 0b01000 : 0) |
      (cpu.status.X ? 0b10000 : 0)
    ea.write(ccr)

    return mode === 0b000 ? 6 : 8
  },
}

// --- NEGX <ea> ($4000) - dst = 0 - dst - X, ADDX/SUBX's single-operand --
//
// sibling: same "extend" chaining as ADDX/SUBX (X threaded in, Z cleared
// on a non-zero result but left alone on zero - see ADDX/SUBX above),
// applied to NEG's one-operand shape instead of a register/predecrement
// pair. Reuses subExtend with a literal 0 as the "destination" being
// subtracted from, the same way NEG reuses subWithFlags(0, ...).
//
// Cycles: flat 4, matching CLR/NEG/NOT/TST's own established
// simplification for this exact family - real hardware's per-size/
// per-mode split (4/6 register, 8/12 memory) isn't modeled by any of
// those four either, so NEGX stays consistent with its immediate
// siblings rather than introducing new precision unilaterally.

const NEGX: OpcodeDefinition = {
  mnemonic: 'NEGX',
  encode: unary(0x4000),
  encoding: '01000000ssmmmrrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const size = decodeByteWordLongSize((opcodeWord >> 6) & 0b11)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    const ea = decodeEA(cpu, memory, mode, reg, size)
    const x = cpu.status.X ? 1 : 0
    const { result, flags } = subExtend(0, ea.read(), x, size)
    ea.write(result)

    cpu.status.N = flags.N
    cpu.status.V = flags.V
    cpu.status.C = flags.C
    cpu.status.X = flags.X
    if (result !== 0) cpu.status.Z = false

    return 4
  },
}

// --- CLR <ea> ($4200) -----------------------------------------------------
//
// `An` direct is a reserved encoding here on real hardware, same as
// `BTST`/`CHK`/`TAS`/`NBCD` - explicitly rejected below rather than
// silently treating `An` as an ordinary writable register the way this
// handler used to.

const CLR: OpcodeDefinition = {
  mnemonic: 'CLR',
  encode: unary(0x4200),
  encoding: '01000010ssmmmrrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const size = decodeByteWordLongSize((opcodeWord >> 6) & 0b11)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    if (mode === 0b001) {
      raiseException(cpu, memory, ILLEGAL_INSTRUCTION_VECTOR, 'Illegal Instruction')
      return 34
    }

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
  encode: (ops) => (ops.length === 1 && ops[0].kind === 'dn' ? [0x4840 | ops[0].n] : null),
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
  encode: (ops, size) =>
    ops.length === 1 && ops[0].kind === 'dn' && size !== 'byte' ? [(size === 'long' ? 0x48c0 : 0x4880) | ops[0].n] : null,
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

// --- MOVE <ea>,CCR ($44C0-$44FF) - load the flags from a word ----------
//
// Reads a word from `<ea>` and sets the 5 flags from its low 5 bits
// (X,N,Z,V,C from bit4 down to bit0 - the real 68000 CCR bit layout),
// ignoring the rest. Never privileged on any 68000-family part, unlike
// `MOVE <ea>,SR` (not implemented - see docs/OPCODES.md's "Why doesn't
// this emulator implement RTE/STOP/RESET/MOVE SR?").
//
// Shares NEG's `$4400`-`$44FF` byte, reusing the reserved size=`11` slot
// the same way `MOVE SR,<ea>` reuses NEGX's - this narrower entry has to
// be listed before NEG's broader one in opcodeTable.

const MOVE_TO_CCR: OpcodeDefinition = {
  mnemonic: 'MOVE',
  encoding: '0100010011mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    const ea = decodeEA(cpu, memory, mode, reg, 'word')
    const ccr = ea.read()
    cpu.status.C = (ccr & 0b00001) !== 0
    cpu.status.V = (ccr & 0b00010) !== 0
    cpu.status.Z = (ccr & 0b00100) !== 0
    cpu.status.N = (ccr & 0b01000) !== 0
    cpu.status.X = (ccr & 0b10000) !== 0

    return 12
  },
}

// --- NEG <ea> ($4400) - dst = 0 - dst, full flags (unlike CLR/NOT) -------

const NEG: OpcodeDefinition = {
  mnemonic: 'NEG',
  encode: unary(0x4400),
  encoding: '01000100ssmmmrrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const size = decodeByteWordLongSize((opcodeWord >> 6) & 0b11)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    if (mode === 0b001) {
      // Reserved encoding, same as CLR above/TST below - see CLR's comment.
      raiseException(cpu, memory, ILLEGAL_INSTRUCTION_VECTOR, 'Illegal Instruction')
      return 34
    }

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

// --- NBCD <ea> ($4800-$483F) - negate a packed-BCD byte with extend -----
//
// `NBCD`'s the single-operand sibling of `ABCD`/`SBCD`: `dst = 0 - dst -
// X`, packed BCD, reusing the same `bcdSub` helper (negation is just
// subtraction from zero). Real 68000 detail this reproduces for free by
// reusing `bcdSub` rather than writing a separate negate path: `NBCD` on
// a zero byte with `X` set doesn't stay zero - it borrows, producing
// `$99` with the carry set - which is exactly what propagates a borrow
// through a multi-byte chain (negate the low byte first, then each
// higher byte's `NBCD` sees the previous byte's borrow via `X`).
//
// Lands in a fresh slot in the `$48xx` byte (no `EXT`/`MOVEM`/`SWAP`/
// `PEA`-style opcodeTable-ordering trick needed here, unlike its
// neighbors in that same byte). `An` direct is rejected as a reserved
// encoding, same as `BTST`/`CHK`/`TAS`.

const NBCD: OpcodeDefinition = {
  mnemonic: 'NBCD',
  encode: unary(0x4800, false),
  encoding: '0100100000mmmrrr',
  size: 'byte',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    if (mode === 0b001) {
      raiseException(cpu, memory, ILLEGAL_INSTRUCTION_VECTOR, 'Illegal Instruction')
      return 34
    }

    const ea = decodeEA(cpu, memory, mode, reg, 'byte')

    const x = cpu.status.X ? 1 : 0
    const { result, carry } = bcdSub(ea.read(), 0, x)
    ea.write(result)

    cpu.status.X = carry === 1
    cpu.status.C = carry === 1
    if (result !== 0) cpu.status.Z = false

    return mode === 0b000 ? 6 : 8
  },
}

// --- TST <ea> ($4A00) - like CMP against 0, doesn't write back ------------

const TST: OpcodeDefinition = {
  mnemonic: 'TST',
  encode: unary(0x4a00),
  encoding: '01001010ssmmmrrr',
  size: 'variable',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const size = decodeByteWordLongSize((opcodeWord >> 6) & 0b11)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    if (mode === 0b001) {
      // Reserved encoding, same as CLR/NEG above - see CLR's comment.
      raiseException(cpu, memory, ILLEGAL_INSTRUCTION_VECTOR, 'Illegal Instruction')
      return 34
    }

    const ea = decodeEA(cpu, memory, mode, reg, size)

    updateFlags(cpu, ea.read(), size)
    cpu.status.V = false
    cpu.status.C = false

    return 4
  },
}

// --- ILLEGAL ($4AFC) ------------------------------------------------------
//
// A deliberately-reserved opcode: real 68000 hardware guarantees it always
// raises the Illegal Instruction exception, unlike an ordinary unimplemented
// opcode (which this emulator's own step() rejects with a plain JS error
// instead of a CPU exception - see docs/MEMORY.md). Useful as an explicit,
// portable "trap here" marker, rather than relying on whatever an
// actually-unassigned opcode happens to do.
//
// Shares TAS's `$4AC0`-`$4AFF` opcode space at the bit level: mode=111,
// reg=100 (#imm - invalid as TAS's own write destination, since you can't
// test-and-set an immediate) is exactly `$4AFC`. Real 68000 hardware
// carves that one otherwise-reserved combination out for ILLEGAL
// specifically, so this narrower, exact-match entry has to be listed
// before TAS's broader one in opcodeTable for that reason (same trick
// SWAP/PEA and EXT/MOVEM use) - which also fixes a latent bug: without it,
// this word reached TAS's handler and threw decodeEA's generic
// "Cannot write to an immediate operand" error instead of a clean,
// catchable Illegal Instruction exception.

const ILLEGAL: OpcodeDefinition = {
  mnemonic: 'ILLEGAL',
  encode: fixed(0x4afc),
  encoding: '0100101011111100',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory) => {
    raiseException(cpu, memory, ILLEGAL_INSTRUCTION_VECTOR, 'Illegal Instruction')
    return 34
  },
}

// --- TAS <ea> ($4AC0-$4AFF) - test and set an operand -------------------
//
// Reads a byte, sets flags exactly like TST.B would (N/Z from the value,
// V/C cleared, X untouched), then writes the value back with bit 7 forced
// to 1 - a "busy" flag other code can poll via a plain TST/BTST later. On
// real 68000 hardware the read-modify-write is one indivisible bus cycle
// (the whole point, for a multiprocessor mutex/semaphore); this emulator
// has no concurrency to race against, so a plain read-then-write already
// behaves identically.
//
// Shares TST's `$4A00`-`$4AFF` byte, reusing the size=11 bits TST's own
// byte/word/long encoding never produces (decodeByteWordLongSize only
// defines 00/01/10) - same "reserved size slot" trick EXT/MOVEM and the
// `<ea>` shift/rotate memory form use, so this narrower entry has to be
// listed before TST's broader one in opcodeTable.
//
// `An` direct is a genuinely reserved encoding here (there's no such
// thing as test-and-setting an address register), rejected the same way
// BTST/CHK reject it. `#imm` and PC-relative aren't excluded explicitly -
// decodeEA's own write()-throws already catches those, same as every
// other memory-alterable instruction in this file.

const TAS: OpcodeDefinition = {
  mnemonic: 'TAS',
  encode: unary(0x4ac0, false),
  encoding: '0100101011mmmrrr',
  size: 'byte',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    if (mode === 0b001) {
      raiseException(cpu, memory, ILLEGAL_INSTRUCTION_VECTOR, 'Illegal Instruction')
      return 34
    }

    const ea = decodeEA(cpu, memory, mode, reg, 'byte')
    const value = ea.read()

    updateFlags(cpu, value, 'byte')
    cpu.status.V = false
    cpu.status.C = false

    ea.write(value | 0x80)

    return mode === 0b000 ? 4 : 14
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
  encode: shiftReg(0xe100),
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
  encode: shiftReg(0xe000),
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
  encode: shiftReg(0xe108),
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
  encode: shiftReg(0xe008),
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
  encode: shiftReg(0xe118),
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
  encode: shiftReg(0xe018),
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
  encode: shiftReg(0xe110),
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
  encode: shiftReg(0xe010),
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

function decodeMemAlterableEA(cpu: CPUState, memory: Memory, mode: number, reg: number, size: Size = 'word') {
  if (mode === 0b000 || mode === 0b001) {
    raiseException(cpu, memory, ILLEGAL_INSTRUCTION_VECTOR, 'Illegal Instruction')
    return null
  }
  return decodeEA(cpu, memory, mode, reg, size)
}

const ASL_MEM: OpcodeDefinition = {
  mnemonic: 'ASL',
  encode: shiftMem(0xe1c0),
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
  encode: shiftMem(0xe0c0),
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
  encode: shiftMem(0xe3c0),
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
  encode: shiftMem(0xe2c0),
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
  encode: shiftMem(0xe7c0),
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
  encode: shiftMem(0xe6c0),
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
  encode: shiftMem(0xe5c0),
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
  encode: shiftMem(0xe4c0),
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

// --- CHK <ea>,Dn ($4180-$41FF, mode=001/An excluded - reserved) ---------
//
// Bounds-checks Dn's low word as a signed value against the range
// `0` to `<ea>` (also read as a signed word, the upper bound): out of
// range either way raises the CHK exception instead of falling through,
// the same vector-table mechanism DIVU/DIVS's Zero Divide and reserved
// encodings' Illegal Instruction already use (see raiseException above
// and CHK_VECTOR in src/memory/index.ts). Word-only on real 68000 - no
// size field is left in the opcode once `<ea>` and `Dn` are encoded.
// `An` direct (mode=001) isn't a data operand at all here (there's no
// such thing as bounds-checking against/with an address register), so
// it's a genuinely reserved encoding - rejected the same way BTST
// rejects it as a destination.
//
// N is the one flag Motorola actually documents: set when Dn is
// negative, cleared when Dn exceeds the bound (both trap cases), left
// alone when Dn is in range - Z/V/C are undefined on real hardware in
// every case, so they're simply not touched here either.

const CHK: OpcodeDefinition = {
  mnemonic: 'CHK',
  encode: dataToDn(0x4180, false),
  encoding: '0100ddd110mmmrrr',
  size: 'word',
  handler: (cpu: CPUState, memory: Memory, args: unknown[]) => {
    const opcodeWord = opcodeWordOf(args)
    const destReg = (Register.D0 + ((opcodeWord >> 9) & 0b111)) as Register
    const mode = (opcodeWord >> 3) & 0b111
    const reg = opcodeWord & 0b111

    if (mode === 0b001) {
      raiseException(cpu, memory, ILLEGAL_INSTRUCTION_VECTOR, 'Illegal Instruction')
      return 34
    }

    const bound = toSigned16(decodeEA(cpu, memory, mode, reg, 'word').read())
    const value = toSigned16(readRegister(cpu, destReg, 'word'))

    if (value < 0) {
      cpu.status.N = true
      raiseException(cpu, memory, CHK_VECTOR, 'CHK')
      return 40
    }

    if (value > bound) {
      cpu.status.N = false
      raiseException(cpu, memory, CHK_VECTOR, 'CHK')
      return 40
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
  // TRAP #1: print string. A0 = address of a null-terminated ASCII string,
  // D0 = x, D1 = y (pixel position of the first glyph's top-left), D2 =
  // 32-bit RGBA foreground color. See src/graphics/font.ts.
  1: (cpu, memory) => {
    drawString(
      memory,
      readRegister(cpu, Register.A0, 'long'),
      readRegister(cpu, Register.D0, 'long'),
      readRegister(cpu, Register.D1, 'long'),
      readRegister(cpu, Register.D2, 'long'),
    )
  },
  // TRAP #2: read pixel. A0 = the pixel's framebuffer address (the caller
  // computes it - see docs/MEMORY.md's "Calculating Pixel Address" - the
  // same $40000+(y*320+x)*4 formula MOVE.L (A0,Dn) already uses directly).
  // D0 <- the 32-bit RGBA color there. A convenience wrapper around a
  // plain MOVE.L, exactly like TRAP #5 below, not a new access path.
  2: (cpu, memory) => {
    const address = readRegister(cpu, Register.A0, 'long')
    writeRegister(cpu, Register.D0, memory.read32(address), 'long')
  },
  // TRAP #3: write pixel. A0 = framebuffer address (same convention as
  // TRAP #2), D0 = 32-bit RGBA color to write there.
  3: (cpu, memory) => {
    const address = readRegister(cpu, Register.A0, 'long')
    memory.write32(address, readRegister(cpu, Register.D0, 'long'))
  },
  // TRAP #4: clear screen. D0 = 32-bit RGBA color to fill every pixel
  // with (not just always black - lets a program clear to any solid
  // color in one call instead of writing all 64,000 pixels by hand).
  4: (cpu, memory) => {
    const color = readRegister(cpu, Register.D0, 'long')
    for (let address = FRAMEBUFFER_START; address <= FRAMEBUFFER_END; address += FRAMEBUFFER_BYTES_PER_PIXEL) {
      memory.write32(address, color)
    }
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
  encode: (ops, _size, ctx) => {
    if (ops.length !== 1 || ops[0].kind !== 'imm') return null
    const n = ctx.eval(ops[0].expr)
    if (ctx.final && (n < 0 || n > 15)) throw new Error(`TRAP vector ${n} out of range (0..15)`)
    return [0x4e40 | (n & 0xf)]
  },
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
  { mask: 0xffc0, pattern: 0x0840, definition: BCHG },
  { mask: 0xffc0, pattern: 0x0880, definition: BCLR },
  { mask: 0xffc0, pattern: 0x08c0, definition: BSET },
  { mask: 0xf138, pattern: 0x0108, definition: MOVEP },
  { mask: 0xf1c0, pattern: 0x0100, definition: BTST_DYNAMIC },
  { mask: 0xf1c0, pattern: 0x0140, definition: BCHG_DYNAMIC },
  { mask: 0xf1c0, pattern: 0x0180, definition: BCLR_DYNAMIC },
  { mask: 0xf1c0, pattern: 0x01c0, definition: BSET_DYNAMIC },
  { mask: 0xffff, pattern: 0x003c, definition: ORI_TO_CCR },
  { mask: 0xffff, pattern: 0x023c, definition: ANDI_TO_CCR },
  { mask: 0xffff, pattern: 0x0a3c, definition: EORI_TO_CCR },
  { mask: 0xff00, pattern: 0x0000, definition: ORI },
  { mask: 0xff00, pattern: 0x0200, definition: ANDI },
  { mask: 0xff00, pattern: 0x0400, definition: SUBI },
  { mask: 0xff00, pattern: 0x0600, definition: ADDI },
  { mask: 0xff00, pattern: 0x0a00, definition: EORI },
  { mask: 0xff00, pattern: 0x0c00, definition: CMPI },
  { mask: 0xff00, pattern: 0x4600, definition: NOT },
  { mask: 0xffc0, pattern: 0x40c0, definition: MOVE_FROM_SR },
  { mask: 0xff00, pattern: 0x4000, definition: NEGX },
  { mask: 0xff00, pattern: 0x4200, definition: CLR },
  { mask: 0xffc0, pattern: 0x44c0, definition: MOVE_TO_CCR },
  { mask: 0xff00, pattern: 0x4400, definition: NEG },
  { mask: 0xffc0, pattern: 0x4800, definition: NBCD },
  { mask: 0xffff, pattern: 0x4afc, definition: ILLEGAL },
  { mask: 0xffc0, pattern: 0x4ac0, definition: TAS },
  { mask: 0xff00, pattern: 0x4a00, definition: TST },
  { mask: 0xfff8, pattern: 0x4840, definition: SWAP },
  { mask: 0xffc0, pattern: 0x4840, definition: PEA },
  { mask: 0xffb8, pattern: 0x4880, definition: EXT },
  { mask: 0xfb80, pattern: 0x4880, definition: MOVEM },
  { mask: 0xffff, pattern: 0x4e75, definition: RTS },
  { mask: 0xffff, pattern: 0x4e76, definition: TRAPV },
  { mask: 0xffff, pattern: 0x4e77, definition: RTR },
  { mask: 0xfff8, pattern: 0x4e50, definition: LINK },
  { mask: 0xfff8, pattern: 0x4e58, definition: UNLK },
  { mask: 0xffc0, pattern: 0x4e80, definition: JSR },
  { mask: 0xffc0, pattern: 0x4ec0, definition: JMP },
  { mask: 0xf1c0, pattern: 0x41c0, definition: LEA },
  { mask: 0xf1c0, pattern: 0x4180, definition: CHK },
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
  { mask: 0xf0c0, pattern: 0xd0c0, definition: ADDA },
  { mask: 0xf0c0, pattern: 0x90c0, definition: SUBA },
  { mask: 0xf0c0, pattern: 0xb0c0, definition: CMPA },
  { mask: 0xf100, pattern: 0xd000, definition: ADD },
  { mask: 0xf130, pattern: 0xd100, definition: ADDX },
  { mask: 0xf100, pattern: 0xd100, definition: ADD_MEM },
  { mask: 0xf100, pattern: 0x9000, definition: SUB },
  { mask: 0xf130, pattern: 0x9100, definition: SUBX },
  { mask: 0xf100, pattern: 0x9100, definition: SUB_MEM },
  { mask: 0xf100, pattern: 0xb000, definition: CMP },
  { mask: 0xf138, pattern: 0xb108, definition: CMPM },
  { mask: 0xf100, pattern: 0xb100, definition: XOR },
  { mask: 0xf1c0, pattern: 0xc0c0, definition: MULU },
  { mask: 0xf1c0, pattern: 0xc1c0, definition: MULS },
  { mask: 0xf1c0, pattern: 0x80c0, definition: DIVU },
  { mask: 0xf1c0, pattern: 0x81c0, definition: DIVS },
  { mask: 0xf100, pattern: 0xc000, definition: AND },
  { mask: 0xf100, pattern: 0x8000, definition: OR },
  { mask: 0xf1f0, pattern: 0xc100, definition: ABCD },
  { mask: 0xf1f0, pattern: 0x8100, definition: SBCD },
  { mask: 0xf1f8, pattern: 0xc100 | (EXG_DATA << 3), definition: EXG },
  { mask: 0xf1f8, pattern: 0xc100 | (EXG_ADDRESS << 3), definition: EXG },
  { mask: 0xf1f8, pattern: 0xc100 | (EXG_DATA_ADDRESS << 3), definition: EXG },
  { mask: 0xf100, pattern: 0xc100, definition: AND_MEM },
  { mask: 0xf100, pattern: 0x8100, definition: OR_MEM },
  { mask: 0xf100, pattern: 0x7000, definition: MOVEQ },
  { mask: 0xff00, pattern: 0x6100, definition: BSR },
  { mask: 0xf000, pattern: 0x6000, definition: Bcc },
  { mask: 0xf0f8, pattern: 0x50c8, definition: DBcc },
  { mask: 0xf0c0, pattern: 0x50c0, definition: Scc },
  { mask: 0xf100, pattern: 0x5000, definition: ADDQ },
  { mask: 0xf100, pattern: 0x5100, definition: SUBQ },
  { mask: 0xc000, pattern: 0x0000, definition: MOVE },
]
