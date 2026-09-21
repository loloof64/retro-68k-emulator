import { describe, expect, it } from 'vitest'
import { MEMORY_SIZE } from './memory'
import { asciiChar, hex, parseAddress, windowBase, WINDOW_BYTES, ROW_BYTES } from './memoryView'

describe('memoryView', () => {
  it('parses hex addresses with or without prefix', () => {
    expect(parseAddress('2000')).toBe(0x2000)
    expect(parseAddress(' $2a00 ')).toBe(0x2a00)
    expect(parseAddress('0x40000')).toBe(0x40000)
    expect(parseAddress('zz')).toBeNull()
    expect(parseAddress('')).toBeNull()
  })

  it('aligns the window on a row and keeps it inside memory', () => {
    expect(windowBase(0x2005)).toBe(0x2000)
    expect(windowBase(0xffffffff)).toBeLessThanOrEqual(MEMORY_SIZE - WINDOW_BYTES)
    expect(windowBase(0xffffffff) % ROW_BYTES).toBe(0)
  })

  it('formats hex and ASCII', () => {
    expect(hex(0xab, 2)).toBe('AB')
    expect(hex(0x2000, 8)).toBe('00002000')
    expect(asciiChar(0x41)).toBe('A')
    expect(asciiChar(0x00)).toBe('.')
  })
})
