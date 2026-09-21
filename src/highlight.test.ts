import { describe, it, expect } from 'vitest'
import { highlightLine } from './highlight'

const kinds = (l: string) => highlightLine(l).filter((t) => t.type).map((t) => `${t.type}:${t.text}`)

describe('highlightLine', () => {
  it('splits a full line', () => {
    expect(kinds('loop: MOVE.W #$FF,D0 ; go')).toEqual([
      'label:loop:', 'mnemonic:MOVE', 'size:.W', 'number:$FF', 'register:D0', 'comment:; go',
    ])
  })
  it('treats a column-0 word as a label, an indented one as a mnemonic', () => {
    expect(kinds('start')).toEqual(['label:start'])
    expect(kinds('  RTS')).toEqual(['mnemonic:RTS'])
  })
  it('keeps ; inside strings and handles * comments', () => {
    expect(kinds(' DC.B "a;b",0')).toEqual(['directive:DC', 'size:.B', 'string:"a;b"', 'number:0'])
    expect(kinds('* note')).toEqual(['comment:* note'])
  })
  it('gives directives their own kind', () => {
    expect(kinds(' org $1000')).toEqual(['directive:org', 'number:$1000'])
  })
  it('round-trips the text', () => {
    const l = 'x: LEA 4(A0,D1.W),A7 ; hi'
    expect(highlightLine(l).map((t) => t.text).join('')).toBe(l)
  })
})
