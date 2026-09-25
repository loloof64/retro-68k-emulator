export interface Match {
  line: number // 1-based
  start: number // 0-based column
  end: number
}

export function findMatches(code: string, query: string): Match[] {
  if (!query) return []
  const needle = query.toLowerCase()
  const matches: Match[] = []
  code.split('\n').forEach((lineText, i) => {
    const haystack = lineText.toLowerCase()
    let from = 0
    for (;;) {
      const at = haystack.indexOf(needle, from)
      if (at === -1) break
      matches.push({ line: i + 1, start: at, end: at + needle.length })
      from = at + needle.length
    }
  })
  return matches
}

export function nextMatchIndex(count: number, current: number): number {
  if (count === 0) return 0
  return (current + 1) % count
}

export function prevMatchIndex(count: number, current: number): number {
  if (count === 0) return 0
  return (current - 1 + count) % count
}
