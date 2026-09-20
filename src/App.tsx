import { useRef, useState } from 'react'
import './App.css'
import Editor from './components/Editor'
import Debugger from './components/Debugger'
import Screen from './components/Screen'
import Controller from './components/Controller'
import { SystemMemory } from './memory'

export default function App() {
  const [asmCode, setAsmCode] = useState<string>(`; Retro 68K Assembly Example
; Simple program to test the emulator

        ORG     $2000           ; Origin at $2000

START:
        MOVE.L  #100,D0         ; Load 100 into D0
        MOVE.L  #200,D1         ; Load 200 into D1
        ADD.L   D1,D0           ; D0 += D1
        
        ; Draw a pixel
        MOVE.L  #$40000,A0      ; Framebuffer base
        MOVE.L  #$FFFFFF,(A0)   ; White pixel
        
        ; Halt
        TRAP    #0              ; Exit
        
        END     START
`)

  const [isRunning, setIsRunning] = useState(false)

  // Not React state on purpose: the controller reports button changes up to
  // 60x/second, and nothing here needs a re-render when they happen — only
  // the emulator's own memory needs to see them (see docs/MEMORY.md).
  const memoryRef = useRef<SystemMemory | null>(null)
  if (memoryRef.current === null) {
    memoryRef.current = new SystemMemory()
  }

  return (
    <div className="app">
      <div className="container">
        <div className="panel editor-panel">
          <h2>Assembleur</h2>
          <Editor code={asmCode} onChange={setAsmCode} />
        </div>

        <div className="panel debugger-panel">
          <h2>Débogueur</h2>
          <Debugger
            code={asmCode}
            isRunning={isRunning}
            onRunningChange={setIsRunning}
          />
        </div>

        <div className="panel screen-panel">
          <h2>Écran LCD</h2>
          <Screen />
          <Controller onButtonStateChange={(mask) => memoryRef.current?.setButtonState(mask)} />
        </div>
      </div>
    </div>
  )
}
