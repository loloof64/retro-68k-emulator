import { describe, it, expect } from 'vitest'
import { assemble } from './index'
import { SystemMemory, FRAMEBUFFER_START, FRAMEBUFFER_WIDTH, FRAMEBUFFER_BYTES_PER_PIXEL } from '../memory'
import { createCPU, step } from '../cpu'
import { opcodeTable } from '../cpu/opcodes'
import { Register } from '../types/cpu'

function run(source: string) {
  const p = assemble(source)
  if (Array.isArray(p)) throw new Error(JSON.stringify(p))
  const memory = new SystemMemory()
  p.bytecode.forEach((b, i) => memory.write8(p.origin + i, b))
  const cpu = createCPU(p.entry)
  for (let i = 0; i < 10_000 && !cpu.halted; i++) step(cpu, memory, opcodeTable)
  return { cpu, memory }
}

const SAMPLE = `; Retro 68K Assembly Example
        ORG     $2000
START:
        MOVE.L  #100,D0
        MOVE.L  #200,D1
        ADD.L   D1,D0
        MOVE.L  #$40000,A0
        MOVE.L  #$FFFFFF,(A0)
        TRAP    #0
        END     START
`

describe('programs', () => {
  it('runs the App.tsx sample program', () => {
    const { cpu, memory } = run(SAMPLE)
    expect(cpu.registers[Register.D0]).toBe(300)
    expect(memory.read32(FRAMEBUFFER_START)).toBe(0x00ffffff)
    expect(cpu.halted).toBe(true)
  })

  it('prints a DC.B string with TRAP #1', () => {
    const { memory } = run(`
        ORG     $2000
        LEA     MSG,A0
        MOVEQ   #0,D0
        MOVEQ   #0,D1
        MOVE.L  #$FF0000FF,D2
        TRAP    #1
        TRAP    #0
MSG:    DC.B    "Hi",0
        END
`)
    const px = (x: number, y: number) =>
      memory.read32(FRAMEBUFFER_START + (y * FRAMEBUFFER_WIDTH + x) * FRAMEBUFFER_BYTES_PER_PIXEL)
    // 'H' row 0 = 0x33: bits 0,1,4,5 set (bit 0 = leftmost)
    expect(px(0, 0)).toBe(0xff0000ff)
    expect(px(2, 0)).toBe(0)
  })

  it('runs a subroutine call (BSR/RTS) with a stack', () => {
    const { cpu } = run(`
        ORG     $2000
        MOVEQ   #1,D0
        BSR     DOUBLE
        BSR     DOUBLE
        TRAP    #0
DOUBLE: ADD.L   D0,D0
        RTS
`)
    expect(cpu.registers[Register.D0]).toBe(4)
  })
})
