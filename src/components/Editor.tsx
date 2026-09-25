import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { nextBookmark } from '../marks'
import { highlightLine } from '../highlight'
import { tabInsertText, shiftTab, enterInsertText } from '../editorKeys'
import { findMatches, nextMatchIndex, prevMatchIndex, type Match } from '../search'
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

export interface EditorHandle {
  jumpBookmark: (dir: 1 | -1) => void
  toggleBookmarkAtCaret: () => void
  openSearch: () => void
}

// Monospace character width in px, needed to scroll a search match's column
// into view (unlike a full-width line, a column position isn't a CSS unit
// the layout gives us for free). Measured via a hidden DOM span, not Canvas's
// measureText: canvas resolves the font-family fallback list independently
// of CSS layout and can land on a different font (and width) than the
// textarea actually renders with.
function charWidth(ta: HTMLTextAreaElement): number {
  const span = document.createElement('span')
  span.textContent = '0'.repeat(20)
  const style = getComputedStyle(ta)
  span.style.font = `${style.fontSize} ${style.fontFamily}`
  span.style.position = 'absolute'
  span.style.visibility = 'hidden'
  span.style.whiteSpace = 'pre'
  document.body.appendChild(span)
  const width = span.getBoundingClientRect().width / 20
  document.body.removeChild(span)
  return width
}

// Both the gutter and the highlight bar are positioned from --line-height
// and the textarea's scrollTop, which is why the textarea must not wrap.
const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  {
    code,
    onChange,
    currentLine,
    breakpoints,
    onToggleBreakpoint,
    bookmarks,
    onToggleBookmark,
    onUndo,
    onRedo,
  }: EditorProps,
  ref,
) {
  const { t } = useI18n()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const lineCount = code.split('\n').length
  const matches = useMemo(() => findMatches(code, searchQuery), [code, searchQuery])
  const currentMatch = matches.length ? currentMatchIndex % matches.length : -1

  const caretLine = (ta: HTMLTextAreaElement) => ta.value.slice(0, ta.selectionStart).split('\n').length
  const lineStartOffset = (value: string, line: number) =>
    value.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0)
  const scrollLineIntoView = (ta: HTMLTextAreaElement, line: number) => {
    // Keep the line visible (fixed 18px lines, 12px padding).
    const top = 12 + (line - 1) * 18
    if (top < ta.scrollTop || top + 18 > ta.scrollTop + ta.clientHeight)
      ta.scrollTop = Math.max(0, top - ta.clientHeight / 2)
  }
  const goToLine = (ta: HTMLTextAreaElement, line: number) => {
    const offset = lineStartOffset(ta.value, line)
    ta.setSelectionRange(offset, offset)
    scrollLineIntoView(ta, line)
  }
  const selectMatch = (ta: HTMLTextAreaElement, m: Match) => {
    const base = lineStartOffset(ta.value, m.line)
    ta.setSelectionRange(base + m.start, base + m.end)
    scrollLineIntoView(ta, m.line)
    const cw = charWidth(ta)
    const left = 12 + m.start * cw
    const right = 12 + m.end * cw
    if (left < ta.scrollLeft || right > ta.scrollLeft + ta.clientWidth)
      ta.scrollLeft = Math.max(0, left - ta.clientWidth / 2)
  }
  const jumpMatch = (dir: 1 | -1) => {
    if (!matches.length) return
    const base = currentMatchIndex % matches.length
    const idx = dir === 1 ? nextMatchIndex(matches.length, base) : prevMatchIndex(matches.length, base)
    setCurrentMatchIndex(idx)
    if (textarea.current) selectMatch(textarea.current, matches[idx])
  }
  const closeSearch = () => {
    setSearchOpen(false)
    textarea.current?.focus()
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
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      setSearchOpen(true)
      // If the bar was already open (e.g. focus moved back to the code),
      // setSearchOpen(true) is a no-op and won't retrigger the focus effect.
      searchInput.current?.focus()
    } else if (e.key === 'F3' && searchOpen) {
      e.preventDefault()
      jumpMatch(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape' && searchOpen) {
      e.preventDefault()
      closeSearch()
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

  useImperativeHandle(ref, () => ({
    jumpBookmark: (dir) => {
      const ta = textarea.current
      if (!ta) return
      const line = nextBookmark(bookmarks, caretLine(ta), dir)
      if (line !== undefined) {
        ta.focus()
        goToLine(ta, line)
      }
    },
    toggleBookmarkAtCaret: () => {
      const ta = textarea.current
      if (!ta) return
      onToggleBookmark(caretLine(ta))
    },
    openSearch: () => {
      setSearchOpen(true)
      searchInput.current?.focus()
    },
  }))

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus()
  }, [searchOpen])
  useEffect(() => setCurrentMatchIndex(0), [searchQuery])

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
        {searchOpen && matches.length > 0 && (
          <div className="search-matches" style={{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }}>
            {matches.map((m, i) => (
              <div
                key={i}
                className={`search-match ${i === currentMatch ? 'current' : ''}`}
                style={{ top: 12 + (m.line - 1) * 18, left: `calc(12px + ${m.start}ch)`, width: `${m.end - m.start}ch` }}
              />
            ))}
          </div>
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
        {searchOpen && (
          <div
            className="search-bar"
            onKeyDown={(e) => {
              // Bubbles up from the input or either button, so Escape also
              // closes the bar when a nav button (not the input) has focus.
              if (e.key === 'Escape') {
                e.preventDefault()
                closeSearch()
              }
            }}
          >
            <input
              ref={searchInput}
              type="text"
              value={searchQuery}
              placeholder={t('search.placeholder')}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'F3') {
                  e.preventDefault()
                  jumpMatch(e.shiftKey ? -1 : 1)
                }
              }}
            />
            <span className="search-count">
              {matches.length
                ? t('search.count', { current: currentMatch + 1, total: matches.length })
                : t('search.noMatches')}
            </span>
            <button type="button" title={t('search.prev')} disabled={!matches.length} onClick={() => jumpMatch(-1)}>
              ▲
            </button>
            <button type="button" title={t('search.next')} disabled={!matches.length} onClick={() => jumpMatch(1)}>
              ▼
            </button>
            <button type="button" title={t('search.close')} onClick={closeSearch}>
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

export default Editor
