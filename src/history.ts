// Undo/redo history for the editor's source text. Not the browser's native
// text-field undo: that relies on document.execCommand, which doesn't
// receive Ctrl+Z/Ctrl+Y in the Tauri desktop build, so the app manages its
// own stack instead and Ctrl+Z/Ctrl+Y (or the Undo/Redo buttons) drive it
// directly.
export interface History {
  entries: string[]
  index: number
}

// Edits within this many ms of the previous push replace the top entry
// instead of growing the stack, so one burst of typing is one undo step.
const COALESCE_MS = 700

export function initHistory(initial: string): History {
  return { entries: [initial], index: 0 }
}

export function currentValue(h: History): string {
  return h.entries[h.index]
}

export function pushHistory(h: History, value: string, now: number, lastPushAt: number): History {
  const entries = h.entries.slice(0, h.index + 1)
  if (now - lastPushAt < COALESCE_MS && entries.length > 0) {
    entries[entries.length - 1] = value
  } else {
    entries.push(value)
  }
  return { entries, index: entries.length - 1 }
}

export function undo(h: History): History {
  return h.index > 0 ? { ...h, index: h.index - 1 } : h
}

export function redo(h: History): History {
  return h.index < h.entries.length - 1 ? { ...h, index: h.index + 1 } : h
}
