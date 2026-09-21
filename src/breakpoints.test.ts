import { describe, expect, it } from 'vitest'
import { remapBreakpoints, runSteps } from './breakpoints'

const r = (bps: number[], a: string, b: string) => [...remapBreakpoints(new Set(bps), a, b)].sort()

describe('remapBreakpoints', () => {
  it('shifts down when a line is inserted above', () => {
    expect(r([2], 'a\nb\nc', 'a\nX\nb\nc')).toEqual([3])
    expect(r([1], 'a\nb', '\na\nb')).toEqual([2])
  })
  it('shifts up when a line is deleted above', () => {
    expect(r([3], 'a\nb\nc', 'a\nc')).toEqual([2])
  })
  it('drops the breakpoint of a deleted line', () => {
    expect(r([2], 'a\nb\nc', 'a\nc')).toEqual([])
  })
  it('keeps it when editing inside the line', () => {
    expect(r([2], 'a\nb\nc', 'a\nbx\nc')).toEqual([2])
  })
  it('drops it when several lines are replaced, even by as many', () => {
    expect(r([2, 3], 'a\nb\nc\nd', 'a\nX\nY\nd')).toEqual([])
  })
  it('drops it when its block gains or loses lines', () => {
    expect(r([2], 'a\nbc\nd', 'a\nb\nc\nd')).toEqual([])
    expect(r([2, 3], 'a\nb\nc\nd', 'a\nX\nd')).toEqual([])
  })
  it('leaves breakpoints above the edit alone', () => {
    expect(r([1], 'a\nb', 'a\nb\nc')).toEqual([1])
  })
})

describe('runSteps', () => {
  // A fake CPU whose PC line advances by one per instruction.
  const fake = (haltAt = Infinity) => {
    let line = 1
    return {
      execute: () => void line++,
      halted: () => line >= haltAt,
      lineAtPc: () => line,
      pos: () => line,
    }
  }
  it('stops on a breakpoint even when only one instruction is left in the batch', () => {
    const f = fake()
    expect(runSteps(1, f.execute, f.halted, f.lineAtPc, new Set([2]))).toBe(true)
    expect(f.pos()).toBe(2)
  })
  it('stops right after reaching the breakpoint line', () => {
    const f = fake()
    expect(runSteps(100, f.execute, f.halted, f.lineAtPc, new Set([5]))).toBe(true)
    expect(f.pos()).toBe(5)
  })
  it('ignores breakpoints when none are passed (single step)', () => {
    const f = fake()
    expect(runSteps(1, f.execute, f.halted, f.lineAtPc)).toBe(false)
    expect(f.pos()).toBe(2)
  })
  it('stops when the CPU halts, without reporting a breakpoint', () => {
    const f = fake(4)
    expect(runSteps(100, f.execute, f.halted, f.lineAtPc, new Set([99]))).toBe(false)
    expect(f.pos()).toBe(4)
  })
})
