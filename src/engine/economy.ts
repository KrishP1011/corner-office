import { big, type Big, ZERO } from './bignum'
import { BALANCE, MINIGAME_REWARDS, milestoneMultiplier } from './balance'
import type {
  ProductDef, BlockDef, ContentPack, GameState,
  Modifiers, HeatBandInfo, StatKey, QualityBuff,
} from './types'

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

export const EMPTY_MODIFIERS: Modifiers = {
  yield: 0,
  purityFloor: 0,
  price: 0,
  heatResist: 0,
  launderRate: 0,
  offlineCapHours: BALANCE.OFFLINE_CAP_HOURS_BASE,
  duffelDropRate: 0,
}

/** Item stats scale +12% of base per level. Level 10 is 2.08x the drop roll. */
export function itemStatAtLevel(base: number, level: number): number {
  return base * (1 + 0.12 * (level - 1))
}

/**
 * Collapse everything that buffs the player -- equipped gear, and later the
 * connections tree and crew -- into one flat struct the sim reads per tick.
 */
export function computeModifiers(state: GameState, content: ContentPack): Modifiers {
  const mods: Modifiers = { ...EMPTY_MODIFIERS }
  const itemsById = new Map(content.items.map((i) => [i.id, i]))

  for (const defId of Object.values(state.meta.equipped)) {
    if (!defId) continue
    const def = itemsById.get(defId)
    const owned = state.meta.loadout[defId]
    if (!def || !owned) continue

    for (const [key, base] of Object.entries(def.stats) as [StatKey, number][]) {
      const value = itemStatAtLevel(base, owned.level)
      if (key === 'offlineCap') mods.offlineCapHours += value
      else mods[key] += value
    }
  }

  // Heat resistance is a diminishing shield, never an off switch -- at 100%
  // resistance the entire pressure system stops existing.
  mods.heatResist = Math.min(mods.heatResist, 0.9)

  return mods
}

// ---------------------------------------------------------------------------
// Purity / the cut
// ---------------------------------------------------------------------------

/**
 * What customers believe they are getting. Gear raises this above the real
 * number, which is the whole reason the Loadout matters: it lets you cut
 * harder than the market should tolerate.
 */
export function effectivePurity(
  purity: number, mods: Modifiers, buff?: QualityBuff | null,
): number {
  const bonus = mods.purityFloor + (buff?.purityBonus ?? 0)
  return Math.min(BALANCE.PURITY_MAX, purity + bonus)
}

/** Multiplier on unit count from cutting. Purity 25 yields 4x the units. */
export function cutMultiplier(purity: number): number {
  return BALANCE.PURITY_MAX / purity
}

/** Multiplier on unit price from perceived quality. 1.0 at the pivot. */
export function priceMultiplier(effPurity: number): number {
  return Math.pow(effPurity / BALANCE.PRICE_PIVOT, BALANCE.PRICE_EXP)
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

/** Units produced by one completed cycle, cut and modifiers included. */
export function yieldPerCycle(
  def: ProductDef,
  level: number,
  purity: number,
  mods: Modifiers,
  purchased2x: boolean,
  buff?: QualityBuff | null,
): Big {
  if (level <= 0) return ZERO
  const base = def.baseYield * level * milestoneMultiplier(level)
  const cut = base * cutMultiplier(purity)
  const buffed = cut * (1 + mods.yield) * (purchased2x ? 2 : 1) * (buff?.yieldMult ?? 1)
  return big(buffed)
}

/** Dirty cash to take a line from `level` to `level + 1`. */
export function stationCost(def: ProductDef, level: number): Big {
  return big(def.baseStationCost).mul(big(Math.pow(def.costGrowth, level)))
}

/** Total cost of buying `count` levels starting from `level`. */
export function stationCostBulk(def: ProductDef, level: number, count: number): Big {
  // Geometric series: base * g^level * (g^count - 1) / (g - 1)
  const g = def.costGrowth
  const first = big(def.baseStationCost).mul(big(Math.pow(g, level)))
  const factor = (Math.pow(g, count) - 1) / (g - 1)
  return first.mul(big(factor))
}

/** How many levels `budget` can afford, capped at `max`. */
export function affordableLevels(
  def: ProductDef, level: number, budget: Big, max = 1000,
): number {
  let lo = 0
  let hi = max
  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2)
    if (stationCostBulk(def, level, mid).lte(budget)) lo = mid
    else hi = mid - 1
  }
  return lo
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export function unitPrice(
  def: ProductDef, effPurity: number, block: BlockDef, mods: Modifiers,
): Big {
  return big(def.basePrice)
    .mul(big(priceMultiplier(effPurity)))
    .mul(big(block.priceMod))
    .mul(big(1 + mods.price))
}

/**
 * Customer ceiling for a district. Scales with the levels of the goods it
 * wants so demand roughly tracks the size of your operation -- inventory
 * should only pile up when you have cut too hard, not as a matter of course.
 */
export function customerCeiling(
  block: BlockDef, state: GameState,
): number {
  let levelSum = 0
  for (const want of block.wants) {
    levelSum += state.run.products[want]?.level ?? 0
  }
  return block.volume * (
    BALANCE.CUSTOMER_CEIL_BASE + BALANCE.CUSTOMER_CEIL_PER_LEVEL * levelSum
  )
}

/** Whether this district still accepts product at the given perceived purity. */
export function blockAccepts(block: BlockDef, effPurity: number): boolean {
  return effPurity >= block.minPurity
}

/** Perceived purity far enough under tolerance to start hurting people. */
export function isBadBatch(block: BlockDef, effPurity: number): boolean {
  return effPurity < block.minPurity - BALANCE.BAD_BATCH_MARGIN
}

// ---------------------------------------------------------------------------
// Heat
// ---------------------------------------------------------------------------

export function heatBand(heat: number): HeatBandInfo {
  const b = BALANCE.HEAT_BANDS
  if (heat >= b.burned) {
    return { band: 'burned', raidChancePerMin: BALANCE.RAID_CHANCE_BURNED, salesPenalty: BALANCE.WARM_SALES_PENALTY }
  }
  if (heat >= b.hot) {
    return { band: 'hot', raidChancePerMin: BALANCE.RAID_CHANCE_HOT, salesPenalty: BALANCE.WARM_SALES_PENALTY }
  }
  if (heat >= b.warm) {
    return { band: 'warm', raidChancePerMin: 0, salesPenalty: BALANCE.WARM_SALES_PENALTY }
  }
  return { band: 'cold', raidChancePerMin: 0, salesPenalty: 0 }
}

/** Heat produced by moving `units`, after the location and resistances. */
export function heatFromUnits(
  units: Big, def: ProductDef, locationHeatMod: number, mods: Modifiers,
  buff?: QualityBuff | null,
): number {
  const raw = units.toNumber() * def.heatPerUnit
  if (!Number.isFinite(raw)) return 0
  return raw * (1 + locationHeatMod) * (1 - mods.heatResist) * (buff?.heatMult ?? 1)
}

/**
 * Dirty cash you can sit on before the pile itself is evidence.
 *
 * Scales with the next upgrade you could buy so that saving toward one is
 * never what burns you -- the penalty is for hoarding well past what your
 * operation could spend, not for playing normally.
 */
export function dirtyCap(state: GameState, content: ContentPack): Big {
  let cap = big(BALANCE.DIRTY_CAP_BASE)

  let priciestNext = ZERO
  for (const def of content.products) {
    const ps = state.run.products[def.id]
    if (!ps?.unlocked) continue
    const next = stationCost(def, ps.level)
    if (next.gt(priciestNext)) priciestNext = next
  }
  const byUpgrade = priciestNext.mul(big(BALANCE.DIRTY_CAP_UPGRADE_MULT))
  if (byUpgrade.gt(cap)) cap = byUpgrade

  const frontsById = new Map(content.fronts.map((f) => [f.id, f]))
  for (const id of state.run.ownedFronts) {
    const f = frontsById.get(id)
    if (f) cap = cap.add(big(f.capacity).mul(big(BALANCE.DIRTY_CAP_PER_FRONT)))
  }
  return cap
}

/** Clean cash per minute the owned fronts can absorb from the dirty pile. */
export function launderPerMinute(
  state: GameState, content: ContentPack, mods: Modifiers,
): Big {
  const dirty = state.run.dirtyCash
  if (dirty.lte(ZERO)) return ZERO

  const frontsById = new Map(content.fronts.map((f) => [f.id, f]))

  // Baseline capacity everyone has, so the first front is an upgrade rather
  // than a gate on the only currency that can buy it.
  const byBaseRate = dirty.mul(big(BALANCE.BASE_LAUNDER_RATE_PER_MIN))
  const baseCap = big(BALANCE.BASE_LAUNDER_CAP)
  let total = byBaseRate.lt(baseCap) ? byBaseRate : baseCap

  for (const id of state.run.ownedFronts) {
    const f = frontsById.get(id)
    if (!f) continue
    const byRate = dirty.mul(big(f.ratePerMin))
    const cap = big(f.capacity)
    total = total.add(byRate.lt(cap) ? byRate : cap)
  }
  return total.mul(big(1 + mods.launderRate))
}

/**
 * What a payoff costs right now.
 *
 * Priced off the priciest upgrade available, the same way the dirty-cash cap
 * is, so it stays a real decision at every tier instead of becoming free.
 * Heat raises the price -- they know what they have on you -- and each payoff
 * this run raises the next, so it cannot be the whole answer to heat.
 */
export function bribeCost(state: GameState, content: ContentPack): Big {
  void content
  const base = state.run.recentRevenuePerSec.mul(big(BALANCE.BRIBE_SECONDS_OF_INCOME))
  const floor = big(BALANCE.BRIBE_MIN_COST)

  return (base.gt(floor) ? base : floor)
    .mul(big(1 + state.run.heat / 100))
    .mul(big(1 + state.run.bribesThisRun * BALANCE.BRIBE_ESCALATION))
}

// ---------------------------------------------------------------------------
// Minigames
// ---------------------------------------------------------------------------

/**
 * Turn a 0..1 performance score into a buff. Never returns anything worse
 * than neutral -- a botched run still leaves a sliver, so attempting a
 * minigame can only ever help.
 */
export function buffFromScore(def: ProductDef, score: number): QualityBuff {
  const clamped = Math.max(BALANCE.MIN_SCORE_FLOOR, Math.min(1, score))
  const weights = MINIGAME_REWARDS[def.minigame]

  return {
    yieldMult: 1 + BALANCE.MAX_YIELD_BONUS * weights.yield * clamped,
    purityBonus: Math.round(BALANCE.MAX_PURITY_BONUS * weights.purity * clamped),
    heatMult: 1 - BALANCE.MAX_HEAT_REDUCTION * weights.heat * clamped,
    remaining: BALANCE.BUFF_DURATION_SECONDS,
  }
}

/** True once this product's minigame has been played enough to automate. */
export function autoRunUnlocked(state: GameState, productId: string): boolean {
  return (state.meta.minigamePlays[productId] ?? 0) >= BALANCE.AUTO_UNLOCK_PLAYS
}

// ---------------------------------------------------------------------------
// Prestige
// ---------------------------------------------------------------------------

export function prestigeRequirement(totalPrestiges: number): Big {
  return big(BALANCE.PRESTIGE_BASE_REQUIREMENT)
    .mul(big(Math.pow(BALANCE.PRESTIGE_REQUIREMENT_GROWTH, totalPrestiges)))
}

/** Connections granted for cashing out this run. */
export function prestigePayout(cleanEarnedThisRun: Big): Big {
  const scaled = cleanEarnedThisRun.div(big(BALANCE.PRESTIGE_DIVISOR))
  if (scaled.lte(ZERO)) return ZERO
  // sqrt via log to stay correct past 1e308.
  const root = Math.pow(10, scaled.log10() / 2)
  return big(Math.floor(root))
}

export function canPrestige(state: GameState): boolean {
  return state.run.cleanCash.gte(prestigeRequirement(state.meta.totalPrestiges))
}
