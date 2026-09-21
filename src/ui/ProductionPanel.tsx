import { useState } from 'react'
import { engine, useGame, useUi, type ProductView, type BuyAmount } from '../store/gameStore'
import { fmt, fmtMoney, fmtInt, fmtDuration, fmtMult } from '../engine/bignum'
import { cutMultiplier, priceMultiplier } from '../engine/economy'
import { BALANCE, nextMilestone } from '../engine/balance'
import { Meter } from './bits'
import { MinigameModal, describeBuff } from './minigames'
import { Still } from './art/Still'
import { BatchPop } from './art/BatchPop'
import { ProductIcon } from './art/ProductIcon'
import { sfx } from '../audio/sfx'
import { emitFloat } from './juice'
import type { ProductDef } from '../engine/types'

const AMOUNTS: { label: string; value: BuyAmount }[] = [
  { label: '1', value: 1 },
  { label: '10', value: 10 },
  { label: '100', value: 100 },
  { label: 'MAX', value: -1 },
]

export function ProductionPanel() {
  const g = useGame()
  const { buyAmount, setBuyAmount, selected, select } = useUi()
  const [openGame, setOpenGame] = useState<ProductDef | null>(null)

  const running = g.products.filter((p) => p.unlocked && p.level > 0)
  const openable = g.products.filter((p) => !p.unlocked && p.locationOwned)
  const locked = g.products.filter((p) => !p.unlocked && !p.locationOwned)

  // Default to the best line you have, not the first.
  const current =
    running.find((p) => p.def.id === selected) ?? running[running.length - 1] ?? running[0]

  if (!current) {
    return (
      <div className="panel text-cream-dim p-8 text-center text-sm">
        Nothing running. Open a line to get started.
      </div>
    )
  }

  const market = marketFor(g, current)

  return (
    <div className="space-y-3">
      {/* Which line you are looking at -------------------------------- */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {running.map((p) => (
          <button
            key={p.def.id}
            onClick={() => { select(p.def.id); sfx.play('click') }}
            className="panel-raised flex shrink-0 flex-col items-center gap-1 px-3 py-2 transition-all"
            style={p.def.id === current.def.id
              ? { borderColor: 'var(--color-brass-500)', background: 'rgba(224,185,74,0.08)' }
              : undefined}
          >
            <ProductIcon id={p.def.id} size={30} active={p.def.id === current.def.id} />
            <span
              className="tnum text-[9px]"
              style={{ color: p.def.id === current.def.id ? 'var(--color-brass-400)' : 'var(--color-cream-dim)' }}
            >
              {fmt(p.unitsPerSecond)}/s
            </span>
            {p.buff && (
              <span className="h-1 w-1 rounded-full" style={{ background: 'var(--color-ok)' }} />
            )}
          </button>
        ))}

        {openable.map((p) => (
          <button
            key={p.def.id}
            onClick={() => {
              if (!engine.unlockProduct(p.def.id)) { sfx.play('deny'); return }
              select(p.def.id)
              sfx.play('good')
              emitFloat(`${p.def.name} is running`, 'good')
            }}
            disabled={!p.canUnlock}
            className="panel-raised flex shrink-0 flex-col items-center gap-1 px-3 py-2 disabled:opacity-40"
            style={p.canUnlock ? { borderColor: 'var(--color-brass-600)' } : undefined}
          >
            <ProductIcon id={p.def.id} size={30} />
            <span className="tnum text-cream-dim text-[9px]">{fmtMoney(p.unlockCost)}</span>
          </button>
        ))}
      </div>

      {/* The still ----------------------------------------------------- */}
      <div className="panel relative overflow-hidden p-4">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(224,185,74,0.08), transparent 70%)' }}
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="display text-cream text-base leading-tight">{current.def.name}</div>
            <div className="tnum text-brass-400 text-[11px]">
              Level {current.level}
              {nextMilestone(current.level) && (
                <span className="text-cream-dim"> · x2 at {nextMilestone(current.level)}</span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="tnum text-cream text-lg font-semibold leading-none">
              {fmt(current.unitsPerSecond)}<span className="text-cream-dim text-[11px]">/s</span>
            </div>
            <div className="tnum text-cream-dim text-[11px]">{fmtInt(current.inventory)} on hand</div>
          </div>
        </div>

        <div className="relative mt-2">
          <Still p={current} running={current.level > 0} />
          <BatchPop
            productId={current.def.id}
            cyclePct={current.cyclePct}
            rate={current.unitsPerSecond.toNumber()}
          />
        </div>

        <Meter pct={current.cyclePct} />

        {current.buff && (
          <div className="mt-2 flex items-baseline justify-between text-[11px]">
            <span className="tnum text-ok">{describeBuff(current.buff).join(' · ')}</span>
            <span className="tnum text-cream-dim">{fmtDuration(current.buff.remaining)} left</span>
          </div>
        )}
      </div>

      {/* The cut -------------------------------------------------------- */}
      <div className="panel p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-cream-dim text-[10px] uppercase tracking-[0.14em]">
            {g.strings.purityLabel}
          </span>
          <span className="tnum text-brass-400 text-lg font-semibold">
            {current.purity}
            {current.effPurity !== current.purity && (
              <span className="text-ok text-sm"> → {current.effPurity}</span>
            )}
          </span>
        </div>

        <input
          type="range"
          className="cut-slider"
          min={BALANCE.PURITY_MIN}
          max={BALANCE.PURITY_MAX}
          value={current.purity}
          onChange={(e) => engine.setPurity(current.def.id, Number(e.target.value))}
        />

        <div className="text-cream-dim mt-1 flex justify-between text-[10px]">
          <span>watered down</span>
          <span>full strength</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="panel-raised px-2.5 py-2">
            <div className="text-cream-dim text-[9px] uppercase tracking-[0.12em]">Bottles</div>
            <div className="tnum text-cream text-sm font-semibold">{fmtMult(cutMultiplier(current.purity))}</div>
          </div>
          <div className="panel-raised px-2.5 py-2">
            <div className="text-cream-dim text-[9px] uppercase tracking-[0.12em]">Price each</div>
            <div className="tnum text-cream text-sm font-semibold">{fmtMult(priceMultiplier(current.effPurity))}</div>
          </div>
        </div>

        <div
          className="mt-2 text-center text-[11px]"
          style={{
            color: market.accepting === 0 ? 'var(--color-danger)'
              : market.accepting < market.interested ? 'var(--color-warn)' : 'var(--color-ok)',
          }}
        >
          {market.interested === 0
            ? 'No routes for it yet'
            : market.accepting === 0
              ? `Nobody will touch it — needs ${market.nextThreshold}`
              : market.nextThreshold !== null
                ? `${market.accepting} of ${market.interested} districts buying · ${market.nextThreshold} opens another`
                : `All ${market.interested} districts buying`}
        </div>
      </div>

      {/* Spend ---------------------------------------------------------- */}
      <div className="panel p-4">
        <div className="mb-2 flex gap-1">
          {AMOUNTS.map((a) => (
            <button
              key={a.label}
              onClick={() => setBuyAmount(a.value)}
              className={`btn flex-1 py-1 text-[10px] ${buyAmount === a.value ? 'btn-brass' : 'btn-ghost'}`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <button
          className="btn btn-brass w-full py-3"
          disabled={buyAmount === -1 ? current.maxAffordable <= 0 : !current.canAfford}
          onClick={() => {
            const before = current.level
            if (!engine.upgradeStation(current.def.id, buyAmount)) return
            const gained = engine.state.run.products[current.def.id].level - before
            sfx.play('buy')
            emitFloat(`${current.def.name} +${gained}`, 'brass')
          }}
        >
          Build up · {fmtMoney(engine.bulkCost(current.def.id, buyAmount))}
        </button>

        {current.def.minigame !== 'none' && (
          <div className="mt-2 flex items-center gap-2">
            <button className="btn flex-1" onClick={() => setOpenGame(current.def)}>
              {current.buff ? 'Work it again' : 'Work the batch'}
            </button>
            {current.autoUnlocked ? (
              <button
                className={`btn px-3 ${current.autoOn ? 'btn-brass' : 'btn-ghost'}`}
                onClick={() => engine.toggleAutoRun(current.def.id)}
              >
                AUTO
              </button>
            ) : (
              <span className="text-cream-dim tnum shrink-0 text-[10px]">
                {current.plays}/{BALANCE.AUTO_UNLOCK_PLAYS}
              </span>
            )}
          </div>
        )}
      </div>

      {locked.length > 0 && (
        <div className="panel p-3">
          <div className="text-cream-dim mb-2 text-[10px] uppercase tracking-[0.14em]">Out of reach</div>
          <div className="space-y-1">
            {locked.map((p) => (
              <div key={p.def.id} className="flex items-center gap-2 text-[11px]">
                <ProductIcon id={p.def.id} size={18} />
                <span className="text-cream-dim flex-1">{p.def.name}</span>
                <span className="text-cream-dim">
                  needs {engine.content.locations.find((l) => l.id === p.def.requiresLocation)?.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {openGame && <MinigameModal def={openGame} onClose={() => setOpenGame(null)} />}
    </div>
  )
}

interface Market {
  accepting: number
  interested: number
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
