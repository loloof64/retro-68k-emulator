import type { Memory } from '../types/cpu'

// Memory map (see docs/MEMORY.md / docs/ARCHITECTURE.md)
export const SYSTEM_START = 0x00000
export const SYSTEM_END = 0x01fff
export const USER_RAM_START = 0x02000
export const USER_RAM_END = 0x3ffff
export const FRAMEBUFFER_START = 0x40000

export const FRAMEBUFFER_WIDTH = 320
export const FRAMEBUFFER_HEIGHT = 200
export const FRAMEBUFFER_BYTES_PER_PIXEL = 4 // 32-bit RGBA (see docs/API.md)
export const FRAMEBUFFER_SIZE =
  FRAMEBUFFER_WIDTH * FRAMEBUFFER_HEIGHT * FRAMEBUFFER_BYTES_PER_PIXEL
export const FRAMEBUFFER_END = FRAMEBUFFER_START + FRAMEBUFFER_SIZE - 1

// Controller input port: a single 32-bit, bit-mapped button state register,
// live-updated by the UI (on-screen gamepad, or a real Gamepad API device
// once that's wired up) and polled by running programs. See docs/MEMORY.md.
export const INPUT_START = FRAMEBUFFER_END + 1
export const INPUT_SIZE = 4
export const INPUT_END = INPUT_START + INPUT_SIZE - 1

export const INPUT_BUTTON_A = 1 << 0
export const INPUT_BUTTON_B = 1 << 1
export const INPUT_BUTTON_X = 1 << 2
export const INPUT_BUTTON_Y = 1 << 3
export const INPUT_BUTTON_UP = 1 << 4
export const INPUT_BUTTON_DOWN = 1 << 5
export const INPUT_BUTTON_LEFT = 1 << 6
export const INPUT_BUTTON_RIGHT = 1 << 7
export const INPUT_BUTTON_START = 1 << 8
export const INPUT_BUTTON_SELECT = 1 << 9

// CPU exception vectors: like the TRAP vector table documented in
// docs/MEMORY.md (bytes $00-$3F), but for faults the CPU itself raises
// rather than an explicit TRAP #n call — starting with Zero Divide
// (DIVU/DIVS by zero). Each is a 4-byte slot a running program fills in
// with a handler routine's address; left at 0 (memory's default), the
// raising instruction fails with a clear error instead of jumping to
// address 0. Sits right after the TRAP table's reserved 64 bytes.
export const EXCEPTION_VECTORS_START = SYSTEM_START + 0x40
export const ZERO_DIVIDE_VECTOR = EXCEPTION_VECTORS_START + 0 // DIVU/DIVS by zero
// Genuinely reserved/invalid encodings only (e.g. MOVE.B to An, BTST
// targeting An) — never for an instruction/addressing mode this emulator
// simply hasn't implemented yet, which would run fine on real hardware.
export const ILLEGAL_INSTRUCTION_VECTOR = EXCEPTION_VECTORS_START + 4
export const CHK_VECTOR = EXCEPTION_VECTORS_START + 8 // CHK bounds check failed
export const TRAPV_VECTOR = EXCEPTION_VECTORS_START + 12 // TRAPV with V set

// Sound port: played through Web Audio by src/audio.ts (see
// docs/MEMORY.md). Modeled on a simple single-voice tone generator — like
// a PC speaker or the TI-89's piezo buzzer — rather than a PCM sample
// buffer, which a budget this size (a handful of bytes, same class as
// Controller Input) couldn't hold more than a few seconds of anyway.
export const SOUND_START = INPUT_END + 1
export const SOUND_FREQUENCY = SOUND_START + 0 // word: Hz, 0 = silence
export const SOUND_DURATION = SOUND_START + 2 // word: milliseconds
export const SOUND_VOLUME = SOUND_START + 4 // byte: 0-255
export const SOUND_WAVEFORM = SOUND_START + 5 // byte: SOUND_WAVEFORM_*
export const SOUND_TRIGGER = SOUND_START + 6 // byte: write nonzero to play
// SOUND_START + 7 is reserved padding, to keep the region 8 bytes wide.
export const SOUND_SIZE = 8
export const SOUND_END = SOUND_START + SOUND_SIZE - 1

export const SOUND_WAVEFORM_SQUARE = 0
export const SOUND_WAVEFORM_SINE = 1
export const SOUND_WAVEFORM_TRIANGLE = 2
export const SOUND_WAVEFORM_SAWTOOTH = 3
export const SOUND_WAVEFORM_NOISE = 4

// The docs state the framebuffer region is 64-128KB, but 320x200 @ 32bpp
// actually needs ~250KB. Total space is rounded up to fit it exactly.
export const MEMORY_SIZE = SOUND_END + 1

export class SystemMemory implements Memory {
  private bytes: Uint8Array
  private lastWrite: number | undefined
  private written = new Set<number>()

  constructor(size: number = MEMORY_SIZE) {
    this.bytes = new Uint8Array(size)
  }

  private checkBounds(address: number, length: number): void {
    if (!Number.isInteger(address) || address < 0 || address + length > this.bytes.length) {
      throw new Error(`Memory access out of bounds: $${address.toString(16)}`)
    }
  }

  read8(address: number): number {
    this.checkBounds(address, 1)
    return this.bytes[address]
  }

  // 68000 is big-endian: most significant byte first.
  read16(address: number): number {
    this.checkBounds(address, 2)
    return (this.bytes[address] << 8) | this.bytes[address + 1]
  }

  read32(address: number): number {
    this.checkBounds(address, 4)
    return (
      ((this.bytes[address] << 24) |
        (this.bytes[address + 1] << 16) |
        (this.bytes[address + 2] << 8) |
        this.bytes[address + 3]) >>>
      0
    )
  }

  // Remembers what the program wrote, for the debugger's memory view. The set is
  // capped so a run filling the framebuffer stays cheap.
  private note(address: number, length: number): void {
    this.lastWrite = address
    for (let i = 0; i < length && this.written.size < 64; i++) this.written.add(address + i)
  }

  // Debugger edit: stores a byte without counting as a program write.
  patch8(address: number, value: number): void {
    this.checkBounds(address, 1)
    this.bytes[address] = value & 0xff
  }

  // Bytes written (and the last address written) since the previous call.
  takeWrites(): { last: number | undefined; bytes: Set<number> } {
    const taken = { last: this.lastWrite, bytes: this.written }
    this.lastWrite = undefined
    this.written = new Set()
    return taken
  }

  write8(address: number, value: number): void {
    this.checkBounds(address, 1)
    this.note(address, 1)
    this.bytes[address] = value & 0xff
  }

  write16(address: number, value: number): void {
    this.checkBounds(address, 2)
    this.note(address, 2)
    this.bytes[address] = (value >>> 8) & 0xff
    this.bytes[address + 1] = value & 0xff
  }

  write32(address: number, value: number): void {
    this.checkBounds(address, 4)
    this.note(address, 4)
    this.put32(address, value)
  }

  private put32(address: number, value: number): void {
    this.bytes[address] = (value >>> 24) & 0xff
    this.bytes[address + 1] = (value >>> 16) & 0xff
    this.bytes[address + 2] = (value >>> 8) & 0xff
    this.bytes[address + 3] = value & 0xff
  }

  reset(): void {
    this.bytes.fill(0)
    this.takeWrites()
  }

  getPixel(x: number, y: number): number {
    return this.read32(
      FRAMEBUFFER_START + (y * FRAMEBUFFER_WIDTH + x) * FRAMEBUFFER_BYTES_PER_PIXEL
    )
  }

  setPixel(x: number, y: number, color: number): void {
    this.write32(
      FRAMEBUFFER_START + (y * FRAMEBUFFER_WIDTH + x) * FRAMEBUFFER_BYTES_PER_PIXEL,
      color
    )
  }

  // Read-only view of the framebuffer, for the UI to render directly.
  getFramebuffer(): Uint8Array {
    return this.bytes.subarray(FRAMEBUFFER_START, FRAMEBUFFER_START + FRAMEBUFFER_SIZE)
  }

  // For the UI (on-screen gamepad and/or a real controller) to publish the
  // current button state; running programs read it back via MOVE or TRAP #5.
  setButtonState(mask: number): void {
    this.put32(INPUT_START, mask >>> 0) // not a program write: not noted
  }

  getButtonState(): number {
    return this.read32(INPUT_START)
  }
}
