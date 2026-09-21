import { useState } from 'react'
import { engine } from '../../store/gameStore'
import { buffFromScore } from '../../engine/economy'
import { BALANCE } from '../../engine/balance'
import { fmtDuration } from '../../engine/bignum'
import { sfx } from '../../audio/sfx'
import { emitFloat } from '../juice'
import type { ProductDef, QualityBuff } from '../../engine/types'
import type { MinigameProps } from './shell'
import { BalanceGame } from './BalanceGame'
import { ContaminationGame } from './ContaminationGame'
import { TimingGame } from './TimingGame'
import { RouteGame } from './RouteGame'
import { StabilityGame } from './StabilityGame'

const GAMES: Record<string, { title: string; how: string; Game: (p: MinigameProps) => React.ReactElement }> = {
  balance:       { title: 'Mind the mash',  how: 'Hold all three settings in their windows at once. They drift.', Game: BalanceGame },
  contamination: { title: 'Wild yeast',     how: 'Clear every spore before it matures. A mature one seeds another.', Game: ContaminationGame },
  timing:        { title: 'Cut the heads',  how: 'Three passes. Tap when the marker is in the green.', Game: TimingGame },
  route:         { title: 'The run in',     how: 'Steer the channel. Every cutter you slip past is cargo that lands.', Game: RouteGame },
  stability:     { title: 'Hold the column', how: 'Keep the temperature in the band. It wanders on its own.', Game: StabilityGame },
}

/** Plain-language summary of what a buff actually does. */
export function describeBuff(buff: QualityBuff): string[] {
  const out: string[] = []
  if (buff.yieldMult > 1.001) out.push(`+${Math.round((buff.yieldMult - 1) * 100)}% output`)
  if (buff.purityBonus > 0) out.push(`+${buff.purityBonus} proof`)
  if (buff.heatMult < 0.999) out.push(`-${Math.round((1 - buff.heatMult) * 100)}% suspicion`)
  return out
}

type Phase = 'intro' | 'playing' | 'result'

export function MinigameModal({ def, onClose }: { def: ProductDef; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [earned, setEarned] = useState<QualityBuff | null>(null)

  const entry = GAMES[def.minigame]
  if (!entry) return null
  const { title, how, Game } = entry

  const handleDone = (score: number) => {
    engine.completeMinigame(def.id, score)
    const buff = buffFromScore(def, score)
    setEarned(buff)
    setPhase('result')

    sfx.play(score > 0.55 ? 'reveal' : score > 0.2 ? 'good' : 'deny')
    const lines = describeBuff(buff)
    if (lines.length > 0) emitFloat(lines.join(' · '), score > 0.2 ? 'good' : 'brass')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-sm p-5">
        <div className="display text-brass-400 text-center text-base tracking-wide">{title}</div>
        <div className="text-cream-dim mt-1 text-center text-[11px] uppercase tracking-[0.16em]">
          {def.name}
        </div>
        <div className="rule-brass my-4 h-px w-full opacity-60" />

        {phase === 'intro' && (
          <>
            <p className="text-cream-dim text-center text-sm leading-relaxed">{how}</p>
            <p className="text-cream-dim mt-4 text-center text-[11px] leading-relaxed">
              A bonus lasts {fmtDuration(BALANCE.BUFF_DURATION_SECONDS)}.
              A poor run still leaves something — trying is never worse than skipping it.
            </p>
            <div className="mt-6 flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={onClose}>Not now</button>
              <button className="btn btn-brass flex-1" onClick={() => setPhase('playing')}>Begin</button>
            </div>
          </>
        )}

        {phase === 'playing' && <Game onDone={handleDone} />}

        {phase === 'result' && earned && (
          <>
            <div className="py-2 text-center">
              <div className="display text-cream text-lg">
                {earned.yieldMult > 1.3 || earned.purityBonus > 11 || earned.heatMult < 0.75
                  ? 'Clean work'
                  : earned.yieldMult > 1.15 || earned.purityBonus > 6 || earned.heatMult < 0.88
                    ? 'Good enough'
                    : 'Rough batch'}
              </div>
              <div className="mt-4 space-y-1.5">
                {describeBuff(earned).map((line) => (
                  <div key={line} className="tnum text-brass-400 text-sm font-semibold">{line}</div>
                ))}
              </div>
              <div className="text-cream-dim mt-3 text-[11px]">
                for the next {fmtDuration(earned.remaining)}
              </div>
            </div>
            <button className="btn btn-brass mt-5 w-full" onClick={onClose}>Back to it</button>
          </>
        )}
      </div>
    </div>
  )
}
