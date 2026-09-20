// Moves breakpoint line numbers (1-based) so they follow their code across an
// edit. Finds the unchanged lines at the start and end of the text; the lines
// in between were touched: their breakpoints stay only if the block kept its
// size (retyping in place), and are dropped if lines were added or removed
// inside it (including splitting a line in two).
export function remapBreakpoints(bps: Set<number>, oldText: string, newText: string): Set<number> {
  if (oldText === newText || bps.size === 0) return bps
  const a = oldText.split('\n')
  const b = newText.split('\n')
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++

  const oldMidEnd = a.length - tail // 0-based, exclusive
  const sameSize = a.length === b.length
  const out = new Set<number>()
  for (const n of bps) {
    const i = n - 1
    if (i < head) out.add(n)
    else if (i >= oldMidEnd) out.add(n + b.length - a.length)
    else if (sameSize) out.add(n)
  }
  return out
}
