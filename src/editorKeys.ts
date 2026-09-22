// Tab/Enter handling for the Editor's <textarea> — pure functions so they're
// testable without a DOM. Soft tabs only (spaces), matching the 8-space
// indent every .asm example already uses; no literal '\t' (would render
// inconsistently across the editor, the docs and the generated PDFs).
export const TAB_SIZE = 8

export interface EditResult {
  value: string
  selectionStart: number
  selectionEnd: number
}

const lineStartOf = (value: string, index: number) => value.lastIndexOf('\n', index - 1) + 1

// Tab: insert spaces up to the next tab stop, replacing any selection
// (same as typing any other character would).
export function handleTab(value: string, start: number, end: number): EditResult {
  const col = start - lineStartOf(value, start)
  const insert = ' '.repeat(TAB_SIZE - (col % TAB_SIZE))
  const pos = start + insert.length
  return { value: value.slice(0, start) + insert + value.slice(end), selectionStart: pos, selectionEnd: pos }
}

// Shift+Tab: remove up to one tab stop of leading spaces from the current line.
export function handleShiftTab(value: string, start: number, end: number): EditResult {
  const ls = lineStartOf(value, start)
  const leading = /^ */.exec(value.slice(ls))![0].length
  const strip = Math.min(TAB_SIZE, leading)
  const shift = (pos: number) => Math.max(ls, pos - strip)
  return { value: value.slice(0, ls) + value.slice(ls + strip), selectionStart: shift(start), selectionEnd: shift(end) }
}

// Enter: carry the current line's leading whitespace onto the new line.
export function handleEnter(value: string, start: number, end: number): EditResult {
  const ls = lineStartOf(value, start)
  const indent = /^ */.exec(value.slice(ls))![0]
  const insert = '\n' + indent
  const pos = start + insert.length
  return { value: value.slice(0, start) + insert + value.slice(end), selectionStart: pos, selectionEnd: pos }
}
