// Moves breakpoint line numbers (1-based) so they follow their code across an
// edit. Finds the unchanged lines at the start and end of the text; the lines
// in between were touched: their breakpoint stays only if exactly one line was
// retyped in place; any larger replacement, deletion or line split drops them.
export function remapBreakpoints(bps: Set<number>, oldText: string, newText: string): Set<number> {
  if (oldText === newText || bps.size === 0) return bps
  const a = oldText.split('\n')
  const b = newText.split('\n')
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++

  const oldMidEnd = a.length - tail // 0-based, exclusive
  const retypedOneLine = a.length === b.length && oldMidEnd - head === 1
  const out = new Set<number>()
  for (const n of bps) {
    const i = n - 1
    if (i < head) out.add(n)
    else if (i >= oldMidEnd) out.add(n + b.length - a.length)
    else if (retypedOneLine) out.add(n)
  }
  return out
}
