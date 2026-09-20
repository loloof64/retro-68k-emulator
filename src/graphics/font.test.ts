import { describe, it, expect } from 'vitest'
import { SystemMemory } from '../memory'
import { FRAMEBUFFER_BYTES_PER_PIXEL, FRAMEBUFFER_START, FRAMEBUFFER_WIDTH } from '../memory'
import { drawChar, drawString } from './font'

const px = (m: SystemMemory, x: number, y: number) =>
  m.read32(FRAMEBUFFER_START + (y * FRAMEBUFFER_WIDTH + x) * FRAMEBUFFER_BYTES_PER_PIXEL)

const put = (m: SystemMemory, s: string) => {
  Array.from(s + '\0').forEach((c, i) => m.write8(0x3000 + i, c.charCodeAt(0)))
}

describe('drawChar / drawString', () => {
  it('draws only on-bits, leaves other pixels alone', () => {
    const m = new SystemMemory()
    drawChar(m, 0x2e, 0, 0, 1) // '.' = rows 5,6 = 0x0C -> x=2,3
    expect(px(m, 2, 5)).toBe(1)
    expect(px(m, 3, 6)).toBe(1)
    expect(px(m, 1, 5)).toBe(0)
    expect(px(m, 4, 5)).toBe(0)
  })

  it('ignores bytes outside 0x20-0x7E', () => {
    const m = new SystemMemory()
    drawChar(m, 0x01, 0, 0, 1)
    drawChar(m, 0x7f, 0, 0, 1)
    expect(px(m, 2, 0)).toBe(0)
  })

  it('advances 8px per glyph and \\n starts a new line at x=0', () => {
    const m = new SystemMemory()
    put(m, '.\n.')
    drawString(m, 0x3000, 16, 0, 1)
    expect(px(m, 18, 5)).toBe(1) // first '.'
    expect(px(m, 2, 13)).toBe(1) // second '.', next line at x=0
  })

  it('wraps when a glyph would overflow the right edge', () => {
    const m = new SystemMemory()
    put(m, '..')
    drawString(m, 0x3000, 312, 0, 1)
    expect(px(m, 314, 5)).toBe(1)
    expect(px(m, 2, 13)).toBe(1)
  })

  it('throws past the bottom of the screen', () => {
    const m = new SystemMemory()
    expect(() => drawChar(m, 0x41, 0, 193, 1)).toThrow(/out of screen bounds/)
  })
})
