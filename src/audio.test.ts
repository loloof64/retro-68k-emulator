import { describe, expect, it } from 'vitest'
import { pollSound } from './audio'
import { SOUND_TRIGGER, SystemMemory } from './memory'

describe('pollSound', () => {
  it('clears the trigger even without an audio context', () => {
    const memory = new SystemMemory()
    memory.write8(SOUND_TRIGGER, 1)
    pollSound(memory)
    expect(memory.read8(SOUND_TRIGGER)).toBe(0)
  })
})
