// Bookmarks (navigation markers) and breakpoints, persisted per source file.
// The key is the exact full path, so only files opened through the native
// dialog (Tauri) can be remembered: the browser never exposes a path.
export interface Marks {
  bookmarks: Set<number> // 1-based lines
  breakpoints: Set<number>
}

type Store = Pick<Storage, 'getItem' | 'setItem'>
const KEY = 'retro68k.marks'

function readAll(storage: Store): Record<string, { bookmarks: number[]; breakpoints: number[] }> {
  try {
    return JSON.parse(storage.getItem(KEY) ?? '{}') ?? {}
  } catch {
    return {}
  }
}

// Lines past lineCount are dropped: the file may have been edited elsewhere.
export function readMarks(path: string, lineCount: number, storage: Store = localStorage): Marks {
  const keep = (l: unknown) => (Array.isArray(l) ? l.filter((n) => Number.isInteger(n) && n >= 1 && n <= lineCount) : [])
  const e = readAll(storage)[path]
  return { bookmarks: new Set(keep(e?.bookmarks)), breakpoints: new Set(keep(e?.breakpoints)) }
}

export function writeMarks(path: string, marks: Marks, storage: Store = localStorage): void {
  const all = readAll(storage)
  all[path] = { bookmarks: [...marks.bookmarks], breakpoints: [...marks.breakpoints] }
  try {
    storage.setItem(KEY, JSON.stringify(all))
  } catch {
    // storage full or blocked: marks just aren't remembered
  }
}

// Next bookmark after (dir = 1) or before (dir = -1) `line`, wrapping around.
export function nextBookmark(bookmarks: Set<number>, line: number, dir: 1 | -1): number | undefined {
  const sorted = [...bookmarks].sort((a, b) => a - b)
  if (dir === 1) return sorted.find((n) => n > line) ?? sorted[0]
  return [...sorted].reverse().find((n) => n < line) ?? sorted[sorted.length - 1]
}
