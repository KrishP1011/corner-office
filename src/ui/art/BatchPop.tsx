import { useEffect, useRef, useState } from 'react'
import { ProductIcon } from './ProductIcon'
import { sfx } from '../../audio/sfx'

interface Pop { id: number; drift: number }

/**
 * The moment a batch comes off.
 *
 * Production was invisible: a bar filled, a number changed, and nothing
 * happened. This is the beat that was missing -- a bottle lifts out of the
 * jar and away every time a cycle completes, so the thing you built is
 * visibly doing something.
 *
 * Detected from the cycle bar resetting, which is already published state,
 * rather than adding an event for it.
 */
export function BatchPop({ productId, cyclePct, rate }: { productId: string; cyclePct: number; rate: number }) {
  const [pops, setPops] = useState<Pop[]>([])
  const prev = useRef(cyclePct)
  const nextId = useRef(1)
  const lastSound = useRef(0)

  useEffect(() => {
    const dropped = prev.current > 55 && cyclePct < prev.current - 25
    prev.current = cyclePct
    if (!dropped) return

    const id = nextId.current++
    setPops((p) => [...p.slice(-4), { id, drift: (Math.random() - 0.5) * 40 }])
    window.setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 950)

    // Fast lines complete many times a second; a chime per batch would be a
    // machine gun. Cap it at a few a second.
    const now = performance.now()
    if (now - lastSound.current > 320) {
      lastSound.current = now
      sfx.play('coin')
    }
  }, [cyclePct])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pops.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{
            right: '14%',
            bottom: '22%',
            ['--drift' as string]: `${p.drift}px`,
            animation: 'batch-out 950ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
          }}
        >
          <ProductIcon id={productId} size={26} active />
        </div>
      ))}

      {/* How fast they are coming, for lines too quick to count */}
      {rate > 3 && (
        <div
          className="tnum absolute right-3 top-2 text-[10px]"
          style={{ color: 'var(--color-brass-400)', opacity: 0.75 }}
        >
          {rate > 1000 ? 'pouring' : `${Math.round(rate)} a second`}
        </div>
      )}
    </div>
  )
}
