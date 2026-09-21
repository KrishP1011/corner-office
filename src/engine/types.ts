import type { Big } from './bignum'

// ---------------------------------------------------------------------------
// Content (static, loaded from /src/content/<theme>/*.json)
//
// The engine never hardcodes a product, district, or front. Everything the
// player interacts with is data, so the whole game reskins by pointing the
// loader at a different folder. See DESIGN.md section 15.
// ---------------------------------------------------------------------------

export type MinigameKind =
  | 'none'
  | 'balance'
  | 'contamination'
  | 'timing'
  | 'route'
  | 'stability'

export interface ProductDef {
  id: string
  tier: number
  name: string
  tagline: string
  /** Clean cash required to unlock the product line. */
  unlockCost: string
  /** Units produced per cycle at level 1, before cut and milestones. */
  baseYield: number
  /** Sale price per unit at exactly 50 purity, before district modifiers. */
  basePrice: string
  cycleSeconds: number
  /** Dirty cash cost of the first level. */
  baseStationCost: string
  costGrowth: number
  /** Heat generated per unit sold, before resistances. */
  heatPerUnit: number
  minigame: MinigameKind
  /** Location that must be owned before this line can be built. */
  requiresLocation: string
}

export interface LocationDef {
  id: string
  name: string
  tagline: string
  /** Clean cash. The starting location is free. */
  cost: string
  /** How many product lines can run concurrently here. */
  stationSlots: number
  /** Additive modifier on all heat generation. 0.2 = +20%. */
  heatMod: number
}

export interface FrontDef {
  id: string
  name: string
  tagline: string
  /** Clean cash. */
  cost: string
  /** Fraction of the dirty pile laundered per minute. */
  ratePerMin: number
  /** Hard ceiling on cash laundered per minute by this front. */
  capacity: string
}

export interface BlockDef {
  id: string
  name: string
  district: string
  /** Product ids this district will buy. */
  wants: string[]
  /** Effective purity below which customers start leaving. */
  minPurity: number
  /** Relative customer ceiling. */
  volume: number
  /** Multiplier on sale price. */
  priceMod: number
  dealerSlots: number
}

export type ItemSlot =
  | 'watch' | 'chain' | 'burner' | 'piece'
  | 'ride' | 'briefcase' | 'jacket' | 'kicks'

export type Rarity = 'street' | 'solid' | 'connected' | 'made' | 'untouchable'

export type StatKey =
  | 'yield' | 'purityFloor' | 'price'
  | 'heatResist' | 'launderRate' | 'offlineCap'

export interface ItemDef {
  id: string
  name: string
  slot: ItemSlot
  rarity: Rarity
  /** Stat -> magnitude at level 1. Fractions except purityFloor (points) and offlineCap (hours). */
  stats: Partial<Record<StatKey, number>>
  /** Untouchables only: id of a unique effect handled in code. */
  unique?: string
  flavor: string
}

export type CrewRole = 'chemist' | 'enforcer' | 'mule' | 'lawyer' | 'accountant'

export interface CrewDef {
  id: string
  name: string
  role: CrewRole
  rarity: Rarity
  stats: Partial<Record<StatKey, number>>
  /** Dirty cash per minute needed to hold loyalty steady. */
  marketWage: string
  flavor: string
}

export interface ThemeStrings {
  gameTitle: string
  purityLabel: string
  purityShort: string
  heatLabel: string
  lawLabel: string
  dirtyLabel: string
  cleanLabel: string
  cutVerb: string
  prestigeLabel: string
  prestigeCurrency: string
  chestLabel: string
  chestTiers: [string, string, string]
}

export interface ContentPack {
  themeId: string
  strings: ThemeStrings
  products: ProductDef[]
  locations: LocationDef[]
  fronts: FrontDef[]
  blocks: BlockDef[]
  items: ItemDef[]
  crew: CrewDef[]
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

/**
 * A temporary bonus earned by playing a product's minigame.
 *
 * Deliberately upside-only: failing a minigame gives a weak buff, never a
 * penalty. The minigames are what makes active play worth ~3x idle, not a
 * tax on leaving the game running.
 */
export interface QualityBuff {
  /** Multiplier on units produced. 1.0 = no effect. */
  yieldMult: number
  /** Points added to perceived purity, on top of gear. */
  purityBonus: number
  /** Multiplier on heat generated. 1.0 = no effect, 0.65 = a third less. */
  heatMult: number
  /** Seconds left. Counts down every step. */
  remaining: number
}

export interface ProductState {
  /** 0 means the line has not been built yet. */
  level: number
  /** Seconds accumulated into the current production cycle. */
  cycleProgress: number
  /** Purity this line is cut to, 10..100. */
  purity: number
  inventory: Big
  unlocked: boolean
  /** null when no minigame bonus is active. */
  buff: QualityBuff | null
}

export interface BlockState {
  unlocked: boolean
  /** Current customer count. Grows toward the ceiling, decays on bad product. */
  customers: number
  dealers: number
}

export interface OwnedItem {
  defId: string
  level: number
  /** Duplicates held toward the next level. */
  shards: number
}

export interface HeatBandInfo {
  band: 'cold' | 'warm' | 'hot' | 'burned'
  raidChancePerMin: number
  salesPenalty: number
}

/** Everything wiped by a prestige. */
export interface RunState {
  dirtyCash: Big
  cleanCash: Big
  heat: number
  products: Record<string, ProductState>
  blocks: Record<string, BlockState>
  ownedLocations: string[]
  currentLocation: string
  ownedFronts: string[]
  /** Seconds of quiet remaining after a raid. Counts down every step. */
  raidCooldownSeconds: number
  /**
   * Smoothed revenue per second. Anything priced against "what the operation
   * earns" reads this, because upgrade costs grow exponentially while income
   * grows linearly -- pricing off upgrades drifts out of reach by design.
   */
  recentRevenuePerSec: Big
  /** Payoffs made this run. Each one makes the next more expensive. */
  bribesThisRun: number
  /** Last heat band seen, so a crossing can be announced once. */
  lastBand: 'cold' | 'warm' | 'hot' | 'burned'
  /** Cumulative clean cash earned this run, drives the prestige payout. */
  cleanEarnedThisRun: Big
  startedAt: number
}

/** Everything that survives a prestige. */
export interface MetaState {
  connections: Big
  connectionsSpent: Record<string, number>
  /** defId -> owned item. One entry per item definition. */
  loadout: Record<string, OwnedItem>
  /** slot -> equipped defId. */
  equipped: Partial<Record<ItemSlot, string>>
  duffels: { street: number; safe: number; armored: number }
  unlockedCrew: string[]
  totalPrestiges: number
  /** Lifetime minigame completions per product; gates the auto-run toggle. */
  minigamePlays: Record<string, number>
  /** Per product: keep a weaker buff topped up automatically. */
  autoRun: Record<string, boolean>
  lifetimeCleanEarned: Big
  /** Permanent 2x from the IAP. Local-only entitlement in v1. */
  purchased2x: boolean
}

export interface GameState {
  schemaVersion: number
  themeId: string
  run: RunState
  meta: MetaState
  lastTickAt: number
  /** Wall-clock seconds of simulated time, for the dev panel and stats. */
  totalPlaySeconds: number
}

/** Aggregated buffs from gear, crew, and the connections tree. */
export interface Modifiers {
  yield: number
  purityFloor: number
  price: number
  heatResist: number
  launderRate: number
  offlineCapHours: number
  duffelDropRate: number
}

/**
 * Notable things the simulation did, surfaced so the world is legible.
 *
 * Events are session feedback, not saved state -- they live on the Engine
 * and are dropped on reload, which keeps them out of the save schema.
 */
export type EventKind =
  | 'raid' | 'badBatch' | 'bandUp' | 'bandDown'
  | 'crate' | 'churn' | 'bribe' | 'hoard'

export interface EventDraft {
  kind: EventKind
  tone: 'good' | 'bad' | 'neutral'
  /** Filled in by the Engine, which owns the strings. */
  subject?: string
  amount?: Big
  value?: number
}

export interface GameEvent {
  id: number
  kind: EventKind
  tone: 'good' | 'bad' | 'neutral'
  at: number
  text: string
}

/** What happened during a step, for the UI to react to. */
export interface StepReport {
  dtSeconds: number
  revenue: Big
  unitsSold: Big
  heatGained: number
  laundered: Big
  raided: boolean
  raidLoss: Big
  duffelsEarned: number
  /** Per-product heat contribution this step, for the breakdown panel. */
  heatByProduct: Record<string, number>
  unitsByProduct: Record<string, Big>
  events: EventDraft[]
}
