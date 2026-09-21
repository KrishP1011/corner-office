import { engine, useGame } from '../store/gameStore'
import { fmt, fmtMoney, fmtDuration } from '../engine/bignum'
import { BALANCE } from '../engine/balance'
import { Meter, SectionTitle } from './bits'

const BAND = {
  cold: {
    name: 'Quiet',
    tone: 'var(--color-ok)',
    meter: 'ok' as const,
    what: 'Nobody is looking your way. This is the time to push.',
  },
  warm: {
    name: 'Noticed',
    tone: 'var(--color-warn)',
    meter: 'warn' as const,
    what: 'Undercover buys are skimming a little off every sale. No raids yet.',
  },
  hot: {
    name: 'Watched',
    tone: 'var(--color-danger)',
    meter: 'danger' as const,
    what: 'They have your operation. Roughly a 1-in-20 chance of a raid every minute.',
  },
  burned: {
    name: 'Hunted',
    tone: 'var(--color-danger)',
    meter: 'danger' as const,
    what: 'A raid every few minutes, and rivals can smell it. This does not hold.',
  },
}

export function LawPanel() {
  const g = useGame()
  const band = BAND[g.band.band]
  const cooling = g.heatNetPerMin < 0

  // Rough time to the next band boundary at the current net rate.
  const nextEdge = g.heatNetPerMin > 0
    ? edgeAbove(g.heat)
    : edgeBelow(g.heat)
  const secondsToEdge = nextEdge !== null && Math.abs(g.heatNetPerMin) > 0.01
    ? (Math.abs(nextEdge - g.heat) / Math.abs(g.heatNetPerMin)) * 60
    : null

  return (
    <div className="space-y-3">
      <SectionTitle hint={`${g.strings.lawLabel}`}>{g.strings.heatLabel}</SectionTitle>

      {/* Where you stand -------------------------------------------------- */}
      <div className="panel p-4">
        <div className="flex items-baseline justify-between">
          <span className="display text-lg tracking-wide" style={{ color: band.tone }}>
            {band.name}
          </span>
          <span className="tnum text-cream text-2xl font-semibold">{g.heat.toFixed(0)}</span>
        </div>

        <div className="mt-3">
          <Meter pct={g.heat} tone={band.meter} />
        </div>

        <p className="text-cream-dim mt-3 text-xs leading-relaxed">{band.what}</p>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-ink-600)] pt-3">
          <div>
            <div className="text-cream-dim text-[10px] uppercase tracking-[0.14em]">Building</div>
            <div className="tnum text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>
              +{g.heatPerMin.toFixed(2)}/min
            </div>
          </div>
          <div className="text-right">
            <div className="text-cream-dim text-[10px] uppercase tracking-[0.14em]">Cooling</div>
            <div className="tnum text-sm font-semibold" style={{ color: 'var(--color-ok)' }}>
              -{g.heatDecayPerMin.toFixed(2)}/min
            </div>
          </div>
        </div>

        <div
          className="tnum mt-3 text-center text-[11px]"
          style={{ color: cooling ? 'var(--color-ok)' : 'var(--color-danger)' }}
        >
          {cooling ? 'Settling' : 'Climbing'} {Math.abs(g.heatNetPerMin).toFixed(2)}/min
          {secondsToEdge !== null && secondsToEdge < 60 * 60 && (
            <span className="text-cream-dim">
              {' '}· {cooling ? 'clear of' : 'into'} the next band in {fmtDuration(secondsToEdge)}
            </span>
          )}
        </div>

        {g.raidCooldown > 0 && (
          <div className="text-cream-dim mt-3 rounded border border-[var(--color-ink-500)] bg-[var(--color-ink-900)] p-2 text-center text-[11px]">
            They just turned the place over. No one is coming back for {fmtDuration(g.raidCooldown)}.
          </div>
        )}
      </div>

      {/* The payoff -------------------------------------------------------- */}
      <div className="panel p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="display text-cream text-sm tracking-wide">Pay off the sheriff</div>
            <p className="text-cream-dim mt-1 text-xs leading-relaxed">
              Takes {BALANCE.BRIBE_HEAT_RELIEF} off the top, out of loose cash.
              {g.bribesThisRun > 0 && (
                <> Word gets around — you have paid {g.bribesThisRun}{' '}
                {g.bribesThisRun === 1 ? 'time' : 'times'} this run, and the price knows it.</>
              )}
            </p>
          </div>
          <button
            className="btn btn-brass shrink-0"
            disabled={!g.canBribe}
            onClick={() => engine.bribe()}
          >
            {fmtMoney(g.bribeCost)}
          </button>
        </div>
        {!g.canBribe && g.heat > 0 && (
          <div className="text-cream-dim mt-2 text-[11px]">
            Not enough loose cash on hand.
          </div>
        )}
      </div>

      {/* What is generating it --------------------------------------------- */}
      <div className="panel p-4">
        <div className="text-cream-dim mb-3 text-[10px] uppercase tracking-[0.14em]">
          Where it is coming from
        </div>

        {g.heatSources.length === 0 ? (
          <p className="text-cream-dim text-xs">
            Nothing is moving, so nothing is drawing attention.
          </p>
        ) : (
          <div className="space-y-2.5">
            {g.heatSources.map((src) => (
              <div key={src.id}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-cream truncate">{src.name}</span>
                  <span className="tnum text-cream-dim shrink-0">
                    +{src.perMin.toFixed(2)}/min · {fmt(src.unitsPerMin)} units/min
                  </span>
                </div>
                <div className="mt-1">
                  <Meter pct={src.share * 100} tone={src.share > 0.5 ? 'danger' : 'warn'} />
                </div>
              </div>
            ))}
          </div>
        )}

        {g.overCap && (
          <div className="mt-3 rounded border border-[var(--color-danger)] bg-[rgba(209,72,60,0.08)] p-2.5">
            <div className="text-[11px] font-medium" style={{ color: 'var(--color-danger)' }}>
              The pile itself is the problem
            </div>
            <p className="text-cream-dim mt-1 text-[11px] leading-relaxed">
              You are holding {fmtMoney(g.dirty)} in loose cash against a ceiling of{' '}
              {fmtMoney(g.dirtyCap)}. Wash it or spend it — sitting on it draws its own attention.
            </p>
          </div>
        )}
      </div>

      {/* What has happened -------------------------------------------------- */}
      <div className="panel p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-cream-dim text-[10px] uppercase tracking-[0.14em]">
            Word on the street
          </span>
          {g.events.length > 0 && (
            <button className="text-cream-dim hover:text-cream text-[10px]" onClick={() => engine.clearEvents()}>
              clear
            </button>
          )}
        </div>

        {g.events.length === 0 ? (
          <p className="text-cream-dim text-xs">Nothing worth repeating yet.</p>
        ) : (
          <div className="space-y-2">
            {g.events.slice(0, 12).map((e) => (
              <div key={e.id} className="flex gap-2.5 text-[11px] leading-relaxed">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background: e.tone === 'bad' ? 'var(--color-danger)'
                      : e.tone === 'good' ? 'var(--color-ok)' : 'var(--color-brass-500)',
                  }}
                />
                <span className="text-cream-dim">{e.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function edgeAbove(heat: number): number | null {
  const b = BALANCE.HEAT_BANDS
  if (heat < b.warm) return b.warm
  if (heat < b.hot) return b.hot
  if (heat < b.burned) return b.burned
  return null
}

function edgeBelow(heat: number): number | null {
  const b = BALANCE.HEAT_BANDS
  if (heat >= b.burned) return b.burned
  if (heat >= b.hot) return b.hot
  if (heat >= b.warm) return b.warm
  return null
}
