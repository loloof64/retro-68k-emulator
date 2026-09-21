import { useEffect, useRef, useState } from 'react'
import './Debugger.css'
import { assemble, type AssemblerError } from '../assembler'
import { createCPU, reset, step } from '../cpu'
import { opcodeTable } from '../cpu/opcodes'
import type { AssembledProgram, CPUState } from '../types/cpu'
import type { SystemMemory } from '../memory'
import { useI18n } from '../i18n'

// Instructions executed per animation frame while running (~60 fps).
const SPEEDS = [10, 200, 2000, 20000]

interface DebuggerProps {
  code: string
  memory: SystemMemory
  breakpoints: Set<number> // source lines
  currentLine?: number // shown in the state box; follows source edits
  onLineChange: (line: number | undefined) => void // line of the next instruction
  isRunning: boolean
  onRunningChange: (running: boolean) => void
  onFrame: () => void // framebuffer may have changed: repaint the screen
}


export default function Debugger({
  code,
  memory,
  breakpoints,
  currentLine,
  onLineChange,
  isRunning,
  onRunningChange,
  onFrame,
}: DebuggerProps) {
  const { t } = useI18n()
  // Tooltip: unsigned and signed (two's complement) decimal of a 32-bit value.
  const decimalTitle = (v: number) => t('decimal.title', { unsigned: v >>> 0, signed: v | 0 })
  const cpuRef = useRef<CPUState>(createCPU())
  const programRef = useRef<{ source: string; program: AssembledProgram } | null>(null)
  const [, setTick] = useState(0) // bumped to re-render from the mutable CPU
  const [errors, setErrors] = useState<AssemblerError[]>([])
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [speed, setSpeed] = useState(2000)
  const speedRef = useRef(speed)
  speedRef.current = speed
  const breakpointsRef = useRef(breakpoints)
  breakpointsRef.current = breakpoints

  const lineAtPc = () => {
    const p = programRef.current?.program
    return p && p.lineMap.get(cpuRef.current.pc - p.origin)
  }
  const refresh = () => {
    setTick((t) => t + 1)
    onLineChange(lineAtPc())
  }

  // Copies the program into RAM and points a fresh CPU at its entry.
  // memory.reset() also wipes the button mask, so restore it (the gamepad
  // only reports changes, a held button would otherwise be lost).
  const load = ({ program }: NonNullable<typeof programRef.current>) => {
    const buttons = memory.getButtonState()
    memory.reset()
    memory.setButtonState(buttons)
    program.bytecode.forEach((b, i) => memory.write8(program.origin + i, b))
    reset(cpuRef.current, program.entry)
    setRuntimeError(null)
    onFrame()
    refresh()
  }

  // Assembles if the source changed since the last load; false on errors.
  const ensureProgram = (): boolean => {
    if (programRef.current?.source === code) return true
    const result = assemble(code)
    if (Array.isArray(result)) {
      setErrors(result)
      return false
    }
    setErrors([])
    programRef.current = { source: code, program: result }
    load(programRef.current)
    return true
  }

  const stepCpu = (count: number) => {
    const cpu = cpuRef.current
    let hitBreakpoint = false
    try {
      for (let i = 0; i < count && !cpu.halted && !hitBreakpoint; i++) {
        step(cpu, memory, opcodeTable)
        const line = lineAtPc()
        hitBreakpoint = count > 1 && line !== undefined && breakpointsRef.current.has(line)
      }
    } catch (e) {
      setRuntimeError(e instanceof Error ? e.message : String(e))
      cpu.halted = true
    }
    const stop = cpu.halted || hitBreakpoint
    if (stop) onRunningChange(false)
    onFrame()
    refresh()
    return !stop
  }

  useEffect(() => {
    if (!isRunning) return
    let raf = requestAnimationFrame(function loop() {
      if (stepCpu(speedRef.current)) raf = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(raf)
    // stepCpu closes over props that don't change while running.
  }, [isRunning])

  const handleRun = () => {
    if (isRunning) return onRunningChange(false)
    if (ensureProgram() && !cpuRef.current.halted) onRunningChange(true)
  }

  const handleStep = () => {
    if (ensureProgram()) stepCpu(1)
  }

  const handleReset = () => {
    onRunningChange(false)
    setErrors([])
    if (programRef.current) load(programRef.current)
  }

  const cpu = cpuRef.current
  const registers: Record<string, number> = {}
  for (let i = 0; i < 8; i++) {
    registers[`D${i}`] = cpu.registers[i]
    registers[`A${i}`] = cpu.registers[8 + i]
  }
  const flags = cpu.status
  const pc = cpu.pc
  const cycles = cpu.cycles

  return (
    <div className="debugger">
      <div className="controls">
        <button
          className={`btn ${isRunning ? 'btn-stop' : 'btn-play'}`}
          onClick={handleRun}
          disabled={!isRunning && !code.trim()}
        >
          {isRunning ? `⏸ ${t('pause')}` : `▶ ${t('run')}`}
        </button>
        <button className="btn" onClick={handleStep} disabled={!code.trim() || isRunning}>
          ⤵ {t('step')}
        </button>
        <button className="btn" onClick={handleReset}>
          ⟲ {t('reset')}
        </button>
        <label className="speed-label" title={t('speed.title')}>
          {t('speed')}
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} title={t('speed.title')}>
            {SPEEDS.map((n) => (
              <option key={n} value={n}>
                {n} {t('speed.unit')}
              </option>
            ))}
          </select>
        </label>
      </div>

      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>
              {t('error.line', { line: e.line, message: e.message })}
            </li>
          ))}
        </ul>
      )}
      {runtimeError && <p className="errors">{t('error.runtime', { message: runtimeError })}</p>}

      <div className="state-info">
        <div className="info-row">
          <span>{t('pc')}:</span>
          <code title={decimalTitle(pc)}>${pc.toString(16).toUpperCase().padStart(8, '0')}</code>
        </div>
        <div className="info-row">
          <span>{t('cycles')}:</span>
          <code>{cycles}</code>
        </div>
        {currentLine !== undefined && (
          <div className="info-row">
            <span>{t('line')}:</span>
            <code>{currentLine}</code>
          </div>
        )}
        {cpu.halted && <div className="info-row">{t('halted')}</div>}
      </div>

      <div className="registers-section">
        <h3>{t('registers.data')}</h3>
        <div className="registers-grid">
          {['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].map((reg) => (
            <div key={reg} className="register" title={decimalTitle(registers[reg])}>
              <span className="reg-name">{reg}:</span>
              <code>
                ${(registers[reg] >>> 0)
                  .toString(16)
                  .toUpperCase()
                  .padStart(8, '0')}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div className="registers-section">
        <h3>{t('registers.address')}</h3>
        <div className="registers-grid">
          {['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'].map((reg) => (
            <div key={reg} className="register" title={decimalTitle(registers[reg])}>
              <span className="reg-name">{reg}:</span>
              <code>
                ${(registers[reg] >>> 0)
                  .toString(16)
                  .toUpperCase()
                  .padStart(8, '0')}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div className="flags-section">
        <h3>{t('flags')}</h3>
        <div className="flags">
          {Object.entries(flags).map(([flag, value]) => (
            <div key={flag} className={`flag ${value ? 'set' : ''}`}>
              <span>{flag}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
