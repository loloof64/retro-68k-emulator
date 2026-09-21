import { beforeEach, describe, expect, it } from 'vitest'
import { nextBookmark, readMarks, writeMarks } from './marks'

const mem = new Map<string, string>()
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
}
beforeEach(() => mem.clear())

describe('readMarks / writeMarks', () => {
  it('round-trips per exact path', () => {
    writeMarks('/a/Prog.asm', { bookmarks: new Set([2, 5]), breakpoints: new Set([3]) }, storage)
    expect([...readMarks('/a/Prog.asm', 10, storage).bookmarks]).toEqual([2, 5])
    expect([...readMarks('/a/Prog.asm', 10, storage).breakpoints]).toEqual([3])
  })
  it('is case- and location-sensitive', () => {
    writeMarks('/a/Prog.asm', { bookmarks: new Set([1]), breakpoints: new Set() }, storage)
    expect(readMarks('/a/prog.asm', 10, storage).bookmarks.size).toBe(0)
    expect(readMarks('/b/Prog.asm', 10, storage).bookmarks.size).toBe(0)
  })
  it('keeps other files untouched', () => {
    writeMarks('/a', { bookmarks: new Set([1]), breakpoints: new Set() }, storage)
    writeMarks('/b', { bookmarks: new Set([2]), breakpoints: new Set() }, storage)
    expect([...readMarks('/a', 10, storage).bookmarks]).toEqual([1])
  })
  it('drops lines past the end of the file', () => {
    writeMarks('/a', { bookmarks: new Set([2, 50]), breakpoints: new Set([0, 3]) }, storage)
    const m = readMarks('/a', 10, storage)
    expect([...m.bookmarks]).toEqual([2])
    expect([...m.breakpoints]).toEqual([3])
  })
  it('survives corrupt storage', () => {
    mem.set('retro68k.marks', '{oops')
    expect(readMarks('/a', 10, storage).bookmarks.size).toBe(0)
  })
})

describe('nextBookmark', () => {
  const b = new Set([3, 8])
  it('goes forward and backward', () => {
    expect(nextBookmark(b, 1, 1)).toBe(3)
    expect(nextBookmark(b, 3, 1)).toBe(8)
    expect(nextBookmark(b, 8, -1)).toBe(3)
  })
  it('wraps around', () => {
    expect(nextBookmark(b, 8, 1)).toBe(3)
    expect(nextBookmark(b, 3, -1)).toBe(8)
  })
  it('returns undefined without bookmarks', () => {
    expect(nextBookmark(new Set(), 1, 1)).toBeUndefined()
  })
})
