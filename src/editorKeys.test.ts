import { describe, it, expect } from 'vitest'
import { tabInsertText, shiftTab, enterInsertText, wholeLineClipboardText, wholeLineDeleteRange } from './editorKeys'

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

describe('wholeLineClipboardText', () => {
  it('returns the current line right-trimmed plus a trailing newline', () => {
    const value = 'START:\n  MOVE.L D0,D1   \nEND:'
    expect(wholeLineClipboardText(value, 10)).toBe('  MOVE.L D0,D1\n')
  })

  it('works on the last line even with no trailing newline in the source', () => {
    const value = 'START:\nEND:  '
    expect(wholeLineClipboardText(value, value.length)).toBe('END:\n')
  })
})

describe('wholeLineDeleteRange', () => {
  it('spans the line plus its own trailing newline, when one exists', () => {
    const value = 'AAA\nBBB\nCCC'
    // caret anywhere inside "BBB" (offsets 4-6)
    const r = wholeLineDeleteRange(value, 5)
    expect(value.slice(r.start, r.end)).toBe('BBB\n')
  })

  it('drops the preceding newline instead, for a last line with none of its own', () => {
    const value = 'AAA\nBBB'
    const r = wholeLineDeleteRange(value, 5) // caret inside "BBB"
    expect(value.slice(r.start, r.end)).toBe('\nBBB')
  })

  it('deletes the whole buffer for a single line with no newline at all', () => {
    const value = 'ONLY'
    const r = wholeLineDeleteRange(value, 2)
    expect(value.slice(r.start, r.end)).toBe('ONLY')
  })
})
