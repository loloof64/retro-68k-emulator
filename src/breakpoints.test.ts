import { describe, expect, it } from 'vitest'
import { remapBreakpoints } from './breakpoints'

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
  it('drops it when its block gains or loses lines', () => {
    expect(r([2], 'a\nbc\nd', 'a\nb\nc\nd')).toEqual([])
    expect(r([2, 3], 'a\nb\nc\nd', 'a\nX\nd')).toEqual([])
  })
  it('leaves breakpoints above the edit alone', () => {
    expect(r([1], 'a\nb', 'a\nb\nc')).toEqual([1])
  })
})
