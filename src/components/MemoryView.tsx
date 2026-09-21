import { useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { FRAMEBUFFER_START, INPUT_START, SOUND_START, USER_RAM_START, type SystemMemory } from '../memory'
import { asciiChar, hex, parseAddress, ROW_BYTES, windowBase, WINDOW_BYTES, WINDOW_ROWS } from '../memoryView'

interface MemoryViewProps {
  memory: SystemMemory
  pc: number
  a7: number
  tick: number // bumped by the Debugger whenever the CPU/memory may have changed
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

// Read-only hex dump of a 128-byte window. Bytes that changed since the previous
// refresh are highlighted; the byte at PC is marked.
export default function MemoryView({ memory, pc, a7, tick }: MemoryViewProps) {
  const { t } = useI18n()
  const [base, setBase] = useState(USER_RAM_START)
  const [goto, setGoto] = useState('')
  const snap = useRef({ tick, base, prev: [] as number[], cur: [] as number[] })

  // Snapshot once per refresh (keyed, so re-renders from typing don't clear the highlight).
  const s = snap.current
  if (s.tick !== tick || s.base !== base || s.cur.length === 0) {
    s.prev = s.base === base && s.cur.length ? s.cur : []
    s.cur = readWindow(memory, base)
    s.tick = tick
    s.base = base
  }
  const { cur, prev } = s

  const jump = (address: number) => setBase(windowBase(address))
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const address = parseAddress(goto)
    if (address !== null) jump(address)
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
          if (prev.length && prev[at] !== b) cls.push('changed')
          if (base + at === pc) cls.push('pc')
          return (
            <span key={i} className={cls.join(' ')}>
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
      <h3>{t('memory')}</h3>
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
