import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { Engine } from '../engine/engine'
import { big, ZERO, type Big } from '../engine/bignum'
import {
  heatBand, dirtyCap, launderPerMinute, yieldPerCycle,
  customerCeiling, effectivePurity, blockAccepts, autoRunUnlocked,
  itemStatAtLevel,
} from '../engine/economy'
import type {
  GameEvent, ItemDef, ItemSlot, StatKey, Rarity,
} from '../engine/types'

export const SLOT_ORDER: ItemSlot[] = [
  'watch', 'chain', 'burner', 'piece', 'ride', 'briefcase', 'jacket', 'kicks',
]

export const SLOT_LABEL: Record<ItemSlot, string> = {
  watch: 'Watch', chain: 'Chain', burner: 'Line', piece: 'Piece',
  ride: 'Ride', briefcase: 'Case', jacket: 'Coat', kicks: 'Shoes',
}

export const RARITY_LABEL: Record<Rarity, string> = {
  street: 'Street', solid: 'Solid', connected: 'Connected',
  made: 'Made', untouchable: 'Untouchable',
}

/** One ramp, used by every rarity frame, glow and label in the game. */
export const RARITY_COLOR: Record<Rarity, string> = {
  street: '#7d8794',
  solid: '#6f9f7a',
  connected: '#5b8fc9',
  made: '#b06fd0',
  untouchable: '#e0b94a',
}

export const STAT_LABEL: Record<StatKey, string> = {
  yield: 'output',
  purityFloor: 'proof floor',
  price: 'price',
  heatResist: 'suspicion resist',
  launderRate: 'wash rate',
  offlineCap: 'hours away',
}
import { BALANCE, shardsForLevel } from '../engine/balance'
import type {
  ThemeStrings, ProductDef, LocationDef, FrontDef, BlockDef, HeatBandInfo,
  QualityBuff,
} from '../engine/types'

export const engine = new Engine()

// Reachable from the browser console during development. Invaluable for
// inspecting simulation state without threading debug UI through React.
if (import.meta.env.DEV) {
  ;(globalThis as unknown as Record<string, unknown>).__engine = engine
}

// ---------------------------------------------------------------------------
// Snapshot
//
// React never reads the mutable GameState. The engine publishes an immutable
// snapshot at BALANCE.UI_HZ and components render from that, so a 10Hz
// simulation does not become a 10Hz render of every panel.
// ---------------------------------------------------------------------------

export interface ProductView {
  def: ProductDef
  level: number
  unlocked: boolean
  purity: number
  effPurity: number
  inventory: Big
  cyclePct: number
  yieldPerCycle: Big
  unitsPerSecond: Big
  nextCost: Big
  maxAffordable: number
  canAfford: boolean
  locationOwned: boolean
  unlockCost: Big
  canUnlock: boolean
  blockedBySlots: boolean
  buff: QualityBuff | null
  /** Fraction of the bonus duration still to run, 0..1. */
  buffPct: number
  plays: number
  autoUnlocked: boolean
  autoOn: boolean
}

export interface BlockView {
  def: BlockDef
  unlocked: boolean
  customers: number
  ceiling: number
  dealers: number
  accepting: boolean
  /** Perceived purity of the weakest thing currently sold here. */
  servedPurity: number
}

export interface LocationView {
  def: LocationDef
  owned: boolean
  current: boolean
  canAfford: boolean
  cost: Big
}

export interface FrontView {
  def: FrontDef
  owned: boolean
  canAfford: boolean
  cost: Big
}

export interface ItemView {
  def: ItemDef
  owned: boolean
  level: number
  shards: number
  shardsForNext: number
  equipped: boolean
  /** Stat magnitudes at the item's current level. */
  stats: { key: StatKey; value: number }[]
}

export interface SlotView {
  slot: ItemSlot
  label: string
  equipped: ItemView | null
  /** Everything owned that fits this slot, best first. */
  options: ItemView[]
}

/** One line's contribution to the heat you are currently generating. */
export interface HeatSource {
  id: string
  name: string
  perMin: number
  share: number
  /** Units moved per minute, not the raw count from one 100ms tick. */
  unitsPerMin: Big
}

export interface Snapshot {
  tick: number
  strings: ThemeStrings
  dirty: Big
  clean: Big
  dirtyCap: Big
  overCap: boolean
  launderPerMin: Big
  heat: number
  band: HeatBandInfo
  raidCooldown: number
  /** Heat generated per minute right now, before decay. */
  heatPerMin: number
  heatDecayPerMin: number
  /** Net change per minute. Negative means it is cooling off. */
  heatNetPerMin: number
  heatSources: HeatSource[]
  bribeCost: Big
  canBribe: boolean
  bribesThisRun: number
  events: GameEvent[]
  loadout: SlotView[]
  ownedItems: number
  totalItems: number
  /**
   * The modifiers the simulation is actually applying, not a re-sum of the
   * equipped items. Those differ -- heat resistance is clamped at 90% so the
   * pressure system can never be switched off entirely -- and a totals panel
   * that disagrees with the engine is worse than no totals panel.
   */
  modTotals: { key: StatKey; value: number }[]
  uniquesActive: string[]
  products: ProductView[]
  blocks: BlockView[]
  locations: LocationView[]
  fronts: FrontView[]
  duffels: { street: number; safe: number; armored: number }
  stationSlots: number
  stationsUsed: number
  revenuePerSec: Big
  connections: Big
  totalPrestiges: number
  canPrestige: boolean
  prestigeNeed: Big
  prestigePayout: Big
  playSeconds: number
}

let tickCounter = 0

function buildProducts(used: number, slots: number): ProductView[] {
  const { state, content, mods } = engine
  const run = state.run

  return content.products.map((def) => {
    const ps = run.products[def.id]
    const perCycle = yieldPerCycle(def, ps.level, ps.purity, mods, state.meta.purchased2x, ps.buff)
    const nextCost = engine.nextStationCost(def.id)
    const unlockCost = big(def.unlockCost)
    const locationOwned = run.ownedLocations.includes(def.requiresLocation)

    return {
      def,
      level: ps.level,
      unlocked: ps.unlocked,
      purity: ps.purity,
      effPurity: effectivePurity(ps.purity, mods, ps.buff),
      inventory: ps.inventory,
      cyclePct: Math.min(100, (ps.cycleProgress / def.cycleSeconds) * 100),
      yieldPerCycle: perCycle,
      unitsPerSecond: perCycle.div(def.cycleSeconds),
      nextCost,
      maxAffordable: engine.maxAffordableLevels(def.id),
      canAfford: run.dirtyCash.gte(nextCost),
      locationOwned,
      unlockCost,
      canUnlock: !ps.unlocked && locationOwned && run.cleanCash.gte(unlockCost),
      blockedBySlots: ps.level === 0 && used >= slots,
      buff: ps.buff,
      buffPct: ps.buff ? ps.buff.remaining / BALANCE.BUFF_DURATION_SECONDS : 0,
      plays: state.meta.minigamePlays[def.id] ?? 0,
      autoUnlocked: autoRunUnlocked(state, def.id),
      autoOn: state.meta.autoRun[def.id] === true,
    }
  })
}

function buildBlocks(): BlockView[] {
  const { state, content, mods } = engine
  const run = state.run

  return content.blocks.map((def) => {
    const bs = run.blocks[def.id]

    // A district's opinion of you is set by the worst thing on offer.
    let worst = Infinity
    for (const want of def.wants) {
      const ps = run.products[want]
      if (ps?.unlocked && ps.level > 0) {
        worst = Math.min(worst, effectivePurity(ps.purity, mods, ps.buff))
      }
    }
    const supplied = Number.isFinite(worst)

    return {
      def,
      unlocked: bs.unlocked,
      customers: bs.customers,
      ceiling: customerCeiling(def, state),
      dealers: bs.dealers,
      accepting: supplied && blockAccepts(def, worst),
      servedPurity: supplied ? worst : 0,
    }
  })
}

const RARITY_RANK: Record<Rarity, number> = {
  street: 0, solid: 1, connected: 2, made: 3, untouchable: 4,
}

function viewItem(def: ItemDef): ItemView {
  const owned = engine.state.meta.loadout[def.id]
  const level = owned?.level ?? 1

  return {
    def,
    owned: !!owned,
    level,
    shards: owned?.shards ?? 0,
    shardsForNext: level >= BALANCE.MAX_ITEM_LEVEL ? 0 : shardsForLevel(level),
    equipped: engine.state.meta.equipped[def.slot] === def.id,
    stats: (Object.entries(def.stats) as [StatKey, number][]).map(([key, base]) => ({
      key,
      value: itemStatAtLevel(base, level),
    })),
  }
}

function buildLoadout(): SlotView[] {
  const { content, state } = engine

  return SLOT_ORDER.map((slot) => {
    const equippedId = state.meta.equipped[slot]

    const options = content.items
      .filter((i) => i.slot === slot && state.meta.loadout[i.id])
      .map(viewItem)
      .sort((a, b) =>
        RARITY_RANK[b.def.rarity] - RARITY_RANK[a.def.rarity] || b.level - a.level)

    return {
      slot,
      label: SLOT_LABEL[slot],
      equipped: equippedId ? viewItem(content.items.find((i) => i.id === equippedId)!) : null,
      options,
    }
  })
}

function build(): Snapshot {
  const { state, content, mods } = engine
  const run = state.run

  const location = content.locations.find((l) => l.id === run.currentLocation)
  const slots = location?.stationSlots ?? 0
  const used = content.products.filter((p) => (run.products[p.id]?.level ?? 0) > 0).length

  const report = engine.lastReport
  const revenuePerSec = report && report.dtSeconds > 0
    ? report.revenue.div(report.dtSeconds)
    : ZERO

  const cap = dirtyCap(state, content)

  // Rates come from the last step rather than being recomputed, so what the
  // panel shows is exactly what the simulation just did.
  const dt = report && report.dtSeconds > 0 ? report.dtSeconds : 0
  const heatPerMin = dt > 0 ? (report!.heatGained / dt) * 60 : 0
  const decayPerMin = BALANCE.HEAT_DECAY_PER_MIN

  const heatSources: HeatSource[] = []
  if (dt > 0 && report) {
    for (const def of content.products) {
      const h = report.heatByProduct[def.id]
      if (!h) continue
      const perMin = (h / dt) * 60
      heatSources.push({
        id: def.id,
        name: def.name,
        perMin,
        share: heatPerMin > 0 ? perMin / heatPerMin : 0,
        unitsPerMin: (report.unitsByProduct[def.id] ?? ZERO).div(dt).mul(60),
      })
    }
    heatSources.sort((a, b) => b.perMin - a.perMin)
  }

  const bribe = engine.bribeCost()

  return {
    tick: ++tickCounter,
    strings: content.strings,
    dirty: run.dirtyCash,
    clean: run.cleanCash,
    dirtyCap: cap,
    overCap: run.dirtyCash.gt(cap),
    launderPerMin: launderPerMinute(state, content, mods),
    heat: run.heat,
    band: heatBand(run.heat),
    raidCooldown: run.raidCooldownSeconds,
    heatPerMin,
    heatDecayPerMin: decayPerMin,
    heatNetPerMin: heatPerMin - decayPerMin,
    heatSources,
    bribeCost: bribe,
    canBribe: run.heat > 0 && run.dirtyCash.gte(bribe),
    bribesThisRun: run.bribesThisRun,
    events: engine.events.slice(0, 20),
    loadout: buildLoadout(),
    ownedItems: Object.keys(state.meta.loadout).length,
    totalItems: content.items.length,
    modTotals: ([
      ['yield', mods.yield],
      ['purityFloor', mods.purityFloor],
      ['price', mods.price],
      ['heatResist', mods.heatResist],
      ['launderRate', mods.launderRate],
      ['offlineCap', mods.offlineCapHours - BALANCE.OFFLINE_CAP_HOURS_BASE],
    ] as [StatKey, number][])
      .filter(([, v]) => Math.abs(v) > 1e-9)
      .map(([key, value]) => ({ key, value })),
    uniquesActive: [...mods.uniques],
    products: buildProducts(used, slots),
    blocks: buildBlocks(),
    locations: content.locations.map((def) => ({
      def,
      owned: run.ownedLocations.includes(def.id),
      current: run.currentLocation === def.id,
      canAfford: run.cleanCash.gte(big(def.cost)),
      cost: big(def.cost),
    })),
    fronts: content.fronts.map((def) => ({
      def,
      owned: run.ownedFronts.includes(def.id),
      canAfford: run.cleanCash.gte(big(def.cost)),
      cost: big(def.cost),
    })),
    duffels: { ...state.meta.duffels },
    stationSlots: slots,
    stationsUsed: used,
    revenuePerSec,
    connections: state.meta.connections,
    totalPrestiges: state.meta.totalPrestiges,
    canPrestige: engine.canPrestige(),
    prestigeNeed: engine.prestigeRequirement(),
    prestigePayout: engine.prestigePayout(),
    playSeconds: state.totalPlaySeconds,
  }
}

let cached: Snapshot | null = null

/**
 * getSnapshot must return a stable reference between publishes or
 * useSyncExternalStore loops forever, so the snapshot is rebuilt only inside
 * the engine's notify callback.
 */
function subscribe(onChange: () => void): () => void {
  return engine.subscribe(() => {
    cached = build()
    onChange()
  })
}

function getSnapshot(): Snapshot {
  if (!cached) cached = build()
  return cached
}

export function useGame(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ---------------------------------------------------------------------------
// Pure UI state -- never persisted, never touched by the simulation.
// ---------------------------------------------------------------------------

export type Tab = 'production' | 'territory' | 'kit' | 'law' | 'fronts' | 'places'
export type BuyAmount = 1 | 10 | 100 | -1

interface UiState {
  tab: Tab
  devOpen: boolean
  buyAmount: BuyAmount
  setTab: (t: Tab) => void
  toggleDev: () => void
  setBuyAmount: (n: BuyAmount) => void
}

export const useUi = create<UiState>((set) => ({
  tab: 'production',
  devOpen: false,
  buyAmount: 1,
  setTab: (tab) => set({ tab }),
  toggleDev: () => set((s) => ({ devOpen: !s.devOpen })),
  setBuyAmount: (buyAmount) => set({ buyAmount }),
}))
