import { useState } from 'react'
import './Editor.css'

interface EditorProps {
  code: string
  onChange: (code: string) => void
  currentLine?: number // 1-based line about to execute
  breakpoints: Set<number>
  onToggleBreakpoint: (line: number) => void
}

// Both the gutter and the highlight bar are positioned from --line-height
// and the textarea's scrollTop, which is why the textarea must not wrap.
export default function Editor({
  code,
  onChange,
  currentLine,
  breakpoints,
  onToggleBreakpoint,
}: EditorProps) {
  const [scrollTop, setScrollTop] = useState(0)
  const lineCount = code.split('\n').length

  return (
    <div className="editor">
      <div className="editor-gutter">
        <div style={{ transform: `translateY(${12 - scrollTop}px)` }}>
          {Array.from({ length: lineCount }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              className={`gutter-line ${breakpoints.has(n) ? 'breakpoint' : ''}`}
              onClick={() => onToggleBreakpoint(n)}
            >
              {n}
            </div>
          ))}
        </div>
      </div>
      <div className="editor-body">
        {currentLine !== undefined && (
          <div
            className="current-line"
            style={{ transform: `translateY(${12 + (currentLine - 1) * 18 - scrollTop}px)` }}
          />
        )}
        <textarea
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          spellCheck="false"
          wrap="off"
          className="editor-textarea"
        />
      </div>
    </div>
  )
}
