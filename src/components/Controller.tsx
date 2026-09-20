import { useCallback, useEffect, useRef, useState } from 'react'
import {
  INPUT_BUTTON_A,
  INPUT_BUTTON_B,
  INPUT_BUTTON_X,
  INPUT_BUTTON_Y,
  INPUT_BUTTON_UP,
  INPUT_BUTTON_DOWN,
  INPUT_BUTTON_LEFT,
  INPUT_BUTTON_RIGHT,
  INPUT_BUTTON_START,
  INPUT_BUTTON_SELECT,
} from '../memory'
import './Controller.css'
import { useI18n } from '../i18n'

interface ControllerProps {
  // Called whenever the effective button state changes — a real gamepad's
  // state when one is connected, the on-screen buttons' state otherwise.
  onButtonStateChange: (mask: number) => void
}

// Standard Gamepad API button indices -> our INPUT_BUTTON_* bitmask (see
// docs/MEMORY.md). Only gamepad.mapping === 'standard' is supported: that's
// how browsers normalize virtually every modern USB/Bluetooth controller.
export const GAMEPAD_BUTTON_MAP: Readonly<Record<number, number>> = {
  0: INPUT_BUTTON_A,
  1: INPUT_BUTTON_B,
  2: INPUT_BUTTON_X,
  3: INPUT_BUTTON_Y,
  8: INPUT_BUTTON_SELECT,
  9: INPUT_BUTTON_START,
  12: INPUT_BUTTON_UP,
  13: INPUT_BUTTON_DOWN,
  14: INPUT_BUTTON_LEFT,
  15: INPUT_BUTTON_RIGHT,
}

// Picks the first standard-mapped, connected gamepad out of a
// navigator.getGamepads()-shaped list. Pure so it's testable without a
// browser Gamepad API.
export function findStandardGamepad(
  gamepads: readonly (Pick<Gamepad, 'connected' | 'mapping'> | null)[]
): Pick<Gamepad, 'connected' | 'mapping' | 'buttons' | 'axes'> | null {
  for (const pad of gamepads) {
    if (pad && pad.connected && pad.mapping === 'standard') {
      return pad as Pick<Gamepad, 'connected' | 'mapping' | 'buttons' | 'axes'>
    }
  }
  return null
}

const AXIS_THRESHOLD = 0.5

// Reduces one gamepad's button states to our bitmask. Pure/testable: only
// needs `.buttons[i].pressed`, not a real Gamepad object.
export function gamepadToMask(gamepad: Pick<Gamepad, 'buttons'> & { axes?: readonly number[] }): number {
  let mask = 0
  for (const [index, bit] of Object.entries(GAMEPAD_BUTTON_MAP)) {
    if (gamepad.buttons[Number(index)]?.pressed) {
      mask |= bit
    }
  }
  // Many generic pads report the D-pad as axes (6/7) instead of buttons
  // 12-15; the left stick (0/1) doubles as a D-pad too.
  const ax = gamepad.axes ?? []
  for (const [xi, yi] of [[0, 1], [6, 7]]) {
    if ((ax[xi] ?? 0) < -AXIS_THRESHOLD) mask |= INPUT_BUTTON_LEFT
    if ((ax[xi] ?? 0) > AXIS_THRESHOLD) mask |= INPUT_BUTTON_RIGHT
    if ((ax[yi] ?? 0) < -AXIS_THRESHOLD) mask |= INPUT_BUTTON_UP
    if ((ax[yi] ?? 0) > AXIS_THRESHOLD) mask |= INPUT_BUTTON_DOWN
  }
  return mask
}

const ACTION_BUTTONS = [
  { label: 'Y', bit: INPUT_BUTTON_Y, className: 'action-y' },
  { label: 'X', bit: INPUT_BUTTON_X, className: 'action-x' },
  { label: 'B', bit: INPUT_BUTTON_B, className: 'action-b' },
  { label: 'A', bit: INPUT_BUTTON_A, className: 'action-a' },
] as const

export default function Controller({ onButtonStateChange }: ControllerProps) {
  const { t } = useI18n()
  const [gamepadConnected, setGamepadConnected] = useState(false)
  // Mirrors the effective mask into render state so a physical gamepad's
  // presses light up the on-screen buttons too — CSS `:active` alone only
  // fires for real pointer events on these DOM elements, which a physical
  // controller never generates.
  const [buttonMask, setButtonMask] = useState(0)
  const virtualMaskRef = useRef(0)
  const lastMaskRef = useRef(-1)
  const lastConnectedRef = useRef(false)

  const setVirtualBit = useCallback((bit: number, pressed: boolean) => {
    virtualMaskRef.current = pressed ? virtualMaskRef.current | bit : virtualMaskRef.current & ~bit
  }, [])

  // State pushed by the Rust side (src-tauri/src/lib.rs) when the webview
  // has no Gamepad API (WebKitGTK on Linux); null when no pad is connected.
  const nativePadRef = useRef<ReturnType<typeof findStandardGamepad>>(null)

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<{ buttons: boolean[]; axes: number[] } | null>('gamepad-state', (e) => {
          const s = e.payload
          nativePadRef.current = s && {
            connected: true,
            mapping: 'standard',
            buttons: s.buttons.map((pressed) => ({ pressed }) as GamepadButton),
            axes: s.axes,
          }
        })
      )
      .then((u) => (cancelled ? u() : (unlisten = u)))
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    let rafId: number

    const tick = () => {
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []
      const gamepad = findStandardGamepad(pads) ?? nativePadRef.current

      if (!!gamepad !== lastConnectedRef.current) {
        lastConnectedRef.current = !!gamepad
        setGamepadConnected(!!gamepad)
      }

      // A connected gamepad supersedes the on-screen buttons entirely.
      const mask = gamepad ? gamepadToMask(gamepad) : virtualMaskRef.current
      if (mask !== lastMaskRef.current) {
        lastMaskRef.current = mask
        onButtonStateChange(mask)
        setButtonMask(mask)
      }

      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(rafId)
  }, [onButtonStateChange])

  const pressedClass = (bit: number) => ((buttonMask & bit) !== 0 ? 'pressed' : '')

  const bindPress = (bit: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      setVirtualBit(bit, true)
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault()
      setVirtualBit(bit, false)
    },
    onPointerLeave: () => setVirtualBit(bit, false),
    onPointerCancel: () => setVirtualBit(bit, false),
  })

  return (
    <div className="controller">
      <div className="controller-status">
        {gamepadConnected ? t('gamepad.detected') : t('gamepad.virtual')}
      </div>

      <div className={`controller-layout ${gamepadConnected ? 'is-disabled' : ''}`}>
        <div className="dpad" aria-hidden={gamepadConnected}>
          <button
            type="button"
            className={`dpad-btn dpad-up ${pressedClass(INPUT_BUTTON_UP)}`}
            {...bindPress(INPUT_BUTTON_UP)}
          >
            ▲
          </button>
          <button
            type="button"
            className={`dpad-btn dpad-left ${pressedClass(INPUT_BUTTON_LEFT)}`}
            {...bindPress(INPUT_BUTTON_LEFT)}
          >
            ◀
          </button>
          <button
            type="button"
            className={`dpad-btn dpad-right ${pressedClass(INPUT_BUTTON_RIGHT)}`}
            {...bindPress(INPUT_BUTTON_RIGHT)}
          >
            ▶
          </button>
          <button
            type="button"
            className={`dpad-btn dpad-down ${pressedClass(INPUT_BUTTON_DOWN)}`}
            {...bindPress(INPUT_BUTTON_DOWN)}
          >
            ▼
          </button>
        </div>

        <div className="action-buttons" aria-hidden={gamepadConnected}>
          {ACTION_BUTTONS.map(({ label, bit, className }) => (
            <button
              key={label}
              type="button"
              className={`action-btn ${className} ${pressedClass(bit)}`}
              {...bindPress(bit)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="start-select" aria-hidden={gamepadConnected}>
        <button
          type="button"
          className={`pill-btn ${pressedClass(INPUT_BUTTON_SELECT)}`}
          {...bindPress(INPUT_BUTTON_SELECT)}
        >
          Select
        </button>
        <button
          type="button"
          className={`pill-btn ${pressedClass(INPUT_BUTTON_START)}`}
          {...bindPress(INPUT_BUTTON_START)}
        >
          Start
        </button>
      </div>
    </div>
  )
}
