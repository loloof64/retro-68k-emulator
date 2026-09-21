import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { FRAMEBUFFER_START, INPUT_START, SOUND_START, USER_RAM_START, type SystemMemory } from '../memory'
import { asciiChar, hex, parseAddress, ROW_BYTES, windowBase, WINDOW_BYTES, WINDOW_ROWS } from '../memoryView'

interface MemoryViewProps {
  memory: SystemMemory
  pc: number
  a7: number
  tick: number // bumped by the Debugger whenever the CPU/memory may have changed
  isRunning: boolean
  onEdit: () => void // a byte was edited by hand: the screen may need a repaint
}

const readWindow = (memory: SystemMemory, base: number) => {
  const bytes: number[] = []
  for (let i = 0; i < WINDOW_BYTES; i++) {
    try {
      bytes.push(memory.read8(base + i))
    } catch {
      break // last window can end short of a full page
    }
  }
  return bytes
}

// Read-only hex dump of a 128-byte window. Bytes the program wrote since the previous
// refresh are highlighted; the byte at PC is marked. With "follow" on, the window
// jumps to the last address written on Step and Pause (never while running).
export default function MemoryView({ memory, pc, a7, tick, isRunning, onEdit }: MemoryViewProps) {
  const { t } = useI18n()
  const [base, setBase] = useState(USER_RAM_START)
  const [goto, setGoto] = useState('')
  const [follow, setFollow] = useState(true)
  const [editAt, setEditAt] = useState<number | null>(null) // address of the byte being edited
  const [draft, setDraft] = useState('')
  const editing = isRunning ? null : editAt // no editing while the program runs
  const followRef = useRef({ follow, isRunning })
  followRef.current = { follow, isRunning }

  // Taken once per refresh (keyed by tick, so re-renders from typing keep the highlight).
  const writes = useRef({ tick: -1, last: undefined as number | undefined, bytes: new Set<number>() })
  if (writes.current.tick !== tick) {
    const w = memory.takeWrites()
    writes.current = { tick, last: w.last, bytes: w.bytes }
  }
  const { last, bytes: written } = writes.current

  useEffect(() => {
    if (followRef.current.follow && !followRef.current.isRunning && last !== undefined) {
      setBase(windowBase(last))
    }
  }, [tick, last])

  const cur = readWindow(memory, base)
  const jump = (address: number) => {
    setFollow(false) // navigating by hand: stay where the user put the window
    setBase(windowBase(address))
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const address = parseAddress(goto)
    if (address !== null) jump(address)
  }

  const startEdit = (address: number, value: number) => {
    if (isRunning) return
    setEditAt(address)
    setDraft(hex(value, 2))
  }
  // Enter: store the byte and move on to the next one (handy to type a run of values).
  const commit = () => {
    if (editAt === null || !/^[0-9a-f]{1,2}$/i.test(draft)) return
    memory.patch8(editAt, parseInt(draft, 16))
    onEdit()
    const next = editAt + 1
    if (next < base + cur.length) startEdit(next, memory.read8(next))
    else setEditAt(null)
  }

  const rows = []
  for (let r = 0; r < WINDOW_ROWS && r * ROW_BYTES < cur.length; r++) {
    const bytes = cur.slice(r * ROW_BYTES, (r + 1) * ROW_BYTES)
    rows.push(
      <div key={r} className="mem-row">
        <span className="mem-addr">${hex(base + r * ROW_BYTES, 6)}</span>
        {bytes.map((b, i) => {
          const at = r * ROW_BYTES + i
          const cls = ['mem-byte']
          if (written.has(base + at)) cls.push('changed')
          if (base + at === pc) cls.push('pc')
          const address = base + at
          if (address === editing) {
            const valid = /^[0-9a-f]{1,2}$/i.test(draft)
            return (
              <input
                key={i}
                className={`mem-edit${valid ? '' : ' invalid'}`}
                value={draft}
                maxLength={2}
                autoFocus
                onFocus={(e) => e.target.select()}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => setEditAt(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit()
                  else if (e.key === 'Escape') setEditAt(null)
                }}
                aria-label={t('memory.edit')}
              />
            )
          }
          return (
            <span
              key={i}
              className={cls.join(' ')}
              title={isRunning ? undefined : t('memory.edit')}
              onClick={() => startEdit(address, b)}
            >
              {hex(b, 2)}
            </span>
          )
        })}
        <span className="mem-ascii">{bytes.map(asciiChar).join('')}</span>
      </div>,
    )
  }

  const shortcuts: [string, number][] = [
    [t('memory.pc'), pc],
    [t('memory.stack'), a7],
    [t('memory.program'), USER_RAM_START],
    [t('memory.screen'), FRAMEBUFFER_START],
    [t('memory.input'), INPUT_START],
    [t('memory.sound'), SOUND_START],
  ]

  return (
    <div className="memory-section">
      <div className="mem-header">
        <h3>{t('memory')}</h3>
        <label className="mem-follow">
          <input
            type="checkbox"
            checked={follow}
            disabled={isRunning}
            onChange={(e) => setFollow(e.target.checked)}
          />
          {t('memory.follow')}
        </label>
      </div>
      <form className="mem-controls" onSubmit={submit}>
        <button type="button" className="btn" onClick={() => jump(base - WINDOW_BYTES)} aria-label={t('memory.prev')}>
          ◀
        </button>
        <input
          value={goto}
          onChange={(e) => setGoto(e.target.value)}
          placeholder={t('memory.goto')}
          aria-label={t('memory.goto')}
          size={10}
        />
        <button type="button" className="btn" onClick={() => jump(base + WINDOW_BYTES)} aria-label={t('memory.next')}>
          ▶
        </button>
      </form>
      <div className="mem-shortcuts">
        {shortcuts.map(([label, address]) => (
          <button key={label} type="button" className="btn" onClick={() => jump(address)}>
            {label}
          </button>
        ))}
      </div>
      <div className="mem-dump">{rows}</div>
    </div>
  )
}
