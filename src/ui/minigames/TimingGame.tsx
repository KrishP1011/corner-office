import { Stage, useGameState, useRaf, type MinigameProps } from './shell'

const ATTEMPTS = 3

interface State {
  pos: number
  dir: number
  round: number
  results: number[]
  flash: string | null
  locked: boolean
  done: boolean
}

/**
 * Cutting the heads off a run. Three passes; each hit narrows the window and
 * speeds the sweep, so a clean sweep takes real attention.
 */
export function TimingGame({ onDone }: MinigameProps) {
  const [st, sync] = useGameState<State>(() => ({
    pos: 0, dir: 1, round: 0, results: [], flash: null, locked: false, done: false,
  }))

  const half = 11 - st.round * 3
  const speed = 60 + st.round * 26
  const center = 50

  useRaf((dt) => {
    if (st.done) return

    st.pos += st.dir * speed * dt
    if (st.pos >= 100) { st.pos = 100; st.dir = -1 }
    if (st.pos <= 0) { st.pos = 0; st.dir = 1 }

    sync()
  }, !st.done)

  const tap = () => {
    if (st.done || st.locked) return
    st.locked = true

    const distance = Math.abs(st.pos - center)
    // Partial credit: dead centre pays fully, the edge of the window a little.
    const hit = distance <= half ? 1 - (distance / half) * 0.45 : 0

    st.results.push(hit)
    st.flash = hit === 0 ? 'missed' : hit > 0.8 ? 'clean' : 'close'
    sync()

    window.setTimeout(() => {
      if (st.done) return
      st.flash = null
      st.locked = false

      if (st.results.length >= ATTEMPTS) {
        st.done = true
        sync()
        onDone(st.results.reduce((a, b) => a + b, 0) / ATTEMPTS)
      } else {
        st.round += 1
        st.pos = 0
        st.dir = 1
        sync()
      }
    }, 550)
  }

  return (
    <div>
      <div className="mb-3 flex justify-center gap-2">
        {Array.from({ length: ATTEMPTS }).map((_, i) => (
          <div
            key={i}
            className="h-1.5 w-10 rounded-full"
            style={{
              background: i < st.results.length
                ? st.results[i] === 0 ? 'var(--color-danger)'
                  : st.results[i] > 0.8 ? 'var(--color-ok)' : 'var(--color-warn)'
                : 'var(--color-ink-600)',
            }}
          />
        ))}
      </div>

      <Stage>
        <button
          onPointerDown={(e) => { e.preventDefault(); tap() }}
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <div className="relative h-12 w-full px-6">
            <div className="absolute inset-x-6 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--color-ink-900)]" />
            <div
              className="absolute top-1/2 h-8 -translate-y-1/2 rounded"
              style={{
                left: `${center - half}%`,
                width: `${half * 2}%`,
                background: 'rgba(97,164,111,0.28)',
                border: '1px solid var(--color-ok)',
              }}
            />
            <div
              className="absolute top-1/2 h-10 w-1 -translate-y-1/2 rounded-full bg-[var(--color-brass-300)]"
              style={{ left: `${st.pos}%`, boxShadow: '0 0 10px var(--color-brass-400)' }}
            />
          </div>

          <div className="mt-6 text-[11px] uppercase tracking-[0.18em]">
            {st.flash ? (
              <span
                style={{
                  color: st.flash === 'missed' ? 'var(--color-danger)'
                    : st.flash === 'clean' ? 'var(--color-ok)' : 'var(--color-warn)',
                }}
              >
                {st.flash}
              </span>
            ) : (
              <span className="text-cream-dim">tap in the green</span>
            )}
          </div>
        </button>
      </Stage>
    </div>
  )
}
