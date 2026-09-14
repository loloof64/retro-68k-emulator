import type { Size } from './addressing'

export interface ArithmeticFlags {
  N: boolean
  Z: boolean
  V: boolean
  C: boolean
  X: boolean
}

function sizeMask(size: Size): number {
  return size === 'byte' ? 0xff : size === 'word' ? 0xffff : 0xffffffff
}

function signBitFor(size: Size): number {
  return size === 'byte' ? 0x80 : size === 'word' ? 0x8000 : 0x80000000
}

// `& 0xffffffff` is *not* the same as an unsigned 32-bit mask in JS: `&`
// always produces a signed int32, so e.g. `0xffffffff & 0xffffffff` is -1,
// not 4294967295. That's harmless for pure bit-pattern checks (sign/zero
// tests below don't care about the sign of the JS number), but it corrupts
// the actual magnitude used in `sum`/`carry`'s arithmetic — hence `>>> 0`
// for the long case here instead of `& mask`.
function toUnsigned(value: number, size: Size): number {
  return size === 'long' ? value >>> 0 : value & sizeMask(size)
}

// Binary addition with real 68000 flag semantics. Uses plain JS numbers —
// safe here since both operands are already masked to `size`, so their sum
// never exceeds 2^33, well within double-precision integer range.
export function addWithFlags(a: number, b: number, size: Size): { result: number; flags: ArithmeticFlags } {
  const mask = sizeMask(size)
  const signBit = signBitFor(size)

  const ua = toUnsigned(a, size)
  const ub = toUnsigned(b, size)
  const sum = ua + ub
  const result = sum & mask

  const aSign = (ua & signBit) !== 0
  const bSign = (ub & signBit) !== 0
  const rSign = (result & signBit) !== 0

  const carry = sum > mask
  const overflow = aSign === bSign && rSign !== aSign

  return {
    result,
    // ADD sets X the same as C (real 68000 behavior).
    flags: { N: rSign, Z: result === 0, V: overflow, C: carry, X: carry },
  }
}

// Binary subtraction (a - b) with real 68000 flag semantics. Shared by SUB
// (which stores the result) and CMP (which only sets flags — callers that
// don't want X touched, per real 68000 CMP behavior, just ignore it).
export function subWithFlags(a: number, b: number, size: Size): { result: number; flags: ArithmeticFlags } {
  const mask = sizeMask(size)
  const signBit = signBitFor(size)

  const ua = toUnsigned(a, size)
  const ub = toUnsigned(b, size)
  const diff = ua - ub
  const result = diff & mask

  const aSign = (ua & signBit) !== 0
  const bSign = (ub & signBit) !== 0
  const rSign = (result & signBit) !== 0

  const borrow = ua < ub
  const overflow = aSign !== bSign && rSign !== aSign

  return {
    result,
    // SUB sets X the same as C (real 68000 behavior); CMP leaves X alone.
    flags: { N: rSign, Z: result === 0, V: overflow, C: borrow, X: borrow },
  }
}
