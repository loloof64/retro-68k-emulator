import { describe, it, expect } from 'vitest'
import {
  gamepadToMask,
  findStandardGamepad,
  pickGamepad,
  GAMEPAD_BUTTON_MAP,
} from './Controller'
import {
  INPUT_BUTTON_A,
  INPUT_BUTTON_B,
  INPUT_BUTTON_START,
  INPUT_BUTTON_SELECT,
  INPUT_BUTTON_X,
  INPUT_BUTTON_Y,
  INPUT_BUTTON_DOWN,
  INPUT_BUTTON_LEFT,
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

  it('skips non-standard mappings without a hat axis', () => {
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

describe('hat-on-axis-9 pad (NSW wired controller, Windows)', () => {
  const pad = (pressed: number[], hat: number) => ({
    ...fakeGamepad(pressed),
    mapping: '' as const,
    axes: [0.00392, 0.00392, 0.00392, 0, 0, 0.00392, 0, 0, 0, hat],
  })

  it('is accepted despite the empty mapping', () => {
    const p = pad([], 3.28571)
    expect(findStandardGamepad([p])).toBe(p)
  })

  it('maps its HID-order face buttons and -/+', () => {
    expect(gamepadToMask(pad([2, 1, 3, 0, 8, 9], 3.28571))).toBe(
      INPUT_BUTTON_A | INPUT_BUTTON_B | INPUT_BUTTON_X | INPUT_BUTTON_Y | INPUT_BUTTON_SELECT | INPUT_BUTTON_START
    )
  })

  it('decodes the hat: rest, up, down, left, right', () => {
    expect(gamepadToMask(pad([], 3.28571))).toBe(0)
    expect(gamepadToMask(pad([], -1))).toBe(INPUT_BUTTON_UP)
    expect(gamepadToMask(pad([], 0.14286))).toBe(INPUT_BUTTON_DOWN)
    expect(gamepadToMask(pad([], 0.71429))).toBe(INPUT_BUTTON_LEFT)
    expect(gamepadToMask(pad([], -0.42857))).toBe(INPUT_BUTTON_RIGHT)
  })
})

describe('pickGamepad', () => {
  const browser = { connected: true, mapping: 'standard', buttons: [], axes: [0, -1, 0, 0] } as unknown as Gamepad
  const native = { connected: true, mapping: 'standard', buttons: [], axes: [] } as unknown as Gamepad

  it('prefers the native pad over a browser one', () => {
    expect(pickGamepad([browser], native)).toBe(native)
  })

  it('falls back to the browser pad when there is no native one', () => {
    expect(pickGamepad([browser], null)).toBe(browser)
  })
})
