import { useEffect, useRef, useState } from 'react'
import { useGame, useUi } from '../store/gameStore'
import type { GameEvent } from '../engine/types'

/** Kinds loud enough to interrupt. Everything else lives in the log. */
const INTERRUPTS: GameEvent['kind'][] = ['raid', 'badBatch', 'bandUp']

/**
 * A raid takes a third of the stock. Letting that happen silently while the
 * player is looking at another screen is the difference between a pressure
 * system and an inexplicable loss.
 */
export function EventToast() {
  const g = useGame()
  const setTab = useUi((s) => s.setTab)
  const [shown, setShown] = useState<GameEvent | null>(null)
  const lastSeen = useRef(0)
  const newestId = g.events[0]?.id ?? 0

  useEffect(() => {
    const newest = g.events[0]
    if (!newest || newest.id <= lastSeen.current) return
    lastSeen.current = newest.id
    if (!INTERRUPTS.includes(newest.kind)) return

    setShown(newest)
    const t = window.setTimeout(() => setShown(null), 6500)
    return () => window.clearTimeout(t)
    // Keyed on the newest id: the events array is rebuilt every publish, so
    // comparing the array itself would fire constantly.
  }, [newestId, g.events])

  if (!shown) return null

  return (
    <button
      onClick={() => { setTab('law'); setShown(null) }}
      className="panel fixed inset-x-3 top-3 z-40 mx-auto max-w-lg p-3 text-left"
      style={{
        borderColor: shown.tone === 'bad' ? 'var(--color-danger)' : 'var(--color-brass-500)',
        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.9)',
        animation: 'toast-in 260ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1 h-2 w-2 shrink-0 rounded-full"
          style={{ background: shown.tone === 'bad' ? 'var(--color-danger)' : 'var(--color-brass-400)' }}
        />
        <div className="min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.16em]"
            style={{ color: shown.tone === 'bad' ? 'var(--color-danger)' : 'var(--color-brass-400)' }}
          >
            {shown.kind === 'raid' ? 'Raid' : shown.kind === 'badBatch' ? 'Bad batch' : 'Heads up'}
          </div>
          <div className="text-cream mt-1 text-xs leading-relaxed">{shown.text}</div>
        </div>
      </div>
    </button>
  )
}
