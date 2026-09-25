import { describe, expect, it } from 'vitest'
import { findMatches, nextMatchIndex, prevMatchIndex } from './search'

describe('findMatches', () => {
  it('finds a single match with 1-based line and 0-based columns', () => {
    expect(findMatches('MOVE.L D0,D1', 'MOVE')).toEqual([{ line: 1, start: 0, end: 4 }])
  })
  it('finds matches across multiple lines', () => {
    const code = 'MOVE.L D0,D1\nADD.L D0,D1\nMOVE.W D2,D3'
    expect(findMatches(code, 'MOVE')).toEqual([
      { line: 1, start: 0, end: 4 },
      { line: 3, start: 0, end: 4 },
    ])
  })
  it('finds multiple matches on the same line', () => {
    expect(findMatches('D0,D0,D0', 'D0')).toEqual([
      { line: 1, start: 0, end: 2 },
      { line: 1, start: 3, end: 5 },
      { line: 1, start: 6, end: 8 },
    ])
  })
  it('is case-insensitive', () => {
    expect(findMatches('Move.L D0,D1', 'move')).toEqual([{ line: 1, start: 0, end: 4 }])
  })
  it('returns nothing for an empty query', () => {
    expect(findMatches('MOVE.L D0,D1', '')).toEqual([])
  })
  it('returns nothing when there is no match', () => {
    expect(findMatches('MOVE.L D0,D1', 'ZZZ')).toEqual([])
  })
})

describe('nextMatchIndex / prevMatchIndex', () => {
  it('advances forward and wraps around', () => {
    expect(nextMatchIndex(3, 0)).toBe(1)
    expect(nextMatchIndex(3, 2)).toBe(0)
  })
  it('goes backward and wraps around', () => {
    expect(prevMatchIndex(3, 1)).toBe(0)
    expect(prevMatchIndex(3, 0)).toBe(2)
  })
  it('stays undefined-safe with no matches', () => {
    expect(nextMatchIndex(0, 0)).toBe(0)
    expect(prevMatchIndex(0, 0)).toBe(0)
  })
})
