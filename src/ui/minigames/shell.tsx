import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/** Every minigame reports a single 0..1 score and nothing else. */
export interface MinigameProps {
  onDone: (score: number) => void
}

/**
 * Frame loop with a stable identity.
 *
 * The callback is held in a ref so a game can close over changing state
 * without restarting the loop every render -- restarting mid-game would
 * reset `last` and produce a huge first dt.
 */
export function useRaf(fn: (dt: number) => void, active = true): void {
  const ref = useRef(fn)
  ref.current = fn

  useEffect(() => {
    if (!active) return
    let handle = 0
    let last = performance.now()

    const loop = (now: number) => {
      // Clamped: a backgrounded tab can hand back a dt of several seconds,
      // which would teleport every moving part across the screen.
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      ref.current(dt)
      handle = requestAnimationFrame(loop)
    }

    handle = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(handle)
  }, [active])
}

/**
 * Authoritative mutable game state, mirrored to React once per frame.
 *
 * The games previously kept everything in useState and mutated it from
 * inside updater functions. That is impure: React invokes updaters twice
 * under StrictMode and may call them again under concurrent rendering, which
 * double-counted scores and spawned duplicate entities. Simulation state
 * lives in the ref; `sync()` only asks React to paint.
 */
export function useGameState<T extends object>(init: () => T): readonly [T, () => void] {
  const ref = useRef<T | null>(null)
  if (ref.current === null) ref.current = init()

  const [, bump] = useState(0)
  const sync = useCallback(() => bump((n) => n + 1), [])

  return [ref.current, sync] as const
}

/**
 * Counts a round down and fires `onEnd` exactly once.
 *
 * `onEnd` is invoked from the frame callback, never from inside a state
 * updater, for the reason above.
 */
export function useCountdown(seconds: number, onEnd: () => void, active = true): number {
  const [left, setLeft] = useState(seconds)
  const remaining = useRef(seconds)
  const ended = useRef(false)
  const endRef = useRef(onEnd)
  endRef.current = onEnd

  useRaf((dt) => {
    if (ended.current) return

    remaining.current = Math.max(0, remaining.current - dt)
    setLeft(remaining.current)

    if (remaining.current <= 0) {
      ended.current = true
      endRef.current()
    }
  }, active)

  return left
}

export function Timer({ left, total }: { left: number; total: number }) {
  const pct = (left / total) * 100
  return (
    <div className="meter mb-4">
      <span
        style={{
          width: `${pct}%`,
          background: pct < 25 ? 'var(--color-danger)' : 'var(--color-brass-400)',
        }}
      />
    </div>
  )
}

export function Stage({ children }: { children: ReactNode }) {
  return (
    <div
      className="panel-raised relative w-full overflow-hidden select-none"
      style={{ height: 260, touchAction: 'none' }}
    >
      {children}
    </div>
  )
}
