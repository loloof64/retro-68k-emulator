import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { assemble } from './index'
import { SystemMemory, FRAMEBUFFER_START, FRAMEBUFFER_WIDTH, INPUT_BUTTON_A, INPUT_BUTTON_START, SOUND_TRIGGER, SOUND_FREQUENCY } from '../memory'
import { createCPU, step } from '../cpu'
import { opcodeTable } from '../cpu/opcodes'
import { Register } from '../types/cpu'

const DIR = 'examples/en'

function load(name: string) {
  const p = assemble(readFileSync(`${DIR}/${name}`, 'utf8'))
  if (Array.isArray(p)) throw new Error(`${name}: ${JSON.stringify(p)}`)
  const memory = new SystemMemory()
  p.bytecode.forEach((b, i) => memory.write8(p.origin + i, b))
  return { cpu: createCPU(p.entry), memory }
}

function run(name: string, max = 500_000) {
  const { cpu, memory } = load(name)
  for (let i = 0; i < max && !cpu.halted; i++) step(cpu, memory, opcodeTable)
  return { cpu, memory }
}

const d = (cpu: { registers: ArrayLike<number> }, n: number) => cpu.registers[Register.D0 + n] >>> 0
const px = (m: SystemMemory, x: number, y: number) => m.read32(FRAMEBUFFER_START + (y * FRAMEBUFFER_WIDTH + x) * 4)

describe('translated examples', () => {
  const code = (s: string) => s.split('\n').map((l) => l.replace(/;.*$/, '').trimEnd())
  for (const lang of ['fr', 'es'])
    it(`${lang} only differs from en by its comments`, () => {
      const files = readdirSync(DIR)
      expect(readdirSync(`examples/${lang}`)).toEqual(files)
      for (const f of files) {
        const en = readFileSync(`${DIR}/${f}`, 'utf8')
        const tr = readFileSync(`examples/${lang}/${f}`, 'utf8')
        expect(code(tr), f).toEqual(code(en))
        expect(tr, f).not.toBe(en)
      }
    })
})

describe('examples/en/*.asm', () => {
  it('every example is covered below', () => {
    expect(readdirSync(DIR).filter((f) => f.endsWith('.asm')).length).toBe(15)
  })

  it('01 addition', () => {
    const { cpu, memory } = run('01-addition.asm')
    expect(d(cpu, 0)).toBe(150)
    expect(memory.read32(0x3000)).toBe(150)
  })
  it('02 factorial', () => expect(d(run('02-factorial.asm').cpu, 1)).toBe(120))
  it('03 draw line', () => {
    const { memory } = run('03-draw-line.asm')
    expect(px(memory, 0, 0)).toBe(0xffffffff)
    expect(px(memory, 99, 0)).toBe(0xffffffff)
    expect(px(memory, 100, 0)).toBe(0)
  })
  it('04 compare and branch', () => expect(d(run('04-compare-branch.asm').cpu, 2)).toBe(2))
  it('05 array sum', () => expect(d(run('05-array-sum.asm').cpu, 0)).toBe(150))
  it('06 subroutine', () => expect(d(run('06-subroutine.asm').cpu, 0)).toBe(144))
  it('07 bitwise', () => expect(d(run('07-bitwise.asm').cpu, 0)).toBe(0x00f000f0))
  it('08 shifts', () => {
    const { cpu } = run('08-shifts.asm')
    expect(d(cpu, 0)).toBe(640)
    expect(d(cpu, 1)).toBe(0xfffffffc)
    expect(d(cpu, 2)).toBe(0x3ffffffc)
  })
  it('09 checkerboard', () => {
    const { cpu, memory } = run('09-checkerboard.asm')
    expect(cpu.halted).toBe(true)
    expect(px(memory, 0, 0)).toBe(0xffffffff)
    expect(px(memory, 1, 0)).toBe(0)
    expect(px(memory, 0, 1)).toBe(0)
    expect(px(memory, 1, 1)).toBe(0xffffffff)
    expect(px(memory, 319, 199)).toBe(0xffffffff) // x+y even -> white
  })
  it('10 hello text', () => {
    const { cpu, memory } = run('10-hello-text.asm')
    expect(cpu.halted).toBe(true)
    let lit = 0
    for (let y = 10; y < 18; y++) for (let x = 10; x < 18; x++) if (px(memory, x, y) === 0xffffffff) lit++
    expect(lit).toBeGreaterThan(0)
  })
  it('11 gamepad: A -> red, Start -> exit', () => {
    const { cpu, memory } = load('11-gamepad.asm')
    const go = (n: number) => { for (let i = 0; i < n && !cpu.halted; i++) step(cpu, memory, opcodeTable) }
    go(300)
    expect(px(memory, 5, 5)).toBe(0x000000ff)
    memory.setButtonState(INPUT_BUTTON_A)
    go(300)
    expect(px(memory, 5, 5)).toBe(0xff0000ff)
    expect(cpu.halted).toBe(false)
    memory.setButtonState(INPUT_BUTTON_START)
    go(300)
    expect(cpu.halted).toBe(true)
  })
  it('12 plot pixel', () => {
    const { memory } = run('12-plot-pixel.asm')
    expect(px(memory, 0, 0)).toBe(0x0000ffff)
    expect(px(memory, 50, 10)).toBe(0xffffffff)
  })
  it('13 sound: plays 8 notes then exits', () => {
    const { cpu, memory } = load('13-sound.asm')
    const freqs: number[] = []
    for (let i = 0; i < 500000 && !cpu.halted; i++) {
      step(cpu, memory, opcodeTable)
      if (memory.read8(SOUND_TRIGGER)) {
        freqs.push(memory.read16(SOUND_FREQUENCY))
        memory.write8(SOUND_TRIGGER, 0)
      }
    }
    expect(cpu.halted).toBe(true)
    expect(freqs).toEqual([262, 294, 330, 349, 392, 440, 494, 523])
  })
  it('14 zero divide: handler catches it and sets a sentinel', () => {
    const { cpu } = run('14-zero-divide.asm')
    expect(cpu.halted).toBe(true)
    expect(d(cpu, 0)).toBe(0xffffffff)
  })
  it('15 keyboard input: echoes up to 10 typed characters then exits', () => {
    const { cpu, memory } = load('15-keyboard-input.asm')
    for (const c of 'HELLO68K!!') memory.pushKey(c.charCodeAt(0))
    for (let i = 0; i < 500_000 && !cpu.halted; i++) step(cpu, memory, opcodeTable)
    expect(cpu.halted).toBe(true)
    for (let i = 0; i < 10; i++) {
      let lit = 0
      for (let y = 10; y < 18; y++) for (let x = 10 + i * 8; x < 18 + i * 8; x++) if (px(memory, x, y) === 0xffffffff) lit++
      expect(lit).toBeGreaterThan(0)
    }
  })
})
