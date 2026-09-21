import { Stage, Timer, useCountdown, useGameState, useRaf, type MinigameProps } from './shell'

const ROUND = 18
const ZONE_HALF = 9
const FILL_SECONDS = 4
const LANES = ['Mash', 'Heat', 'Time'] as const

interface Lane {
  value: number
  target: number
  drift: number
}

interface State {
  lanes: Lane[]
  progress: number
  done: boolean
}

/**
 * Three settings, three drifting sweet spots. Hold all of them at once and
 * the batch comes together; let one slip and progress stalls.
 */
export function BalanceGame({ onDone }: MinigameProps) {
  const [st, sync] = useGameState<State>(() => ({
    lanes: LANES.map(() => ({
      value: 20 + Math.random() * 60,
      target: 20 + Math.random() * 60,
      drift: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 4),
    })),
    progress: 0,
    done: false,
  }))

  const finish = (score: number) => {
    if (st.done) return
    st.done = true
    sync()
    onDone(score)
  }

  const left = useCountdown(ROUND, () => finish(st.progress), !st.done)

  useRaf((dt) => {
    if (st.done) return

    for (const l of st.lanes) {
      l.target += l.drift * dt
      if (l.target < 10) { l.target = 10; l.drift = Math.abs(l.drift) }
      if (l.target > 90) { l.target = 90; l.drift = -Math.abs(l.drift) }
    }

    if (aligned(st)) {
      st.progress = Math.min(1, st.progress + dt / FILL_SECONDS)
      if (st.progress >= 1) { finish(1); return }
    }

    sync()
  }, !st.done)

  const allIn = aligned(st)

  return (
    <div>
      <Timer left={left} total={ROUND} />
      <Stage>
        <div className="flex h-full flex-col justify-center gap-5 px-4">
          {st.lanes.map((l, i) => {
            const inZone = Math.abs(l.value - l.target) <= ZONE_HALF
            return (
              <div key={LANES[i]}>
                <div className="mb-1.5 flex justify-between text-[10px] uppercase tracking-[0.14em]">
                  <span className="text-cream-dim">{LANES[i]}</span>
                  <span style={{ color: inZone ? 'var(--color-ok)' : 'var(--color-cream-dim)' }}>
                    {inZone ? 'holding' : 'off'}
                  </span>
                </div>
                <div className="relative h-6">
                  <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--color-ink-900)]" />
                  <div
                    className="absolute top-1/2 h-5 -translate-y-1/2 rounded-sm transition-colors"
                    style={{
                      left: `${l.target - ZONE_HALF}%`,
                      width: `${ZONE_HALF * 2}%`,
                      background: inZone ? 'rgba(97,164,111,0.45)' : 'rgba(224,185,74,0.22)',
                      border: `1px solid ${inZone ? 'var(--color-ok)' : 'var(--color-brass-600)'}`,
                    }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={l.value}
                    onChange={(e) => {
                      st.lanes[i].value = Number(e.target.value)
                      sync()
                    }}
                    className="cut-slider absolute inset-x-0 top-1/2 -translate-y-1/2"
                    style={{ background: 'transparent' }}
                  />
                </div>
              </div>
            )
          })}

          <div>
            <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[0.14em]">
              <span className="text-cream-dim">Batch</span>
              <span className="tnum" style={{ color: allIn ? 'var(--color-ok)' : 'var(--color-cream-dim)' }}>
                {Math.round(st.progress * 100)}%
              </span>
            </div>
            <div className="meter">
              <span
                style={{
                  width: `${st.progress * 100}%`,
                  background: allIn ? 'var(--color-ok)' : 'var(--color-brass-500)',
                }}
              />
            </div>
          </div>
        </div>
      </Stage>
    </div>
  )
}

function aligned(st: State): boolean {
  return st.lanes.every((l) => Math.abs(l.value - l.target) <= ZONE_HALF)
}
