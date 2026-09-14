import { describe, it, expect } from 'vitest'
import {
  SystemMemory,
  FRAMEBUFFER_START,
  FRAMEBUFFER_WIDTH,
  MEMORY_SIZE,
  INPUT_START,
  INPUT_BUTTON_A,
  INPUT_BUTTON_UP,
} from './index'

describe('SystemMemory', () => {
  it('starts zeroed', () => {
    const mem = new SystemMemory()
    expect(mem.read8(0)).toBe(0)
    expect(mem.read32(0x2000)).toBe(0)
  })

  it('reads/writes a byte', () => {
    const mem = new SystemMemory()
    mem.write8(0x2000, 0xab)
    expect(mem.read8(0x2000)).toBe(0xab)
  })

  it('wraps out-of-range byte values', () => {
    const mem = new SystemMemory()
    mem.write8(0x2000, 0x1ff)
    expect(mem.read8(0x2000)).toBe(0xff)
  })

  it('reads/writes a big-endian word', () => {
    const mem = new SystemMemory()
    mem.write16(0x2000, 0xabcd)
    expect(mem.read16(0x2000)).toBe(0xabcd)
    expect(mem.read8(0x2000)).toBe(0xab)
    expect(mem.read8(0x2001)).toBe(0xcd)
  })

  it('reads/writes a big-endian long', () => {
    const mem = new SystemMemory()
    mem.write32(0x2000, 0x12345678)
    expect(mem.read32(0x2000)).toBe(0x12345678)
    expect(mem.read8(0x2000)).toBe(0x12)
    expect(mem.read8(0x2003)).toBe(0x78)
  })

  it('handles full 32-bit unsigned values without going negative', () => {
    const mem = new SystemMemory()
    mem.write32(0x2000, 0xffffffff)
    expect(mem.read32(0x2000)).toBe(0xffffffff)
  })

  it('throws on out-of-bounds access', () => {
    const mem = new SystemMemory()
    expect(() => mem.read8(-1)).toThrow(/out of bounds/)
    expect(() => mem.read8(MEMORY_SIZE)).toThrow(/out of bounds/)
    expect(() => mem.read32(MEMORY_SIZE - 1)).toThrow(/out of bounds/)
  })

  it('resets all memory to zero', () => {
    const mem = new SystemMemory()
    mem.write32(0x2000, 0xdeadbeef)
    mem.reset()
    expect(mem.read32(0x2000)).toBe(0)
  })

  describe('framebuffer', () => {
    it('maps getPixel/setPixel to the correct address', () => {
      const mem = new SystemMemory()
      mem.setPixel(50, 10, 0xffffffff)
      const offset = (10 * FRAMEBUFFER_WIDTH + 50) * 4
      expect(mem.read32(FRAMEBUFFER_START + offset)).toBe(0xffffffff)
      expect(mem.getPixel(50, 10)).toBe(0xffffffff)
    })

    it('exposes a live view via getFramebuffer', () => {
      const mem = new SystemMemory()
      mem.setPixel(0, 0, 0x11223344)
      const fb = mem.getFramebuffer()
      expect(fb[0]).toBe(0x11)
      expect(fb[1]).toBe(0x22)
      expect(fb[2]).toBe(0x33)
      expect(fb[3]).toBe(0x44)
    })
  })

  describe('controller input', () => {
    it('publishes and reads back a button state bitmask', () => {
      const mem = new SystemMemory()
      mem.setButtonState(INPUT_BUTTON_A | INPUT_BUTTON_UP)
      expect(mem.getButtonState()).toBe(INPUT_BUTTON_A | INPUT_BUTTON_UP)
      expect(mem.read32(INPUT_START)).toBe(INPUT_BUTTON_A | INPUT_BUTTON_UP)
    })

    it('is included in the addressable memory space', () => {
      expect(INPUT_START).toBeLessThan(MEMORY_SIZE)
    })
  })
})
