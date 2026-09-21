import { engine, useGame } from '../store/gameStore'
import { fmtMoney } from '../engine/bignum'
import { SectionTitle } from './bits'

export function PlacesSection() {
  const g = useGame()

  return (
    <div className="space-y-3 pt-4">
      <div className="rule-brass h-px w-full opacity-40" />
      <SectionTitle hint={`${g.stationsUsed} / ${g.stationSlots} lines`}>Where you work</SectionTitle>

      {g.locations.map((l) => (
        <div
          key={l.def.id}
          className={`panel p-4 ${l.current ? 'ring-1 ring-[var(--color-brass-500)]' : ''}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="display text-cream text-sm tracking-wide">
                {l.def.name}
                {l.current && (
                  <span className="text-brass-400 ml-2 text-[10px] uppercase tracking-[0.14em]">
                    current
                  </span>
                )}
              </div>
              <p className="text-cream-dim mt-1 text-xs leading-relaxed">{l.def.tagline}</p>
              <div className="tnum text-cream-dim mt-2 text-[11px]">
                {l.def.stationSlots} lines ·{' '}
                <span style={{ color: l.def.heatMod > 0 ? 'var(--color-warn)' : 'var(--color-ok)' }}>
                  {l.def.heatMod >= 0 ? '+' : ''}{(l.def.heatMod * 100).toFixed(0)}% {g.strings.heatLabel.toLowerCase()}
                </span>
              </div>
            </div>

            {l.owned ? (
              <button
                className="btn shrink-0"
                disabled={l.current}
                onClick={() => engine.setLocation(l.def.id)}
              >
                {l.current ? 'Here' : 'Move in'}
              </button>
            ) : (
              <button
                className="btn btn-brass shrink-0"
                disabled={!l.canAfford}
                onClick={() => engine.buyLocation(l.def.id)}
              >
                {fmtMoney(l.cost)}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
