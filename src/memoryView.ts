import { MEMORY_SIZE } from './memory'

export const ROW_BYTES = 8
export const WINDOW_ROWS = 16
export const WINDOW_BYTES = ROW_BYTES * WINDOW_ROWS

// Parses a hex address typed by the user ("2000", "$2000", "0x2000").
export function parseAddress(text: string): number | null {
  const m = /^\s*(?:\$|0x)?([0-9a-f]{1,8})\s*$/i.exec(text)
  return m ? parseInt(m[1], 16) : null
}

// First address of the window showing `address`: row-aligned, never past the end of memory.
export function windowBase(address: number): number {
  const last = Math.floor((MEMORY_SIZE - WINDOW_BYTES) / ROW_BYTES) * ROW_BYTES
  return Math.max(0, Math.min(Math.floor(address / ROW_BYTES) * ROW_BYTES, last))
}

export const hex = (n: number, digits: number) => n.toString(16).toUpperCase().padStart(digits, '0')

// Printable ASCII as-is, anything else as a dot.
export const asciiChar = (b: number) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')
