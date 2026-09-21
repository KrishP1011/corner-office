import { engine, useGame, useUi, type ProductView, type BuyAmount } from '../store/gameStore'
import { fmt, fmtMoney, fmtInt } from '../engine/bignum'
import { cutMultiplier, priceMultiplier } from '../engine/economy'
import { BALANCE, nextMilestone } from '../engine/balance'
import { Meter, SectionTitle, Empty } from './bits'

const AMOUNTS: { label: string; value: BuyAmount }[] = [
  { label: '1', value: 1 },
  { label: '10', value: 10 },
  { label: '100', value: 100 },
  { label: 'MAX', value: -1 },
]

export function ProductionPanel() {
  const g = useGame()
  const { buyAmount, setBuyAmount } = useUi()

  const visible = g.products.filter((p) => p.unlocked || p.locationOwned)
  const locked = g.products.filter((p) => !p.unlocked && !p.locationOwned)

  return (
    <div className="space-y-3">
      <SectionTitle hint={`${g.stationsUsed}/${g.stationSlots} lines`}>Production</SectionTitle>

      <div className="flex gap-1">
        {AMOUNTS.map((a) => (
          <button
            key={a.label}
            onClick={() => setBuyAmount(a.value)}
            className={`btn flex-1 py-1.5 text-[11px] ${buyAmount === a.value ? 'btn-brass' : 'btn-ghost'}`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {visible.map((p) => (
        <ProductCard key={p.def.id} p={p} buyAmount={buyAmount} market={marketFor(g, p)} />
      ))}

      {locked.length > 0 && (
        <div className="panel p-4">
          <div className="text-cream-dim mb-2 text-[10px] uppercase tracking-[0.14em]">
            Out of reach
          </div>
          <div className="space-y-1.5">
            {locked.map((p) => (
              <div key={p.def.id} className="flex items-baseline justify-between text-sm">
                <span className="text-cream-dim">{p.def.name}</span>
                <span className="text-cream-dim text-[11px]">
                  needs {engine.content.locations.find((l) => l.id === p.def.requiresLocation)?.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {visible.length === 0 && <Empty>Nothing to run here yet.</Empty>}
    </div>
  )
}

interface Market {
  /** Open districts that will take this product at its current cut. */
  accepting: number
  /** Open districts that want it at all -- the real ceiling. */
  interested: number
  /** Lowest tolerance among the interested districts not currently served. */
  nextThreshold: number | null
}

function marketFor(g: ReturnType<typeof useGame>, p: ProductView): Market {
  const interested = g.blocks.filter((b) => b.unlocked && b.def.wants.includes(p.def.id))
  const accepting = interested.filter((b) => p.effPurity >= b.def.minPurity)
  const unmet = interested
    .filter((b) => p.effPurity < b.def.minPurity)
    .map((b) => b.def.minPurity)
    .sort((a, b) => a - b)

  return {
    accepting: accepting.length,
    interested: interested.length,
    nextThreshold: unmet.length > 0 ? unmet[0] : null,
  }
}

function ProductCard({
  p, buyAmount, market,
}: { p: ProductView; buyAmount: BuyAmount; market: Market }) {
  const g = useGame()

  if (!p.unlocked) {
    return (
      <div className="panel p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="display text-cream text-sm tracking-wide">{p.def.name}</div>
            <p className="text-cream-dim mt-1 text-xs leading-relaxed">{p.def.tagline}</p>
          </div>
          <button
            className="btn btn-brass shrink-0"
            disabled={!p.canUnlock}
            onClick={() => engine.unlockProduct(p.def.id)}
          >
            Open line · {fmtMoney(p.unlockCost)}
          </button>
        </div>
        {!p.canUnlock && (
          <div className="text-cream-dim mt-2 text-[11px]">
            Paid from {g.strings.cleanLabel.toLowerCase()}, not loose cash.
          </div>
        )}
      </div>
    )
  }

  const buyLabel = buyAmount === -1 ? `MAX (+${p.maxAffordable})` : `+${buyAmount}`
  const canBuy = buyAmount === -1 ? p.maxAffordable > 0 : p.canAfford
  const buyCost = engine.bulkCost(p.def.id, buyAmount)
  const milestone = nextMilestone(p.level)
  const units = cutMultiplier(p.purity)
  const price = priceMultiplier(p.effPurity)

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="display text-cream text-sm tracking-wide">{p.def.name}</div>
          <div className="tnum text-brass-400 text-[11px]">
            Level {p.level}
            {milestone && (
              <span className="text-cream-dim"> · x2 at {milestone}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="tnum text-cream text-sm font-semibold">
            {fmt(p.unitsPerSecond)}<span className="text-cream-dim text-[11px]">/s</span>
          </div>
          <div className="tnum text-cream-dim text-[11px]">
            {fmtInt(p.inventory)} on hand
          </div>
        </div>
      </div>

      <div className="mt-3">
        <Meter pct={p.cyclePct} />
      </div>

      {/* The cut. The one decision the whole game is built around. */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-cream-dim text-[10px] uppercase tracking-[0.14em]">
            {g.strings.purityLabel}
          </span>
          <span className="tnum text-brass-400 text-sm font-semibold">
            {p.purity}
            {p.effPurity !== p.purity && (
              <span className="text-ok"> → {p.effPurity}</span>
            )}
          </span>
        </div>

        <input
          type="range"
          className="cut-slider"
          min={BALANCE.PURITY_MIN}
          max={BALANCE.PURITY_MAX}
          value={p.purity}
          onChange={(e) => engine.setPurity(p.def.id, Number(e.target.value))}
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px]">
          <span className="tnum text-cream-dim">
            <span className="text-cream">{units.toFixed(2)}x</span> units ·{' '}
            <span className="text-cream">{price.toFixed(2)}x</span> price
          </span>
          <span
            className="tnum"
            style={{
              color: market.accepting === 0
                ? 'var(--color-danger)'
                : market.accepting < market.interested
                  ? 'var(--color-warn)'
                  : 'var(--color-ok)',
            }}
          >
            {market.interested === 0
              ? 'No routes for it yet'
              : market.accepting === 0
                ? `Nobody will touch it · needs ${market.nextThreshold}`
                : market.nextThreshold !== null
                  ? `${market.accepting}/${market.interested} districts · ${market.nextThreshold} opens another`
                  : `All ${market.interested} districts buying`}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          className="btn btn-brass flex-1"
          disabled={!canBuy}
          onClick={() => engine.upgradeStation(p.def.id, buyAmount)}
        >
          {buyLabel} · {fmtMoney(buyCost)}
        </button>
      </div>
    </div>
  )
}
