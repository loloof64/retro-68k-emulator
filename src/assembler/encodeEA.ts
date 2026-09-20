import type { EncodeContext, Operand, Size } from './types'

export const CONDITIONS: Record<string, number> = {
  T: 0, F: 1, HI: 2, LS: 3, CC: 4, HS: 4, CS: 5, LO: 5, NE: 6, EQ: 7,
  VC: 8, VS: 9, PL: 10, MI: 11, GE: 12, LT: 13, GT: 14, LE: 15,
}

export const sizeBits = (size: Size): number => (size === 'byte' ? 0 : size === 'word' ? 1 : 2)

function checkRange(value: number, min: number, max: number, what: string, final: boolean): void {
  if (final && (value < min || value > max)) throw new Error(`${what} ${value} out of range (${min}..${max})`)
}

// Immediate extension words: a byte is still stored as a full word (low byte).
export function immWords(value: number, size: Size, final: boolean): number[] {
  if (size === 'long') return [(value >>> 16) & 0xffff, value & 0xffff]
  if (size === 'byte') checkRange(value, -128, 255, 'Byte immediate', final)
  else checkRange(value, -32768, 65535, 'Word immediate', final)
  return [value & (size === 'byte' ? 0xff : 0xffff)]
}

export interface EncodedEA {
  field: number // 6 bits: mode << 3 | register
  ext: number[] // extension words, in order
}

// Mirror of decodeEA (src/cpu/addressing.ts) for the v1 modes.
export function encodeEA(op: Operand, size: Size, ctx: EncodeContext): EncodedEA {
  switch (op.kind) {
    case 'dn': return { field: op.n, ext: [] }
    case 'an': return { field: 0b001000 | op.n, ext: [] }
    case 'ind': return { field: 0b010000 | op.n, ext: [] }
    case 'post': return { field: 0b011000 | op.n, ext: [] }
    case 'pre': return { field: 0b100000 | op.n, ext: [] }
    case 'disp': {
      const d = ctx.eval(op.expr)
      checkRange(d, -32768, 32767, 'Displacement', ctx.final)
      return { field: 0b101000 | op.n, ext: [d & 0xffff] }
    }
    case 'abs': {
      const a = ctx.eval(op.expr) >>> 0
      return { field: 0b111001, ext: [a >>> 16, a & 0xffff] }
    }
    case 'imm':
      return { field: 0b111100, ext: immWords(ctx.eval(op.expr), size, ctx.final) }
  }
}

// Operand-class predicates, named after the 68000 manual's addressing categories.
export const isMemory = (o: Operand) => ['ind', 'post', 'pre', 'disp', 'abs'].includes(o.kind)
export const isDataAlterable = (o: Operand) => o.kind === 'dn' || isMemory(o)
export const isControl = (o: Operand) => ['ind', 'disp', 'abs'].includes(o.kind)
