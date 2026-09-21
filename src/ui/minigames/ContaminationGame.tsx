import { Stage, Timer, useCountdown, useGameState, useRaf, type MinigameProps } from './shell'

const ROUND = 14
const MATURE = 3.4
const SPAWN_EVERY = 1.05
/**
 * Hard ceiling on live spores. Without it, every maturing spore seeding a
 * replacement compounds and the board is unwinnable inside six seconds --
 * the pressure should build, not detonate.
 */
const MAX_SPORES = 8

interface Spore {
  id: number
  x: number
  y: number
  age: number
}

interface State {
  spores: Spore[]
  cleared: number
  missed: number
  nextId: number
  sinceSpawn: number
  done: boolean
}

/**
 * Wild yeast in the mash. Spores keep landing; clear each one before it
 * matures or it seeds another and falling behind compounds.
 */
export function ContaminationGame({ onDone }: MinigameProps) {
  const [st, sync] = useGameState<State>(() => ({
    spores: [], cleared: 0, missed: 0, nextId: 1, sinceSpawn: 0, done: false,
  }))

  const spawn = (count: number) => {
    for (let i = 0; i < count; i++) {
      if (st.spores.length >= MAX_SPORES) return
      st.spores.push({
        id: st.nextId++,
        x: 10 + Math.random() * 80,
        y: 14 + Math.random() * 72,
        age: 0,
      })
    }
  }

  const finish = () => {
    if (st.done) return
    st.done = true
    sync()
    const total = st.cleared + st.missed
    onDone(total === 0 ? 0.5 : st.cleared / total)
  }

  const left = useCountdown(ROUND, finish, !st.done)

  useRaf((dt) => {
    if (st.done) return

    st.sinceSpawn += dt
    if (st.sinceSpawn >= SPAWN_EVERY) {
      st.sinceSpawn = 0
      spawn(1)
    }

    let matured = 0
    const survivors: Spore[] = []
    for (const s of st.spores) {
      s.age += dt
      if (s.age >= MATURE) matured++
      else survivors.push(s)
    }
    st.spores = survivors

    if (matured > 0) {
      st.missed += matured
      spawn(matured)
    }

    sync()
  }, !st.done)

  const pop = (id: number) => {
    if (st.done) return
    const before = st.spores.length
    st.spores = st.spores.filter((s) => s.id !== id)
    if (st.spores.length < before) st.cleared += 1
    sync()
  }

  return (
    <div>
      <Timer left={left} total={ROUND} />
      <Stage>
        {st.spores.map((s) => {
          const t = s.age / MATURE
          const size = 26 + t * 28
          return (
            <button
              key={s.id}
              onPointerDown={(e) => { e.preventDefault(); pop(s.id) }}
              className="absolute rounded-full"
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: size,
                height: size,
                transform: 'translate(-50%, -50%)',
                background: `radial-gradient(circle at 35% 35%, rgba(200,225,190,${0.5 + t * 0.4}), rgba(90,130,80,${0.65 + t * 0.35}))`,
                border: `1px solid ${t > 0.7 ? 'var(--color-danger)' : 'var(--color-ok)'}`,
                boxShadow: t > 0.7 ? '0 0 12px rgba(209,72,60,0.5)' : 'none',
              }}
            />
          )
        })}

        <div className="tnum absolute bottom-2 left-3 text-[11px]">
          <span className="text-ok">{st.cleared} cleared</span>
          <span className="text-cream-dim"> · </span>
          <span style={{ color: st.missed > 0 ? 'var(--color-danger)' : 'var(--color-cream-dim)' }}>
            {st.missed} turned
          </span>
        </div>
      </Stage>
    </div>
  )
}
