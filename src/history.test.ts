import { describe, it, expect } from 'vitest'
import { initHistory, pushHistory, undo, redo, currentValue, hasEdits } from './history'

describe('hasEdits', () => {
  it('is false right after init, before any edit', () => {
    expect(hasEdits(initHistory('A'))).toBe(false)
  })

  it('stays true after undoing back to the original content', () => {
    let h = initHistory('A')
    h = pushHistory(h, 'AB', 1000, 0)
    h = undo(h)
    expect(currentValue(h)).toBe('A')
    expect(hasEdits(h)).toBe(true)
  })
})

describe('undo/redo', () => {
  it('undo moves back one entry; redo moves forward again', () => {
    let h = initHistory('A')
    h = pushHistory(h, 'AB', 1000, 0)
    h = pushHistory(h, 'ABC', 3000, 1000)
    const afterUndo = undo(h)
    expect(currentValue(afterUndo)).toBe('AB')
    const afterRedo = redo(afterUndo)
    expect(currentValue(afterRedo)).toBe('ABC')
  })

  it('undo at the start and redo at the end are no-ops', () => {
    const h = initHistory('A')
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })
})

describe('pushHistory', () => {
  it('pushes a new entry when the coalescing window has elapsed', () => {
    const h0 = initHistory('A')
    const h1 = pushHistory(h0, 'AB', 1000, 0)
    expect(currentValue(h1)).toBe('AB')
    expect(h1.entries).toEqual(['A', 'AB'])
  })

  it('coalesces an edit within the window into the top entry', () => {
    const h0 = initHistory('A')
    const h1 = pushHistory(h0, 'AB', 1000, 0)
    const h2 = pushHistory(h1, 'ABC', 1200, 1000)
    expect(currentValue(h2)).toBe('ABC')
    expect(h2.entries).toEqual(['A', 'ABC'])
  })
})
