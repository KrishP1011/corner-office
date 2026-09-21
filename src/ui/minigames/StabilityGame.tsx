import { Stage, Timer, useCountdown, useGameState, useRaf, type MinigameProps } from './shell'

const ROUND = 16
const BAND = 18

interface State {
  needle: number
  velocity: number
  push: number
  inBand: number
  elapsed: number
  done: boolean
}

/**
 * A column still runs away if you look at it wrong. Hold the temperature in
 * the band; the longer it stays there, the cleaner the cut comes off.
 */
export function StabilityGame({ onDone }: MinigameProps) {
  const [st, sync] = useGameState<State>(() => ({
    needle: 50, velocity: 0, push: 0, inBand: 0, elapsed: 0, done: false,
  }))

  const finish = () => {
    if (st.done) return
    st.done = true
    sync()
    onDone(st.elapsed > 0 ? Math.min(1, st.inBand / st.elapsed) : 0)
  }

  const left = useCountdown(ROUND, finish, !st.done)

  useRaf((dt) => {
    if (st.done) return

    // Random walk with momentum, so it wanders rather than jitters.
    st.velocity += (Math.random() - 0.5) * 60 * dt
    st.velocity += st.push * 52 * dt
    st.velocity *= 0.94

    st.needle += st.velocity * dt
    if (st.needle < 2) { st.needle = 2; st.velocity = Math.abs(st.velocity) * 0.4 }
    if (st.needle > 98) { st.needle = 98; st.velocity = -Math.abs(st.velocity) * 0.4 }

    if (Math.abs(st.needle - 50) <= BAND / 2) st.inBand += dt
    st.elapsed += dt

    sync()
  }, !st.done)

  const steady = Math.abs(st.needle - 50) <= BAND / 2
  const hold = (dir: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    st.push = dir
  }
  const release = () => { st.push = 0 }

  return (
    <div>
      <Timer left={left} total={ROUND} />
      <Stage>
        <div className="flex h-full flex-col justify-center px-6">
          <div className="relative h-16">
            <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-[var(--color-ink-900)]" />
            <div
              className="absolute top-1/2 h-12 -translate-y-1/2 rounded transition-colors"
              style={{
                left: `${50 - BAND / 2}%`,
                width: `${BAND}%`,
                background: steady ? 'rgba(97,164,111,0.30)' : 'rgba(224,185,74,0.16)',
                border: `1px solid ${steady ? 'var(--color-ok)' : 'var(--color-brass-600)'}`,
              }}
            />
            <div
              className="absolute top-1/2 h-14 w-1.5 -translate-y-1/2 rounded-full"
              style={{
                left: `${st.needle}%`,
                background: steady ? 'var(--color-ok)' : 'var(--color-danger)',
                boxShadow: `0 0 12px ${steady ? 'rgba(97,164,111,0.7)' : 'rgba(209,72,60,0.7)'}`,
              }}
            />
          </div>

          <div className="mt-6 flex gap-3">
            <button
              className="btn flex-1 py-4 text-base"
              onPointerDown={hold(-1)} onPointerUp={release}
              onPointerLeave={release} onPointerCancel={release}
            >
              ◀ cool
            </button>
            <button
              className="btn flex-1 py-4 text-base"
              onPointerDown={hold(1)} onPointerUp={release}
              onPointerLeave={release} onPointerCancel={release}
            >
              heat ▶
            </button>
          </div>

          <div className="tnum mt-4 text-center text-[11px]">
            <span style={{ color: steady ? 'var(--color-ok)' : 'var(--color-cream-dim)' }}>
              {st.elapsed > 0 ? Math.round((st.inBand / st.elapsed) * 100) : 0}% steady
            </span>
          </div>
        </div>
      </Stage>
    </div>
  )
}
