import { useEffect, useState } from 'react'
import { engine, RARITY_COLOR, RARITY_LABEL, SLOT_LABEL, STAT_LABEL } from '../store/gameStore'
import { fmtPct } from '../engine/bignum'
import { BALANCE } from '../engine/balance'
import { itemStatAtLevel } from '../engine/economy'
import { sfx } from '../audio/sfx'
import { emitFloat } from './juice'
import type { DuffelTier, OpenResult, StatKey } from '../engine/types'

type Phase = 'ready' | 'straining' | 'burst' | 'reveal'

const RARITY_INDEX: Record<string, number> = {
  street: 0, solid: 1, connected: 2, made: 3, untouchable: 4,
}

const TIER_LOOK: Record<DuffelTier, { wood: string; band: string }> = {
  street:  { wood: '#4a3b28', band: '#6b5a42' },
  safe:    { wood: '#3a3f4a', band: '#8892a0' },
  armored: { wood: '#2e3440', band: '#c9a227' },
}

/**
 * The crate opening.
 *
 * DESIGN.md section 9 is blunt about this being the highest-return animation
 * in the project: it is what gets screenshotted and what sells the next one.
 * Three seconds minimum, slow build, rarity colour flash.
 *
 * Sound is a day-7 item -- there are no audio assets yet.
 */
export function CrateOpen({ tier, onClose }: { tier: DuffelTier; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('ready')
  const [result, setResult] = useState<OpenResult | null>(null)
  const [remaining, setRemaining] = useState(engine.state.meta.duffels[tier])

  const look = TIER_LOOK[tier]
  const rarityColor = result ? RARITY_COLOR[result.item.rarity] : 'var(--color-brass-400)'

  const open = () => {
    const r = engine.openDuffel(tier)
    if (!r) { onClose(); return }

    setResult(r)
    setRemaining(engine.state.meta.duffels[tier])
    setPhase('straining')
    sfx.play('strain')
  }

  // Each phase schedules only the next one.
  //
  // Scheduling both from the 'straining' branch does not work: the effect
  // depends on `phase`, so advancing to 'burst' re-runs it and the cleanup
  // cancels the still-pending reveal timer along with the fired one.
  useEffect(() => {
    if (phase === 'straining') {
      const t = window.setTimeout(() => setPhase('burst'), 1500)
      return () => window.clearTimeout(t)
    }
    if (phase === 'burst') {
      sfx.play('burst')
      const t = window.setTimeout(() => setPhase('reveal'), 470)
      return () => window.clearTimeout(t)
    }
    if (phase === 'reveal' && result) {
      // The sting is pitched to the rarity, so you hear what it is before
      // you have read the card.
      sfx.sting(RARITY_INDEX[result.item.rarity] ?? 0)
      if (result.isNew) emitFloat(`NEW · ${result.item.name}`, 'brass')
      else if (result.leveledUp) emitFloat(`${result.item.name} → Lv ${result.level}`, 'good')
    }
  }, [phase, result])

  const again = () => {
    setResult(null)
    setPhase('ready')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm">
        {phase !== 'reveal' && (
          <div className="flex flex-col items-center">
            <div className="display text-brass-400 mb-8 text-center text-sm uppercase tracking-[0.2em]">
              {engine.content.strings.chestTiers[
                tier === 'street' ? 0 : tier === 'safe' ? 1 : 2
              ]}
            </div>

            <div className="relative flex h-56 w-56 items-center justify-center">
              {/* Light bleeding out as it gives way */}
              {phase === 'straining' && (
                <div
                  className="absolute inset-0 rounded-full blur-2xl"
                  style={{
                    background: rarityColor,
                    opacity: 0.55,
                    animation: 'crate-strain 1.5s ease-in forwards',
                  }}
                />
              )}

              {phase === 'burst' && (
                <>
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `radial-gradient(circle, ${rarityColor} 0%, transparent 65%)`,
                      animation: 'burst-flash 620ms ease-out forwards',
                    }}
                  />
                  <div
                    className="absolute inset-[-30%]"
                    style={{
                      background: `conic-gradient(from 0deg, transparent 0deg, ${rarityColor}55 12deg, transparent 24deg, transparent 90deg, ${rarityColor}55 102deg, transparent 114deg, transparent 180deg, ${rarityColor}55 192deg, transparent 204deg, transparent 270deg, ${rarityColor}55 282deg, transparent 294deg)`,
                      animation: 'ray-spin 2.4s linear infinite, burst-flash 620ms ease-out forwards',
                    }}
                  />
                </>
              )}

              {/* The crate itself */}
              <div
                className="relative h-36 w-40 rounded"
                style={{
                  background: `linear-gradient(160deg, ${look.wood}, #1a1410)`,
                  border: `2px solid ${look.band}`,
                  boxShadow: `0 12px 30px -8px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.08)`,
                  animation: phase === 'straining'
                    ? 'crate-shake 380ms ease-in-out infinite'
                    : phase === 'burst'
                      ? 'crate-blow 500ms ease-out forwards'
                      : undefined,
                }}
              >
                {/* Metal banding */}
                <div className="absolute inset-y-0 left-6 w-2 opacity-70" style={{ background: look.band }} />
                <div className="absolute inset-y-0 right-6 w-2 opacity-70" style={{ background: look.band }} />

                {/* The seam, glowing as it loses */}
                <div
                  className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2"
                  style={{
                    background: rarityColor,
                    boxShadow: `0 0 18px 4px ${rarityColor}`,
                    opacity: phase === 'straining' ? 1 : 0.2,
                    animation: phase === 'straining'
                      ? 'seam-open 1.5s ease-in forwards'
                      : undefined,
                  }}
                />
              </div>
            </div>

            {phase === 'ready' ? (
              <>
                <button className="btn btn-brass mt-8 w-full py-3" onClick={open}>
                  Pry it open
                </button>
                <button className="btn btn-ghost mt-2 w-full" onClick={onClose}>
                  Leave it
                </button>
              </>
            ) : (
              <div className="text-cream-dim mt-8 h-12 text-xs uppercase tracking-[0.2em]">
                {phase === 'straining' ? 'the lid is giving' : ''}
              </div>
            )}
          </div>
        )}

        {phase === 'reveal' && result && (
          <RevealCard
            result={result}
            remaining={remaining}
            onAgain={again}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

function RevealCard({
  result, remaining, onAgain, onClose,
}: { result: OpenResult; remaining: number; onAgain: () => void; onClose: () => void }) {
  const { item } = result
  const color = RARITY_COLOR[item.rarity]
  const maxed = result.level >= BALANCE.MAX_ITEM_LEVEL

  return (
    <div style={{ animation: 'card-in 420ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
      <div
        className="panel relative overflow-hidden p-5"
        style={{ borderColor: color, boxShadow: `0 0 40px -6px ${color}66` }}
      >
        {/* Rarity wash behind the card */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-25"
          style={{ background: `radial-gradient(ellipse at 50% 0%, ${color}, transparent 70%)` }}
        />

        <div className="relative">
          <div className="flex items-center justify-between">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color }}
            >
              {RARITY_LABEL[item.rarity]}
            </span>
            <span className="text-cream-dim text-[10px] uppercase tracking-[0.16em]">
              {SLOT_LABEL[item.slot]}
            </span>
          </div>

          <div className="display text-cream mt-3 text-xl leading-tight tracking-wide">
            {item.name}
          </div>

          <div className="mt-2 flex items-center gap-2">
            {result.isNew ? (
              <span
                className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ background: color, color: 'var(--color-ink-950)' }}
              >
                New
              </span>
            ) : result.leveledUp ? (
              <span className="text-ok text-[11px] font-semibold uppercase tracking-[0.14em]">
                Level {result.level}
              </span>
            ) : (
              <span className="text-cream-dim text-[11px]">
                Another one — {maxed ? 'already at its best' : `${result.shards}/${result.shardsForNext} toward level ${result.level + 1}`}
              </span>
            )}
            {!result.isNew && result.level > 1 && (
              <span className="tnum text-cream-dim text-[11px]">Lv {result.level}</span>
            )}
          </div>

          <div className="rule-brass my-4 h-px w-full opacity-40" />

          <div className="space-y-1.5">
            {(Object.entries(item.stats) as [StatKey, number][]).map(([key, base]) => (
              <div key={key} className="flex items-baseline justify-between text-sm">
                <span className="text-cream-dim text-xs">{STAT_LABEL[key]}</span>
                <span className="tnum font-semibold" style={{ color }}>
                  {formatStat(key, itemStatAtLevel(base, result.level))}
                </span>
              </div>
            ))}
          </div>

          {item.unique && (
            <div
              className="mt-3 rounded border p-2.5"
              style={{ borderColor: `${color}55`, background: `${color}11` }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color }}>
                Untouchable
              </div>
              <p className="text-cream mt-1 text-[11px] leading-relaxed">
                {UNIQUE_TEXT[item.unique] ?? 'Something the others do not have.'}
              </p>
            </div>
          )}

          <p className="text-cream-dim mt-4 text-[11px] italic leading-relaxed">{item.flavor}</p>

          {result.autoEquipped && (
            <div className="text-ok mt-3 text-[11px]">Put on — that slot was empty.</div>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={onClose}>Done</button>
        {remaining > 0 && (
          <button className="btn btn-brass flex-1" onClick={onAgain}>
            Open another ({remaining})
          </button>
        )}
      </div>
    </div>
  )
}

/** Points for proof and hours, percentages for everything else. */
export function formatStat(key: StatKey, value: number): string {
  if (key === 'purityFloor' || key === 'defense') return `+${Math.round(value)}`
  if (key === 'offlineCap') return `+${value.toFixed(1)}h`
  return fmtPct(value)
}

export const UNIQUE_TEXT: Record<string, string> = {
  deadmans_watch: 'The first raid of a run finds nothing.',
  ghost_line: 'Suspicion cools twice as fast while you are away.',
  clean_hands: 'A tenth of the loose pile washes itself, with no ceiling.',
  long_chain: 'Prices climb the longer this identity has been running, up to +25%.',
  nothing_personal: 'Your best district never walks away.',
  company_car: 'Every district holds a quarter more buyers.',
  nobodys_jacket: 'Below 40 suspicion you generate none at all.',
  dead_stock: 'The crew works quietly — no suspicion while you are away.',
}
