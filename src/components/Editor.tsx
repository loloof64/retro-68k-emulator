import { useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { nextBookmark } from '../marks'
import { highlightLine } from '../highlight'
import { tabInsertText, shiftTab, enterInsertText } from '../editorKeys'
import './Editor.css'

interface EditorProps {
  code: string
  onChange: (code: string) => void
  currentLine?: number // 1-based line about to execute
  breakpoints: Set<number>
  onToggleBreakpoint: (line: number) => void
  bookmarks: Set<number>
  onToggleBookmark: (line: number) => void
  onUndo: () => void
  onRedo: () => void
}

// Both the gutter and the highlight bar are positioned from --line-height
// and the textarea's scrollTop, which is why the textarea must not wrap.
export default function Editor({
  code,
  onChange,
  currentLine,
  breakpoints,
  onToggleBreakpoint,
  bookmarks,
  onToggleBookmark,
  onUndo,
  onRedo,
}: EditorProps) {
  const { t } = useI18n()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const lineCount = code.split('\n').length

  const caretLine = (ta: HTMLTextAreaElement) => ta.value.slice(0, ta.selectionStart).split('\n').length
  const goToLine = (ta: HTMLTextAreaElement, line: number) => {
    const offset = ta.value.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0)
    ta.setSelectionRange(offset, offset)
    // Keep the line visible (fixed 18px lines, 12px padding).
    const top = 12 + (line - 1) * 18
    if (top < ta.scrollTop || top + 18 > ta.scrollTop + ta.clientHeight)
      ta.scrollTop = Math.max(0, top - ta.clientHeight / 2)
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      onToggleBookmark(caretLine(ta))
    } else if (e.key === 'F2') {
      e.preventDefault()
      const line = nextBookmark(bookmarks, caretLine(ta), e.shiftKey ? -1 : 1)
      if (line !== undefined) goToLine(ta, line)
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      // The app's own history (see ../history.ts), not the browser's
      // native text-field undo: that one doesn't get Ctrl+Z/Ctrl+Y at all
      // in the Tauri desktop build.
      if (e.shiftKey) onRedo()
      else onUndo()
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      onRedo()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      // execCommand, not a direct .value assignment: it fires a real input
      // event (so onChange fires on its own) and leaves the browser to
      // place the caret naturally.
      if (e.shiftKey) {
        const r = shiftTab(ta.value, ta.selectionStart, ta.selectionEnd)
        if (r.deleteStart < r.deleteEnd) {
          ta.setSelectionRange(r.deleteStart, r.deleteEnd)
          document.execCommand('delete')
          ta.setSelectionRange(r.cursorStart, r.cursorEnd)
        }
      } else {
        document.execCommand('insertText', false, tabInsertText(ta.value, ta.selectionStart))
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      document.execCommand('insertText', false, enterInsertText(ta.value, ta.selectionStart))
    }
  }

  return (
    <div className="editor">
      <div className="editor-gutter">
        <div style={{ transform: `translateY(${12 - scrollTop}px)` }}>
          {Array.from({ length: lineCount }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              className={`gutter-line ${breakpoints.has(n) ? 'breakpoint' : ''} ${bookmarks.has(n) ? 'bookmark' : ''}`}
              title={t('editor.bookmarkHint')}
              onClick={() => onToggleBreakpoint(n)}
              onContextMenu={(e) => {
                e.preventDefault()
                onToggleBookmark(n)
              }}
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
        <pre
          className="editor-highlight"
          aria-hidden="true"
          style={{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }}
        >
          {code.split('\n').map((line, i) => (
            <div key={i}>
              {highlightLine(line).map((t, j) => (
                <span key={j} className={t.type && `tok-${t.type}`}>
                  {t.text}
                </span>
              ))}
              {'\n'}
            </div>
          ))}
        </pre>
        <textarea
          ref={textarea}
          onKeyDown={onKeyDown}
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            setScrollTop(e.currentTarget.scrollTop)
            setScrollLeft(e.currentTarget.scrollLeft)
          }}
          spellCheck="false"
          wrap="off"
          className="editor-textarea"
        />
      </div>
    </div>
  )
}
