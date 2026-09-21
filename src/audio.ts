import {
  SOUND_DURATION,
  SOUND_FREQUENCY,
  SOUND_TRIGGER,
  SOUND_VOLUME,
  SOUND_WAVEFORM,
  SOUND_WAVEFORM_NOISE,
  SOUND_WAVEFORM_SAWTOOTH,
  SOUND_WAVEFORM_SINE,
  SOUND_WAVEFORM_TRIANGLE,
  type SystemMemory,
} from './memory'

const WAVES: Record<number, OscillatorType> = {
  [SOUND_WAVEFORM_SINE]: 'sine',
  [SOUND_WAVEFORM_TRIANGLE]: 'triangle',
  [SOUND_WAVEFORM_SAWTOOTH]: 'sawtooth',
}
const MAX_GAIN = 0.3 // full volume (255) is loud and clips on a square wave

let ctx: AudioContext | null = null
let voice: { stop: () => void } | null = null // single voice: a new tone cuts the old one

// Browsers only allow audio after a user gesture: call this from a click handler.
export function unlockAudio() {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
}

// Plays the tone described by the sound registers if the trigger byte is set,
// then clears the trigger. Call after each CPU step.
export function pollSound(memory: SystemMemory) {
  if (!memory.read8(SOUND_TRIGGER)) return
  memory.write8(SOUND_TRIGGER, 0)
  if (!ctx) return // never unlocked (e.g. tests): stay silent
  voice?.stop()
  voice = null
  const freq = memory.read16(SOUND_FREQUENCY)
  const seconds = memory.read16(SOUND_DURATION) / 1000
  const wave = memory.read8(SOUND_WAVEFORM)
  if (freq === 0 || seconds === 0) return

  const gain = ctx.createGain()
  gain.gain.value = (memory.read8(SOUND_VOLUME) / 255) * MAX_GAIN
  gain.connect(ctx.destination)
  let src: OscillatorNode | AudioBufferSourceNode
  if (wave === SOUND_WAVEFORM_NOISE) {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    buf.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1))
    src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
  } else {
    src = ctx.createOscillator()
    src.type = WAVES[wave] ?? 'square'
    src.frequency.value = freq
  }
  src.connect(gain)
  src.start()
  src.stop(ctx.currentTime + seconds)
  voice = { stop: () => { try { src.stop() } catch { /* already stopped */ } } }
}

export function stopSound() {
  voice?.stop()
  voice = null
}
