import { engine, useGame } from '../store/gameStore'
import { big, fmtMoney, fmtDuration } from '../engine/bignum'
import { Meter, SectionTitle } from './bits'
import { PlacesSection } from './PlacesPanel'
import { BALANCE } from '../engine/balance'

export function FrontsPanel() {
  const g = useGame()

  // How long the current pile takes to come out clean at today's rate.
  const perMin = g.launderPerMin.toNumber()
  const drainSeconds = perMin > 0 ? (g.dirty.toNumber() / perMin) * 60 : null
  const capPct = g.dirtyCap.gt(big(0))
    ? Math.min(100, g.dirty.div(g.dirtyCap).toNumber() * 100)
    : 0

  const owned = g.fronts.filter((f) => f.owned)

  return (
    <div className="space-y-3">
      <SectionTitle hint={`${owned.length} of ${g.fronts.length} open`}>The wash</SectionTitle>

      {/* The pipeline ------------------------------------------------------ */}
      <div className="panel p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-cream-dim text-[10px] uppercase tracking-[0.14em]">
              {g.strings.dirtyLabel}
            </div>
            <div
              className="tnum text-xl font-semibold leading-tight"
              style={{ color: g.overCap ? 'var(--color-danger)' : 'var(--color-money)' }}
            >
              {fmtMoney(g.dirty)}
            </div>
          </div>

          <div className="pb-1 text-center">
            <div className="tnum text-brass-400 text-[11px]">
              {fmtMoney(g.launderPerMin)}/min
            </div>
            <div className="text-cream-dim text-[16px] leading-none">→</div>
          </div>

          <div className="min-w-0 text-right">
            <div className="text-cream-dim text-[10px] uppercase tracking-[0.14em]">
              {g.strings.cleanLabel}
            </div>
            <div className="tnum text-cream text-xl font-semibold leading-tight">
              {fmtMoney(g.clean)}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[10px]">
            <span className="text-cream-dim uppercase tracking-[0.14em]">
              What you can sit on
            </span>
            <span className="tnum" style={{ color: g.overCap ? 'var(--color-danger)' : 'var(--color-cream-dim)' }}>
              {fmtMoney(g.dirty)} / {fmtMoney(g.dirtyCap)}
            </span>
          </div>
          <Meter pct={capPct} tone={g.overCap ? 'danger' : capPct > 70 ? 'warn' : 'ok'} />
        </div>

        {g.overCap ? (
          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--color-danger)' }}>
            Over the line. The pile is generating {g.strings.heatLabel.toLowerCase()} on its own.
          </p>
        ) : drainSeconds !== null && g.dirty.gt(big(0)) ? (
          <p className="text-cream-dim mt-3 text-[11px] leading-relaxed">
            At this rate the pile comes out clean in {fmtDuration(drainSeconds)}.
          </p>
        ) : null}
      </div>

      <div className="panel text-cream-dim p-4 text-xs leading-relaxed">
        Loose cash buys stills and barrels and pays the sheriff. Everything
        else — better rooms, new lines, a bigger operation — comes out of{' '}
        {g.strings.cleanLabel.toLowerCase()}, and the only way cash gets there
        is through a business that can explain it.
      </div>

      {g.fronts.map((f) => {
        // A share of what you EARN, which is what launderPerMinute actually
        // computes. This panel used to describe a share of the standing pile
        // and multiply by it -- a formula the engine has not used since the
        // share model replaced it, so every number here was fiction.
        const contributing = g.revenuePerSec.mul(big(60 * f.def.ratePerMin))

        return (
          <div key={f.def.id} className="panel p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="display text-cream text-sm tracking-wide">{f.def.name}</div>
                <p className="text-cream-dim mt-1 text-xs leading-relaxed">{f.def.tagline}</p>
                <div className="tnum text-cream-dim mt-2 text-[11px]">
                  washes a further {(f.def.ratePerMin * 100).toFixed(0)}% of what you earn
                </div>
                <div className="tnum text-cream-dim mt-0.5 text-[11px]">
                  and explains {fmtMoney(big(f.def.capacity).mul(big(BALANCE.DIRTY_CAP_PER_FRONT)))} more
                  sitting in the house
                </div>
                {f.owned && (
                  <div className="tnum text-ok mt-1 text-[11px]">
                    washing {fmtMoney(contributing)}/min at your income
                  </div>
                )}
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
        )
      })}

      <PlacesSection />
    </div>
  )
}
