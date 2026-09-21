import { useEffect, useRef, useState, type ReactNode } from 'react'
import { big, fmtMoney, fmt, type Big } from '../engine/bignum'

// ---------------------------------------------------------------------------
// Smoothed counters
// ---------------------------------------------------------------------------

/**
 * Follows a value continuously instead of snapping to it.
 *
 * The engine publishes four times a second, which reads as a stutter on a
 * number that should be flowing. This smooths toward the target every frame
 * with a time-normalised constant, so it tracks at any refresh rate. Big
 * throughout, because these numbers pass 1e308.
 */
export function useSmoothed(target: Big, tau = 0.18): Big {
  const [, bump] = useState(0)
  const display = useRef(target)
  const goal = useRef(target)
  goal.current = target

  useEffect(() => {
    let handle = 0
    let last = performance.now()

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now

      const diff = goal.current.sub(display.current)
      const gap = diff.abs()

      if (gap.lte(big(0))) {
        handle = requestAnimationFrame(loop)
        return
      }

      // Close enough that another frame of easing would not be visible.
      const threshold = goal.current.abs().mul(big(0.0005))
      if (gap.lt(threshold) || gap.lt(big(0.01))) {
        display.current = goal.current
      } else {
        // A fixed time constant eases by a fixed FRACTION per frame, so the
        // time to converge scales with the log of the gap -- a cash-out that
        // drops billions to nothing would crawl for seconds. Large relative
        // corrections get a much shorter constant.
        const relative = goal.current.abs().gt(big(0))
          ? gap.div(goal.current.abs()).toNumber()
          : Infinity
        const effectiveTau = relative > 10 ? tau * 0.12 : tau

        display.current = display.current.add(diff.mul(big(1 - Math.exp(-dt / effectiveTau))))
      }

      bump((n) => (n + 1) % 1000)
      handle = requestAnimationFrame(loop)
    }

    handle = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(handle)
  }, [tau])

  return display.current
}

/** A money figure that flows, and flinches when it is spent. */
export function Money({
  value, className, style, decimals = 2,
}: { value: Big; className?: string; style?: React.CSSProperties; decimals?: number }) {
  const shown = useSmoothed(value)
  const [spent, setSpent] = useState(false)
  const prev = useRef(value)

  useEffect(() => {
    // Only a real spend, not the constant small drain of payroll and
    // laundering -- otherwise the figure sits permanently red and the
    // signal means nothing.
    const drop = prev.current.sub(value)
    const meaningful = drop.gt(prev.current.mul(big(0.02)))

    prev.current = value
    if (!meaningful) return

    setSpent(true)
    const t = window.setTimeout(() => setSpent(false), 380)
    return () => window.clearTimeout(t)
  }, [value])

  return (
    <span
      className={`tnum ${className ?? ''}`}
      style={{
        ...style,
        transition: 'color 160ms ease, transform 160ms ease',
        ...(spent ? { color: 'var(--color-danger)', transform: 'translateY(2px)' } : {}),
        display: 'inline-block',
      }}
    >
      {fmtMoney(shown, decimals)}
    </span>
  )
}

/** A plain figure that flows. */
export function Num({ value, className, decimals = 2 }: { value: Big; className?: string; decimals?: number }) {
  const shown = useSmoothed(value)
  return <span className={`tnum ${className ?? ''}`}>{fmt(shown, decimals)}</span>
}

// ---------------------------------------------------------------------------
// Floaters
// ---------------------------------------------------------------------------

export interface Floater {
  id: number
  text: string
  tone: 'good' | 'bad' | 'brass'
}

type Listener = (f: Floater) => void

let nextFloatId = 1
const listeners = new Set<Listener>()

/**
 * Announce something discrete: a purchase, a find, a loss.
 *
 * Deliberately not used for income, which arrives continuously -- a floater
 * per tick would be a blizzard. The flowing counter is what shows income.
 */
export function emitFloat(text: string, tone: Floater['tone'] = 'brass'): void {
  const f = { id: nextFloatId++, text, tone }
  for (const fn of listeners) fn(f)
}

export function FloatLayer() {
  const [items, setItems] = useState<Floater[]>([])

  useEffect(() => {
    const onFloat = (f: Floater) => {
      setItems((prev) => [...prev.slice(-5), f])
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== f.id))
      }, 1300)
    }
    listeners.add(onFloat)
    return () => { listeners.delete(onFloat) }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[22%] z-[45] flex flex-col items-center gap-1">
      {items.map((f) => (
        <div
          key={f.id}
          className="tnum text-sm font-semibold"
          style={{
            color: f.tone === 'good' ? 'var(--color-ok)'
              : f.tone === 'bad' ? 'var(--color-danger)'
              : 'var(--color-brass-400)',
            textShadow: '0 2px 10px rgba(0,0,0,0.9)',
            animation: 'float-up 1.3s cubic-bezier(0.22, 1, 0.36, 1) forwards',
          }}
        >
          {f.text}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entrance motion
// ---------------------------------------------------------------------------

/** Staggered entrance for a list, so panels assemble rather than appear. */
export function Stagger({ children, index = 0 }: { children: ReactNode; index?: number }) {
  return (
    <div style={{ animation: `rise-in 380ms cubic-bezier(0.22, 1, 0.36, 1) ${Math.min(index * 45, 360)}ms both` }}>
      {children}
    </div>
  )
}
