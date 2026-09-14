import { useState } from 'react'
import './Debugger.css'

interface DebuggerProps {
  code: string
  isRunning: boolean
  onRunningChange: (running: boolean) => void
}

export default function Debugger({
  code,
  isRunning,
  onRunningChange,
}: DebuggerProps) {
  const [registers, setRegisters] = useState({
    D0: 0,
    D1: 0,
    D2: 0,
    D3: 0,
    D4: 0,
    D5: 0,
    D6: 0,
    D7: 0,
    A0: 0,
    A1: 0,
    A2: 0,
    A3: 0,
    A4: 0,
    A5: 0,
    A6: 0,
    A7: 0,
  })

  const [flags, setFlags] = useState({
    N: false,
    Z: false,
    V: false,
    C: false,
    X: false,
  })

  const [pc, setPc] = useState(0x1000)
  const [cycles, setCycles] = useState(0)

  const handleAssemble = () => {
    // TODO: Implement assembler
    console.log('Assembling code...')
  }

  const handleRun = () => {
    if (!isRunning) {
      onRunningChange(true)
      handleAssemble()
      // TODO: Run emulation
    } else {
      onRunningChange(false)
    }
  }

  const handleStep = () => {
    handleAssemble()
    // TODO: Step through instruction
  }

  const handleReset = () => {
    setRegisters({
      D0: 0,
      D1: 0,
      D2: 0,
      D3: 0,
      D4: 0,
      D5: 0,
      D6: 0,
      D7: 0,
      A0: 0,
      A1: 0,
      A2: 0,
      A3: 0,
      A4: 0,
      A5: 0,
      A6: 0,
      A7: 0,
    })
    setFlags({
      N: false,
      Z: false,
      V: false,
      C: false,
      X: false,
    })
    setPc(0x1000)
    setCycles(0)
    onRunningChange(false)
  }

  return (
    <div className="debugger">
      <div className="controls">
        <button
          className={`btn ${isRunning ? 'btn-stop' : 'btn-play'}`}
          onClick={handleRun}
          disabled={!isRunning && !code.trim()}
        >
          {isRunning ? '⏸ Pause' : '▶ Run'}
        </button>
        <button className="btn" onClick={handleStep} disabled={!code.trim()}>
          ⤵ Step
        </button>
        <button className="btn" onClick={handleReset}>
          ⟲ Reset
        </button>
      </div>

      <div className="state-info">
        <div className="info-row">
          <span>PC:</span>
          <code>${pc.toString(16).toUpperCase().padStart(8, '0')}</code>
        </div>
        <div className="info-row">
          <span>Cycles:</span>
          <code>{cycles}</code>
        </div>
      </div>

      <div className="registers-section">
        <h3>Registres de données</h3>
        <div className="registers-grid">
          {['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].map((reg) => (
            <div key={reg} className="register">
              <span className="reg-name">{reg}:</span>
              <code>
                ${(registers[reg as keyof typeof registers] >>> 0)
                  .toString(16)
                  .toUpperCase()
                  .padStart(8, '0')}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div className="registers-section">
        <h3>Registres adresse</h3>
        <div className="registers-grid">
          {['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'].map((reg) => (
            <div key={reg} className="register">
              <span className="reg-name">{reg}:</span>
              <code>
                ${(registers[reg as keyof typeof registers] >>> 0)
                  .toString(16)
                  .toUpperCase()
                  .padStart(8, '0')}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div className="flags-section">
        <h3>Flags</h3>
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
