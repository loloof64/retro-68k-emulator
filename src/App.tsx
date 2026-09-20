import { useRef, useState } from 'react'
import './App.css'
import Editor from './components/Editor'
import Debugger from './components/Debugger'
import Screen from './components/Screen'
import Controller from './components/Controller'
import { SystemMemory } from './memory'
import { remapBreakpoints } from './breakpoints'

export default function App() {
  const [asmCode, setAsmCode] = useState<string>(`; Retro 68K Assembly Example
; Simple program to test the emulator

        ORG     $2000           ; Origin at $2000

START:
        MOVE.L  #100,D0         ; Load 100 into D0
        MOVE.L  #200,D1         ; Load 200 into D1
        ADD.L   D1,D0           ; D0 += D1
        
        ; Draw a white line (320 pixels, colors are $RRGGBBAA)
        MOVE.L  #$40000,A0      ; Framebuffer base
        MOVE.W  #319,D2         ; Loop counter: 320 iterations
LINE:
        MOVE.L  #$FFFFFFFF,(A0)+ ; White pixel, then A0 += 4
        DBRA    D2,LINE         ; Repeat until D2 wraps to -1

        ; Halt
        TRAP    #0              ; Exit
        
        END     START
`)

  const [isRunning, setIsRunning] = useState(false)
  const [currentLine, setCurrentLine] = useState<number>()
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set())
  const toggleBreakpoint = (line: number) =>
    setBreakpoints((prev) => {
      const next = new Set(prev)
      if (!next.delete(line)) next.add(line)
      return next
    })
  const [frame, setFrame] = useState(0) // bumped to make Screen repaint

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
          <Editor
            code={asmCode}
            onChange={(code) => {
              setBreakpoints((prev) => remapBreakpoints(prev, asmCode, code))
              // The yellow bar follows its instruction too (until re-assembly).
              setCurrentLine((line) =>
                line === undefined ? line : [...remapBreakpoints(new Set([line]), asmCode, code)][0],
              )
              setAsmCode(code)
            }}
            currentLine={currentLine}
            breakpoints={breakpoints}
            onToggleBreakpoint={toggleBreakpoint}
          />
        </div>

        <div className="panel debugger-panel">
          <h2>Débogueur</h2>
          <Debugger
            code={asmCode}
            memory={memoryRef.current}
            breakpoints={breakpoints}
            currentLine={currentLine}
            onLineChange={setCurrentLine}
            isRunning={isRunning}
            onRunningChange={setIsRunning}
            onFrame={() => setFrame((f) => f + 1)}
          />
        </div>

        <div className="panel screen-panel">
          <h2>Écran LCD</h2>
          <Screen memory={memoryRef.current} frame={frame} />
          <Controller onButtonStateChange={(mask) => memoryRef.current?.setButtonState(mask)} />
        </div>
      </div>
    </div>
  )
}
