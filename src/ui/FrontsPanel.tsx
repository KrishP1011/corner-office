import { engine, useGame } from '../store/gameStore'
import { big, fmtMoney } from '../engine/bignum'
import { SectionTitle } from './bits'

export function FrontsPanel() {
  const g = useGame()

  return (
    <div className="space-y-3">
      <SectionTitle hint={`washing ${fmtMoney(g.launderPerMin)}/min`}>Fronts</SectionTitle>

      <div className="panel text-cream-dim p-4 text-xs leading-relaxed">
        Loose cash buys stills and barrels. Everything else — better rooms,
        new lines, a bigger operation — comes out of {g.strings.cleanLabel.toLowerCase()},
        and the only way cash gets there is through a business that can explain it.
      </div>

      {g.fronts.map((f) => (
        <div key={f.def.id} className="panel p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="display text-cream text-sm tracking-wide">{f.def.name}</div>
              <p className="text-cream-dim mt-1 text-xs leading-relaxed">{f.def.tagline}</p>
              <div className="tnum text-cream-dim mt-2 text-[11px]">
                {(f.def.ratePerMin * 100).toFixed(0)}% of the pile per minute ·
                up to {fmtMoney(big(f.def.capacity))}/min
              </div>
            </div>
            {f.owned ? (
              <span className="text-ok shrink-0 text-xs uppercase tracking-[0.14em]">Open</span>
            ) : (
              <button
                className="btn btn-brass shrink-0"
                disabled={!f.canAfford}
                onClick={() => engine.buyFront(f.def.id)}
              >
                {fmtMoney(f.cost)}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
