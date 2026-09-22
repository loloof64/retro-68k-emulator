import { describe, it, expect } from 'vitest'
import { handleTab, handleShiftTab, handleEnter } from './editorKeys'

describe('handleTab', () => {
  it('inserts spaces up to the next tab stop (column 0 -> 8)', () => {
    const r = handleTab('', 0, 0)
    expect(r.value).toBe(' '.repeat(8))
    expect(r.selectionStart).toBe(8)
    expect(r.selectionEnd).toBe(8)
  })

  it('inserts fewer spaces from a column already past 0 (column 6 -> 8)', () => {
    const r = handleTab('START:', 6, 6)
    expect(r.value).toBe('START:' + ' '.repeat(2))
    expect(r.selectionStart).toBe(8)
    expect(r.selectionEnd).toBe(8)
  })

  it('replaces a selection instead of inserting at the caret', () => {
    const r = handleTab('MOVE.L XX,D0', 7, 9)
    expect(r.value).toBe('MOVE.L  ,D0')
    expect(r.selectionStart).toBe(8)
    expect(r.selectionEnd).toBe(8)
  })

  it('computes the column from the current line only, not the whole text', () => {
    const r = handleTab('START:\nMOVE', 11, 11)
    expect(r.value).toBe('START:\nMOVE' + ' '.repeat(4))
    expect(r.selectionStart).toBe(15)
  })
})

describe('handleShiftTab', () => {
  it('removes up to one tab stop of leading spaces from the current line', () => {
    const line = ' '.repeat(8) + 'MOVE.L'
    const r = handleShiftTab(line, 8, 8)
    expect(r.value).toBe('MOVE.L')
    expect(r.selectionStart).toBe(0)
    expect(r.selectionEnd).toBe(0)
  })
})

describe('handleEnter', () => {
  it("carries the current line's leading whitespace onto the new line", () => {
    const line = ' '.repeat(8) + 'MOVE.L D0,D1'
    const r = handleEnter(line, line.length, line.length)
    expect(r.value).toBe(line + '\n' + ' '.repeat(8))
    expect(r.selectionStart).toBe(line.length + 9)
    expect(r.selectionEnd).toBe(line.length + 9)
  })
})
