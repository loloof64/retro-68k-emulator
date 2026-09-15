import { Register, type CPUState, type Memory } from '../types/cpu'
import { readRegister, writeRegister, type Size } from './index'

export type { Size }

export interface EffectiveAddress {
  read(): number
  write(value: number): void
}

function memoryEA(memory: Memory, address: number, size: Size): EffectiveAddress {
  return {
    read: () =>
      size === 'byte' ? memory.read8(address) : size === 'word' ? memory.read16(address) : memory.read32(address),
    write: (value) => {
      if (size === 'byte') memory.write8(address, value)
      else if (size === 'word') memory.write16(address, value)
      else memory.write32(address, value)
    },
  }
}

// A7 stays word-aligned even for byte-size (An)+/-(An), like real 68000.
function stepFor(size: Size, reg: number): number {
  if (size === 'long') return 4
  if (size === 'word') return 2
  return reg === 7 ? 2 : 1
}

// A memoryEA whose write() throws — for operands the 68000 only allows as a
// source (PC-relative modes, like #imm, can't be a destination).
function readOnlyEA(memory: Memory, address: number, size: Size): EffectiveAddress {
  const ea = memoryEA(memory, address, size)
  return {
    read: ea.read,
    write: () => {
      throw new Error('Cannot write to a PC-relative operand')
    },
  }
}

// Decodes the brief extension word shared by the indexed modes (Address
// Register Indirect with Index, and PC Indirect with Index) and returns the
// resulting address: base + Xn (sign-extended word, or full long) + d8.
// This is the 68000 "brief" format only — no scale factor, no full extension
// word (that's 68020+).
function decodeIndexedAddress(cpu: CPUState, memory: Memory, base: number): number {
  const ext = memory.read16(cpu.pc)
  cpu.pc += 2

  const xnIsAddressReg = (ext & 0x8000) !== 0
  const xnNum = (ext >> 12) & 0b111
  const xnIsLong = (ext & 0x0800) !== 0
  const displacement = (ext << 24) >> 24 // sign-extend the low 8 bits

  const xnRegister = ((xnIsAddressReg ? Register.A0 : Register.D0) + xnNum) as Register
  const xnRaw = readRegister(cpu, xnRegister, xnIsLong ? 'long' : 'word')
  const xnValue = xnIsLong ? xnRaw : (xnRaw << 16) >> 16

  return (base + xnValue + displacement) >>> 0
}

// Decodes a standard 6-bit effective address (3-bit mode + 3-bit register),
// consuming any extension words it needs from memory at cpu.pc as it goes —
// so callers just decode source then destination, in that order, and PC
// ends up past everything by the time the instruction is done.
//
// Supported so far: Dn, An, (An), (An)+, -(An), #imm (source only),
// absolute short/long, indexed (An,Xn), and PC-relative (d16(PC) and
// (PC,Xn)).
export function decodeEA(cpu: CPUState, memory: Memory, mode: number, reg: number, size: Size): EffectiveAddress {
  switch (mode) {
    case 0b000: {
      const dataReg = reg as Register
      return {
        read: () => readRegister(cpu, dataReg, size),
        write: (value) => writeRegister(cpu, dataReg, value, size),
      }
    }

    case 0b001: {
      const addrReg = (Register.A0 + reg) as Register
      return {
        read: () => readRegister(cpu, addrReg, size),
        write: (value) => writeRegister(cpu, addrReg, value, size),
      }
    }

    case 0b010: {
      const addrReg = (Register.A0 + reg) as Register
      return memoryEA(memory, readRegister(cpu, addrReg, 'long'), size)
    }

    case 0b011: {
      const addrReg = (Register.A0 + reg) as Register
      const address = readRegister(cpu, addrReg, 'long')
      const ea = memoryEA(memory, address, size)
      writeRegister(cpu, addrReg, address + stepFor(size, reg), 'long')
      return ea
    }

    case 0b100: {
      const addrReg = (Register.A0 + reg) as Register
      const address = readRegister(cpu, addrReg, 'long') - stepFor(size, reg)
      writeRegister(cpu, addrReg, address, 'long')
      return memoryEA(memory, address, size)
    }

    case 0b110: {
      // Address Register Indirect with Index (8-Bit Displacement Mode):
      // d8(An,Xn) — a normal, writable memory operand.
      const addrReg = (Register.A0 + reg) as Register
      const base = readRegister(cpu, addrReg, 'long')
      const address = decodeIndexedAddress(cpu, memory, base)
      return memoryEA(memory, address, size)
    }

    case 0b111:
      if (reg === 0b000) {
        // Absolute Short: 16-bit extension word, sign-extended to a full
        // address — reaches only $0000-$7FFF (or, on real hardware, the
        // very top of the address space via the negative half; this
        // emulator's memory is far smaller than that, so a negative value
        // here just means "out of bounds").
        const raw = memory.read16(cpu.pc)
        cpu.pc += 2
        const address = (raw << 16) >> 16
        return memoryEA(memory, address, size)
      }
      if (reg === 0b001) {
        // Absolute Long: a full 32-bit extension address, unsigned.
        const address = memory.read32(cpu.pc)
        cpu.pc += 4
        return memoryEA(memory, address, size)
      }
      if (reg === 0b010) {
        // PC Indirect with Displacement: d16(PC) — the displacement is
        // relative to the address of the extension word itself, per the
        // 68000's definition of "PC" in this mode. Read-only, like every
        // PC-relative mode.
        const base = cpu.pc
        const raw = memory.read16(cpu.pc)
        cpu.pc += 2
        const displacement = (raw << 16) >> 16
        const address = (base + displacement) >>> 0
        return readOnlyEA(memory, address, size)
      }
      if (reg === 0b011) {
        // PC Indirect with Index (8-Bit Displacement Mode): d8(PC,Xn).
        // Same brief extension word as mode 6, but based on PC instead of An.
        const base = cpu.pc
        const address = decodeIndexedAddress(cpu, memory, base)
        return readOnlyEA(memory, address, size)
      }
      if (reg === 0b100) {
        // #imm — byte immediates are still stored as a full word, low byte used.
        const raw = size === 'long' ? memory.read32(cpu.pc) : memory.read16(cpu.pc)
        cpu.pc += size === 'long' ? 4 : 2
        const value = size === 'byte' ? raw & 0xff : raw
        return {
          read: () => value,
          write: () => {
            throw new Error('Cannot write to an immediate operand')
          },
        }
      }
      throw new Error(`Unsupported addressing mode: mode=7 reg=${reg}`)

    default:
      throw new Error(`Unsupported addressing mode: mode=${mode} reg=${reg}`)
  }
}
