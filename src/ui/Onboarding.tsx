import { useEffect, useState } from 'react'
import { engine, useGame } from '../store/gameStore'
import { sfx } from '../audio/sfx'

const BEATS = [
  {
    title: 'You make it and you move it',
    body: 'Cider first, out of a shack in the woods. Every still you build runs on its own, whether you are watching or not.',
  },
  {
    title: 'The whole game is one decision',
    body: 'Water it down and you get more bottles out of the same batch — more bottles, more money, right now. But thin product moves in more hands, and hands get noticed. Cut too far and nobody will touch it at all.',
  },
  {
    title: 'Suspicion is the price of volume',
    body: 'It builds with everything you move. Fronts wash the money and explain your presence; a payoff buys quiet. Let it run and they come through the door.',
  },
  {
    title: 'Loose cash is not yours yet',
    body: 'Stills and payoffs come out of loose cash. Everything that makes you bigger — rooms, new lines, fronts — comes out of what you have banked, and the only way money gets there is through a business that can explain it.',
  },
]

/** First-run introduction. Four beats, skippable, shown once. */
export function Intro() {
  const g = useGame()
  const [beat, setBeat] = useState(0)
  const [gone, setGone] = useState(false)

  const done = g.hintsSeen.includes('intro') || gone
  if (done) return null

  const finish = () => {
    setGone(true)
    engine.markHint('intro')
    sfx.play('good')
  }

  const b = BEATS[beat]
  const last = beat === BEATS.length - 1

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-sm p-6" style={{ animation: 'rise-in 400ms cubic-bezier(0.22,1,0.36,1)' }}>
        <div className="display text-brass-400 text-center text-xl tracking-wide">
          {g.strings.gameTitle}
        </div>
        <div className="rule-brass my-4 h-px w-full opacity-60" />

        <div className="min-h-[170px]">
          <div className="display text-cream text-base leading-snug">{b.title}</div>
          <p className="text-cream-dim mt-3 text-sm leading-relaxed">{b.body}</p>
        </div>

        <div className="mt-5 flex justify-center gap-1.5">
          {BEATS.map((_, i) => (
            <span
              key={i}
              className="h-1 w-6 rounded-full transition-colors"
              style={{ background: i <= beat ? 'var(--color-brass-400)' : 'var(--color-ink-600)' }}
            />
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={finish}>
            {last ? '' : 'Skip'}
          </button>
          <button
            className="btn btn-brass flex-1"
            onClick={() => (last ? finish() : setBeat(beat + 1))}
          >
            {last ? 'Get to work' : 'Go on'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * One-time tips that fire when the thing they explain first happens.
 *
 * Contextual beats a manual: nobody reads about suspicion until it is
 * climbing in front of them.
 */
export function Hints() {
  const g = useGame()
  const [showing, setShowing] = useState<string | null>(null)

  const seen = (id: string) => g.hintsSeen.includes(id)
  const introDone = seen('intro')

  useEffect(() => {
    if (!introDone || showing) return

    const pick = (): string | null => {
      if (!seen('heat') && g.heat >= 28) return 'heat'
      if (!seen('crate') && (g.duffels.street + g.duffels.safe + g.duffels.armored) > 0) return 'crate'
      if (!seen('refused') && g.blocks.some((b) => b.unlocked && !b.accepting)) return 'refused'
      if (!seen('banked') && g.clean.gt(g.dirty)) return 'banked'
      return null
    }

    const next = pick()
    if (next) setShowing(next)
    // Re-checked on every publish; cheap, and the conditions are all reads.
  }, [g, introDone, showing])

  if (!showing) return null

  const tip = TIPS[showing]
  if (!tip) return null

  const dismiss = () => {
    engine.markHint(showing)
    setShowing(null)
  }

  return (
    <div className="fixed inset-x-3 bottom-[76px] z-[46] mx-auto max-w-lg">
      <div
        className="panel p-3"
        style={{ borderColor: 'var(--color-brass-600)', animation: 'rise-in 320ms cubic-bezier(0.22,1,0.36,1)' }}
      >
        <div className="text-brass-400 text-[10px] uppercase tracking-[0.16em]">{tip.title}</div>
        <p className="text-cream-dim mt-1.5 text-xs leading-relaxed">{tip.body}</p>
        <button className="btn btn-ghost mt-2.5 w-full py-1.5 text-[11px]" onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>
  )
}

const TIPS: Record<string, { title: string; body: string }> = {
  heat: {
    title: 'They have noticed',
    body: 'Suspicion climbs with every bottle that changes hands. The Law screen shows which line is doing it, and what you can do about it — a payoff, a front, or simply cutting less.',
  },
  crate: {
    title: 'A crate turned up',
    body: 'Open it on the Kit screen. What is inside stays with you through everything, including cashing out — it is the only thing that does.',
  },
  refused: {
    title: 'Somebody will not touch it',
    body: 'That district has a floor and you are under it. Raise the proof on that line, or accept you are only selling to the ones who do not care.',
  },
  banked: {
    title: 'Money that can be explained',
    body: 'Banked cash is what buys rooms, new lines and fronts. Fronts raise the share of your income that can be made legitimate — everything else waits on them.',
  },
}
