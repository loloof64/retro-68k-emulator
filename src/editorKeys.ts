// Tab/Enter handling for the Editor's <textarea>. Pure functions (testable
// without a DOM) that compute WHAT to insert/delete; the caller applies it
// via document.execCommand rather than assigning .value directly, which
// would silently wipe the browser's native undo/redo stack for that edit.
// Soft tabs only (spaces), matching the 8-space indent every .asm example
// already uses; a literal '\t' would render inconsistently across the
// editor, the docs and the generated PDFs.
export const TAB_SIZE = 8

const lineStartOf = (value: string, index: number) => value.lastIndexOf('\n', index - 1) + 1

// Tab: text to insert at the caret (or in place of the current selection,
// same as typing any other character would) to reach the next tab stop.
export function tabInsertText(value: string, start: number): string {
  const col = start - lineStartOf(value, start)
  return ' '.repeat(TAB_SIZE - (col % TAB_SIZE))
}

export interface ShiftTabResult {
  deleteStart: number
  deleteEnd: number
  cursorStart: number
  cursorEnd: number
}

// Shift+Tab: the range of leading spaces (up to one tab stop) to delete
// from the current line, plus where the caret/selection should land after
// (shifted back by however much was actually removed).
export function shiftTab(value: string, start: number, end: number): ShiftTabResult {
  const ls = lineStartOf(value, start)
  const leading = /^ */.exec(value.slice(ls))![0].length
  const strip = Math.min(TAB_SIZE, leading)
  const shift = (pos: number) => Math.max(ls, pos - strip)
  return { deleteStart: ls, deleteEnd: ls + strip, cursorStart: shift(start), cursorEnd: shift(end) }
}

// Enter: text to insert (a newline plus the current line's indentation).
export function enterInsertText(value: string, start: number): string {
  const ls = lineStartOf(value, start)
  const indent = /^ */.exec(value.slice(ls))![0]
  return '\n' + indent
}
