import { useGame } from '../store/gameStore'
import { fmtMoney } from '../engine/bignum'
import { Meter } from './bits'

const BAND_TONE = {
  cold: 'ok', warm: 'warn', hot: 'danger', burned: 'danger',
} as const

const BAND_LABEL = {
  cold: 'Quiet', warm: 'Noticed', hot: 'Watched', burned: 'Hunted',
} as const

export function TopBar() {
  const g = useGame()
  const tone = BAND_TONE[g.band.band]

  return (
    <header className="panel sticky top-0 z-20 mx-3 mt-3 rounded-lg px-4 py-3">
      {/* Title and money are stacked rather than side by side: once the
          numbers reach eight figures they squeeze the title into a wrap. */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="display text-brass-400 whitespace-nowrap text-base leading-none tracking-wider">
          {g.strings.gameTitle}
        </span>
        <span className="text-cream-dim shrink-0 text-[10px] uppercase tracking-[0.2em]">
          {g.totalPrestiges > 0 ? `Identity ${g.totalPrestiges + 1}` : 'Season One'}
        </span>
      </div>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <div className="text-cream-dim text-[10px] uppercase tracking-[0.14em]">
              {g.strings.dirtyLabel}
            </div>
            <div
              className="tnum text-lg font-semibold leading-tight"
              style={{ color: g.overCap ? 'var(--color-danger)' : 'var(--color-money)' }}
            >
              {fmtMoney(g.dirty)}
            </div>
            <div className="tnum text-cream-dim text-[11px]">
              {fmtMoney(g.revenuePerSec)}/s
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 text-right">
          <div className="min-w-0">
            <div className="text-cream-dim text-[10px] uppercase tracking-[0.14em]">
              {g.strings.cleanLabel}
            </div>
            <div className="tnum text-cream text-lg font-semibold leading-tight">
              {fmtMoney(g.clean)}
            </div>
            <div className="tnum text-cream-dim text-[11px]">
              {fmtMoney(g.launderPerMin)}/min
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-cream-dim text-[10px] uppercase tracking-[0.14em]">
            {g.strings.heatLabel}
          </span>
          <span
            className={`tnum text-[11px] font-medium ${g.band.band === 'burned' ? 'pulse-warn' : ''}`}
            style={{ color: `var(--color-${tone === 'ok' ? 'ok' : tone})` }}
          >
            {BAND_LABEL[g.band.band]} · {g.heat.toFixed(0)}
          </span>
        </div>
        <Meter pct={g.heat} tone={tone} />
        {g.overCap && (
          <div className="mt-1.5 text-[11px] text-[var(--color-danger)]">
            Sitting on more cash than you can explain. Wash it or spend it.
          </div>
        )}
        {g.raidCooldown > 0 && (
          <div className="text-cream-dim mt-1.5 text-[11px]">
            They just turned the place over. Quiet for {Math.ceil(g.raidCooldown / 60)}m.
          </div>
        )}
      </div>
    </header>
  )
}
