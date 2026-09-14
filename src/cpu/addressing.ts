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

// Decodes a standard 6-bit effective address (3-bit mode + 3-bit register),
// consuming any extension words it needs from memory at cpu.pc as it goes —
// so callers just decode source then destination, in that order, and PC
// ends up past everything by the time the instruction is done.
//
// Supported so far: Dn, An, (An), (An)+, -(An), #imm (source only), and
// absolute short/long. Indexed and PC-relative modes aren't implemented yet.
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
