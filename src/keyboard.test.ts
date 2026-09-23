import { describe, it, expect } from 'vitest'
import { charCodeForKey, isEditableTarget } from './keyboard'

describe('charCodeForKey', () => {
  it('returns the code point for a visible ASCII character', () => {
    expect(charCodeForKey('A')).toBe(0x41)
  })

  it('returns the code point for a Latin-1 accented character', () => {
    expect(charCodeForKey('é')).toBe(0xe9)
  })

  it('ignores control/non-printable ASCII (space is the lowest accepted code)', () => {
    expect(charCodeForKey('\x1f')).toBeUndefined()
    expect(charCodeForKey('\x7f')).toBeUndefined() // DEL
  })

  it('ignores multi-character key names (Enter, ArrowUp, F1, ...)', () => {
    expect(charCodeForKey('Enter')).toBeUndefined()
    expect(charCodeForKey('ArrowUp')).toBeUndefined()
    expect(charCodeForKey('Backspace')).toBeUndefined()
  })

  it('ignores characters outside ASCII and Latin-1 (Euro sign, œ ligature)', () => {
    expect(charCodeForKey('€')).toBeUndefined()
    expect(charCodeForKey('œ')).toBeUndefined()
  })
})

describe('isEditableTarget', () => {
  it('is true for a textarea', () => {
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
  })

  it('is true for an input or select', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true)
    expect(isEditableTarget(document.createElement('select'))).toBe(true)
  })

  it('is true for a contentEditable element', () => {
    const div = document.createElement('div')
    div.contentEditable = 'true'
    expect(isEditableTarget(div)).toBe(true)
  })

  it('is false for a plain element or null', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(isEditableTarget(document.createElement('canvas'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})
