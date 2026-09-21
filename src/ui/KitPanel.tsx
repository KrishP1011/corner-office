import { useState } from 'react'
import {
  engine, useGame, RARITY_COLOR, RARITY_LABEL, STAT_LABEL,
  type ItemView, type SlotView,
} from '../store/gameStore'
import { BALANCE } from '../engine/balance'
import { fmtPct } from '../engine/bignum'
import { CrateOpen, UNIQUE_TEXT, formatStat } from './CrateOpen'
import { Meter, SectionTitle } from './bits'
import type { DuffelTier } from '../engine/types'

const TIERS: { tier: DuffelTier; index: number }[] = [
  { tier: 'street', index: 0 },
  { tier: 'safe', index: 1 },
  { tier: 'armored', index: 2 },
]

export function KitPanel() {
  const g = useGame()
  const [opening, setOpening] = useState<DuffelTier | null>(null)
  const [picking, setPicking] = useState<SlotView | null>(null)

  const totalCrates = g.duffels.street + g.duffels.safe + g.duffels.armored

  return (
    <div className="space-y-3">
      <SectionTitle hint={`${g.ownedItems} of ${g.totalItems} found`}>The kit</SectionTitle>

      {/* Crates ------------------------------------------------------------ */}
      <div className="panel p-4">
        <div className="text-cream-dim mb-3 text-[10px] uppercase tracking-[0.14em]">
          {totalCrates > 0 ? 'Unopened' : 'Nothing to open'}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {TIERS.map(({ tier, index }) => {
            const count = g.duffels[tier]
            return (
              <button
                key={tier}
                disabled={count === 0}
                onClick={() => setOpening(tier)}
                className="panel-raised flex flex-col items-center gap-1 p-3 transition-all disabled:opacity-35"
                style={count > 0 ? { borderColor: 'var(--color-brass-600)' } : undefined}
              >
                <span className="tnum text-cream text-lg font-semibold leading-none">{count}</span>
                <span className="text-cream-dim text-center text-[9px] uppercase leading-tight tracking-[0.1em]">
                  {g.strings.chestTiers[index]}
                </span>
              </button>
            )
          })}
        </div>

        {totalCrates === 0 && (
          <p className="text-cream-dim mt-3 text-[11px] leading-relaxed">
            Crates turn up in the stock as you work, and surviving a raid
            always turns one up.
          </p>
        )}
      </div>

      {/* Slots -------------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-2">
        {g.loadout.map((slot) => (
          <SlotCard key={slot.slot} slot={slot} onPick={() => setPicking(slot)} />
        ))}
      </div>

      {/* What it all adds up to --------------------------------------------- */}
      <div className="panel p-4">
        <div className="text-cream-dim mb-3 text-[10px] uppercase tracking-[0.14em]">
          What you are carrying
        </div>
        <TotalsList />
      </div>

      {opening && <CrateOpen tier={opening} onClose={() => setOpening(null)} />}
      {picking && (
        <SlotPicker
          slot={g.loadout.find((s) => s.slot === picking.slot)!}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  )
}

function SlotCard({ slot, onPick }: { slot: SlotView; onPick: () => void }) {
  const eq = slot.equipped
  const color = eq ? RARITY_COLOR[eq.def.rarity] : 'var(--color-ink-500)'

  return (
    <button
      onClick={onPick}
      className="panel-raised flex min-h-[88px] flex-col p-3 text-left transition-all"
      style={eq ? { borderColor: `${color}88` } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-cream-dim text-[9px] uppercase tracking-[0.16em]">{slot.label}</span>
        {eq && eq.level > 1 && (
          <span className="tnum text-[9px]" style={{ color }}>Lv{eq.level}</span>
        )}
      </div>

      {eq ? (
        <>
          <div className="text-cream mt-1.5 text-xs leading-tight">{eq.def.name}</div>
          <div className="mt-auto pt-1.5">
            {eq.stats.slice(0, 2).map((s) => (
              <div key={s.key} className="tnum text-[10px]" style={{ color }}>
                {formatStat(s.key, s.value)} {STAT_LABEL[s.key]}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-cream-dim mt-auto text-[11px]">
          {slot.options.length > 0 ? `${slot.options.length} available` : 'empty'}
        </div>
      )}
    </button>
  )
}

function SlotPicker({ slot, onClose }: { slot: SlotView; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center">
      <div className="panel max-h-[80vh] w-full max-w-sm overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="display text-brass-400 text-sm uppercase tracking-[0.16em]">
            {slot.label}
          </span>
          <button onClick={onClose} className="text-cream-dim hover:text-cream px-1">✕</button>
        </div>

        {slot.options.length === 0 ? (
          <p className="text-cream-dim py-6 text-center text-xs">
            Nothing for this slot yet. Open some crates.
          </p>
        ) : (
          <div className="space-y-2">
            {slot.equipped && (
              <button
                className="btn btn-ghost w-full text-[11px]"
                onClick={() => { engine.equip(slot.slot, null); onClose() }}
              >
                Take it off
              </button>
            )}
            {slot.options.map((item) => (
              <ItemRow
                key={item.def.id}
                item={item}
                onEquip={() => { engine.equip(slot.slot, item.def.id); onClose() }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ItemRow({ item, onEquip }: { item: ItemView; onEquip: () => void }) {
  const color = RARITY_COLOR[item.def.rarity]
  const maxed = item.level >= BALANCE.MAX_ITEM_LEVEL

  return (
    <button
      onClick={onEquip}
      disabled={item.equipped}
      className="panel-raised w-full p-3 text-left disabled:opacity-60"
      style={{ borderColor: item.equipped ? color : undefined }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-cream truncate text-xs">{item.def.name}</span>
        <span className="shrink-0 text-[9px] uppercase tracking-[0.14em]" style={{ color }}>
          {item.equipped ? 'on' : RARITY_LABEL[item.def.rarity]}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-3">
        {item.stats.map((s) => (
          <span key={s.key} className="tnum text-[10px]" style={{ color }}>
            {formatStat(s.key, s.value)} {STAT_LABEL[s.key]}
          </span>
        ))}
      </div>

      {item.def.unique && (
        <div className="text-cream-dim mt-1.5 text-[10px] leading-relaxed">
          {UNIQUE_TEXT[item.def.unique]}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <span className="tnum text-cream-dim shrink-0 text-[10px]">
          {maxed ? 'Lv 10 · best' : `Lv ${item.level}`}
        </span>
        {!maxed && (
          <div className="flex-1">
            <Meter pct={(item.shards / Math.max(1, item.shardsForNext)) * 100} />
          </div>
        )}
        {!maxed && (
          <span className="tnum text-cream-dim shrink-0 text-[10px]">
            {item.shards}/{item.shardsForNext}
          </span>
        )}
      </div>
    </button>
  )
}

/**
 * What the kit is actually worth.
 *
 * Reads the engine's computed modifiers rather than re-adding the equipped
 * items, because the two are not the same: suspicion resistance is clamped
 * at 90% so the pressure system can never be switched off. A totals panel
 * that promises 99% and delivers 90% is worse than none.
 */
function TotalsList() {
  const g = useGame()

  if (g.modTotals.length === 0) {
    return <p className="text-cream-dim text-xs">Nothing on yet.</p>
  }

  return (
    <>
      <div className="space-y-1.5">
        {g.modTotals.map(({ key, value }) => (
          <div key={key} className="flex items-baseline justify-between text-sm">
            <span className="text-cream-dim text-xs">{STAT_LABEL[key]}</span>
            <span className="tnum text-brass-400 font-semibold">
              {key === 'purityFloor' ? `+${Math.round(value)}`
                : key === 'offlineCap' ? `+${value.toFixed(1)}h`
                : fmtPct(value)}
              {key === 'heatResist' && value >= 0.9 && (
                <span className="text-cream-dim text-[10px]"> (capped)</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {g.uniquesActive.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-[var(--color-ink-600)] pt-3">
          {g.uniquesActive.map((u) => (
            <div key={u} className="text-[11px] leading-relaxed" style={{ color: 'var(--color-brass-400)' }}>
              {UNIQUE_TEXT[u]}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
