import { describe, it, expect } from 'vitest'
import { tabInsertText, shiftTab, enterInsertText } from './editorKeys'

describe('tabInsertText', () => {
  it('inserts spaces up to the next tab stop (column 0 -> 8)', () => {
    expect(tabInsertText('', 0)).toBe(' '.repeat(8))
  })

  it('inserts fewer spaces from a column already past 0 (column 6 -> 8)', () => {
    expect(tabInsertText('START:', 6)).toBe(' '.repeat(2))
  })

  it('computes the column from the current line only, not the whole text', () => {
    expect(tabInsertText('START:\nMOVE', 11)).toBe(' '.repeat(4))
  })
})

describe('shiftTab', () => {
  it('removes up to one tab stop of leading spaces from the current line', () => {
    const line = ' '.repeat(8) + 'MOVE.L'
    const r = shiftTab(line, 8, 8)
    expect(r.deleteStart).toBe(0)
    expect(r.deleteEnd).toBe(8)
    expect(r.cursorStart).toBe(0)
    expect(r.cursorEnd).toBe(0)
  })
})

describe('enterInsertText', () => {
  it("carries the current line's leading whitespace onto the new line", () => {
    const line = ' '.repeat(8) + 'MOVE.L D0,D1'
    expect(enterInsertText(line, line.length)).toBe('\n' + ' '.repeat(8))
  })
})
