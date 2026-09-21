import { useRef, useState } from 'react'
import './App.css'
import Editor from './components/Editor'
import Debugger from './components/Debugger'
import Screen from './components/Screen'
import Controller from './components/Controller'
import { SystemMemory } from './memory'
import LanguageSelect from './components/LanguageSelect'
import { remapBreakpoints } from './breakpoints'
import { translate, useI18n } from './i18n'
import { examplesFor } from './examples'

export default function App() {
  const { t, locale } = useI18n()
  const [asmCode, setAsmCode] = useState<string>(() => translate(locale, 'sample.program'))

  const [isRunning, setIsRunning] = useState(false)
  const [currentLine, setCurrentLine] = useState<number>()
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set())
  const toggleBreakpoint = (line: number) =>
    setBreakpoints((prev) => {
      const next = new Set(prev)
      if (!next.delete(line)) next.add(line)
      return next
    })
  const loadSource = (code: string) => {
    setAsmCode(code)
    setBreakpoints(new Set())
    setCurrentLine(undefined)
  }
  const openFile = async (file?: File) => file && loadSource(await file.text())
  const saveFile = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([asmCode], { type: 'text/plain' }))
    a.download = 'program.asm'
    a.click()
    URL.revokeObjectURL(a.href)
  }
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
          <h2>{t('panel.editor')}</h2>
          <select
            className="example-select"
            value=""
            disabled={isRunning}
            onChange={(e) => {
              const example = examplesFor(locale).find((x) => x.id === e.target.value)
              if (!example) return
              loadSource(example.code)
            }}
          >
            <option value="">{t('examples.load')}</option>
            {examplesFor(locale).map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </select>
          <label className="file-button">
            {t('file.open')}
            <input
              type="file"
              accept=".asm,.s,.txt,text/plain"
              hidden
              disabled={isRunning}
              onChange={(e) => {
                openFile(e.target.files?.[0])
                e.target.value = '' // allow re-opening the same file
              }}
            />
          </label>
          <button className="file-button" onClick={saveFile}>
            {t('file.save')}
          </button>
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
          <h2>{t('panel.debugger')}</h2>
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
          <h2>{t('panel.screen')}</h2>
          <Screen memory={memoryRef.current} frame={frame} />
          <Controller onButtonStateChange={(mask) => memoryRef.current?.setButtonState(mask)} />
          <LanguageSelect />
        </div>
      </div>
    </div>
  )
}
