import { useRef } from 'react'
import { Stage, Timer, useCountdown, useGameState, useRaf, type MinigameProps } from './shell'

const ROUND = 16
const MAX_HITS = 4
const SPAWN_EVERY = 0.62
const BOAT_Y = 86

interface Patrol {
  id: number
  x: number
  y: number
  speed: number
}

interface State {
  boat: number
  patrols: Patrol[]
  hits: number
  passed: number
  nextId: number
  sinceSpawn: number
  done: boolean
}

/**
 * The run in from Rum Row. Steer the boat down the channel; every cutter you
 * slip past is cargo that lands quietly.
 */
export function RouteGame({ onDone }: MinigameProps) {
  const [st, sync] = useGameState<State>(() => ({
    boat: 50, patrols: [], hits: 0, passed: 0, nextId: 1, sinceSpawn: 0, done: false,
  }))
  const stageRef = useRef<HTMLDivElement>(null)

  const finish = () => {
    if (st.done) return
    st.done = true
    sync()
    onDone(Math.max(0, 1 - st.hits / MAX_HITS))
  }

  const left = useCountdown(ROUND, finish, !st.done)

  useRaf((dt) => {
    if (st.done) return

    st.sinceSpawn += dt
    if (st.sinceSpawn >= SPAWN_EVERY) {
      st.sinceSpawn = 0
      st.patrols.push({
        id: st.nextId++,
        x: 10 + Math.random() * 80,
        y: -8,
        speed: 34 + Math.random() * 22,
      })
    }

    const kept: Patrol[] = []
    for (const p of st.patrols) {
      p.y += p.speed * dt

      if (p.y > BOAT_Y - 6 && p.y < BOAT_Y + 8 && Math.abs(p.x - st.boat) < 11) {
        st.hits += 1
        continue
      }
      if (p.y > 108) { st.passed += 1; continue }
      kept.push(p)
    }
    st.patrols = kept

    if (st.hits >= MAX_HITS) { finish(); return }
    sync()
  }, !st.done)

  const steer = (clientX: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || st.done) return
    st.boat = Math.max(6, Math.min(94, ((clientX - rect.left) / rect.width) * 100))
    sync()
  }

  return (
    <div>
      <Timer left={left} total={ROUND} />
      <div
        ref={stageRef}
        onPointerMove={(e) => { e.preventDefault(); steer(e.clientX) }}
        onPointerDown={(e) => { e.preventDefault(); steer(e.clientX) }}
      >
        <Stage>
          <div className="absolute inset-y-0 left-1/4 w-px bg-[var(--color-ink-600)]" />
          <div className="absolute inset-y-0 left-3/4 w-px bg-[var(--color-ink-600)]" />

          {st.patrols.map((p) => (
            <div
              key={p.id}
              className="absolute rounded-sm"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: 34,
                height: 14,
                transform: 'translate(-50%, -50%)',
                background: 'linear-gradient(to bottom, var(--color-danger), #7d2a22)',
                border: '1px solid #e0685c',
                boxShadow: '0 0 10px rgba(209,72,60,0.4)',
              }}
            />
          ))}

          <div
            className="absolute"
            style={{
              left: `${st.boat}%`,
              top: `${BOAT_Y}%`,
              width: 20,
              height: 26,
              transform: 'translate(-50%, -50%)',
              background: 'linear-gradient(to bottom, var(--color-brass-300), var(--color-brass-600))',
              clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
            }}
          />

          <div className="tnum absolute bottom-2 left-3 text-[11px]">
            <span className="text-ok">{st.passed} slipped past</span>
            <span className="text-cream-dim"> · </span>
            <span style={{ color: st.hits > 0 ? 'var(--color-danger)' : 'var(--color-cream-dim)' }}>
              {st.hits}/{MAX_HITS} spotted
            </span>
          </div>
        </Stage>
      </div>
      <p className="text-cream-dim mt-2 text-center text-[11px]">drag to steer</p>
    </div>
  )
}
