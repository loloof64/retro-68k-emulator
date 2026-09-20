import { describe, it, expect } from 'vitest'
import {
  gamepadToMask,
  findStandardGamepad,
  GAMEPAD_BUTTON_MAP,
} from './Controller'
import {
  INPUT_BUTTON_A,
  INPUT_BUTTON_B,
  INPUT_BUTTON_START,
  INPUT_BUTTON_UP,
  INPUT_BUTTON_RIGHT,
} from '../memory'

// Minimal fakes shaped like the bits of the Gamepad API this module reads.
function fakeGamepad(pressedIndices: number[]) {
  const buttons = Array.from({ length: 16 }, (_, i) => ({
    pressed: pressedIndices.includes(i),
    value: pressedIndices.includes(i) ? 1 : 0,
    touched: false,
  }))
  return { connected: true, mapping: 'standard' as const, buttons }
}

describe('gamepadToMask', () => {
  it('maps pressed standard-layout buttons to our INPUT_BUTTON_* bits', () => {
    const gamepad = fakeGamepad([0, 9]) // A + Start
    expect(gamepadToMask(gamepad)).toBe(INPUT_BUTTON_A | INPUT_BUTTON_START)
  })

  it('returns 0 when nothing is pressed', () => {
    expect(gamepadToMask(fakeGamepad([]))).toBe(0)
  })

  it('maps button index 1 to B', () => {
    expect(gamepadToMask(fakeGamepad([1]))).toBe(INPUT_BUTTON_B)
  })

  it('ignores buttons with no mapping (e.g. shoulder triggers)', () => {
    const gamepad = fakeGamepad([4, 5, 6, 7]) // L1/R1/L2/R2 - unmapped
    expect(gamepadToMask(gamepad)).toBe(0)
  })

  it('covers every mapped index with a distinct bit', () => {
    const bits = Object.values(GAMEPAD_BUTTON_MAP)
    expect(new Set(bits).size).toBe(bits.length)
  })
})

describe('findStandardGamepad', () => {
  it('picks the first connected, standard-mapped gamepad', () => {
    const pads = [null, { connected: true, mapping: 'standard' as const }]
    expect(findStandardGamepad(pads)).toBe(pads[1])
  })

  it('skips disconnected gamepads', () => {
    const pads = [{ connected: false, mapping: 'standard' as const }]
    expect(findStandardGamepad(pads)).toBeNull()
  })

  it('skips non-standard mappings', () => {
    const pads = [{ connected: true, mapping: '' as const }]
    expect(findStandardGamepad(pads)).toBeNull()
  })

  it('returns null when no gamepad is present', () => {
    expect(findStandardGamepad([null, null])).toBeNull()
  })
})

// Sanity check against the documented layout in docs/MEMORY.md.
describe('GAMEPAD_BUTTON_MAP', () => {
  it('maps the D-pad up index (12) to INPUT_BUTTON_UP', () => {
    expect(GAMEPAD_BUTTON_MAP[12]).toBe(INPUT_BUTTON_UP)
  })
})

describe('gamepadToMask axes fallback', () => {
  it('reads a D-pad reported as axes 6/7 and the left stick', () => {
    const pad = { ...fakeGamepad([]), axes: [0, 0, 0, 0, 0, 0, 0, -1] }
    expect(gamepadToMask(pad)).toBe(INPUT_BUTTON_UP)
    expect(gamepadToMask({ ...pad, axes: [1, 0] })).toBe(INPUT_BUTTON_RIGHT)
  })
})
