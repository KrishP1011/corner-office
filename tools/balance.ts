/**
 * Playthrough simulator.
 *
 * Runs the real engine under a reasonable player policy and prints when each
 * milestone lands. DESIGN.md section 16 reserves a full day for balancing a
 * curve spanning 1e0 to 1e12; this is the instrument for it, because reading
 * constants tells you nothing about where the walls actually are.
 *
 *   npx tsx tools/balance.ts [days]
 */
import { loadContent } from '../src/engine/content'
import { createInitialState, applyPrestige } from '../src/engine/state'
import {
  computeModifiers, stationCost, effectivePurity, yieldPerCycle,
  unitPrice, canPrestige, prestigePayout, bribeCost, crewWage, crewAvailable,
} from '../src/engine/economy'
import { runFor } from '../src/engine/tick'
import { big, fmt, fmtMoney, fmtDuration, type Big } from '../src/engine/bignum'
import { BALANCE, DUFFEL_ODDS } from '../src/engine/balance'
import { CONNECTION_NODES, nodeCost, nodeLevel } from '../src/engine/connections'
import type { GameState, ContentPack, ProductDef } from '../src/engine/types'

const content = loadContent('moonshine')
const DAYS = Number(process.argv[2] ?? 3)
const HORIZON = DAYS * 86400
const STEP = 15 // seconds of sim between policy decisions

const RANK: Record<string, number> = {
  street: 0, solid: 1, connected: 2, made: 3, untouchable: 4,
}

function rollRarity(tier: 'street' | 'safe' | 'armored'): string {
  const odds = DUFFEL_ODDS[tier]
  let r = Math.random()
  for (const k of ['street', 'solid', 'connected', 'made', 'untouchable'] as const) {
    if (r < odds[k]) return k
    r -= odds[k]
  }
  return 'street'
}

interface Mark { t: number; what: string }
const marks: Mark[] = []
const seen = new Set<string>()

function mark(t: number, key: string, what: string): void {
  if (seen.has(key)) return
  seen.add(key)
  marks.push({ t, what })
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/** Cut to the least proof that still serves every district wanting this. */
function idealPurity(def: ProductDef, state: GameState, content: ContentPack): number {
  let needed = BALANCE.PURITY_MIN
  for (const b of content.blocks) {
    if (!b.wants.includes(def.id)) continue
    if (!state.run.blocks[b.id]?.unlocked) continue
    needed = Math.max(needed, b.minPurity)
  }
  const mods = computeModifiers(state, content)
  return Math.max(BALANCE.PURITY_MIN, Math.min(BALANCE.PURITY_MAX, needed - mods.purityFloor))
}

/** Marginal revenue per second from one more level, per dirty cash spent. */
function upgradeValue(def: ProductDef, state: GameState): number {
  const ps = state.run.products[def.id]
  const mods = computeModifiers(state, content)
  const now = yieldPerCycle(def, ps.level, ps.purity, mods, false, ps.buff)
  const next = yieldPerCycle(def, ps.level + 1, ps.purity, mods, false, ps.buff)

  const block = content.blocks.find((b) => b.wants.includes(def.id) && state.run.blocks[b.id]?.unlocked)
  if (!block) return 0

  const price = unitPrice(def, effectivePurity(ps.purity, mods, ps.buff), block, mods)
  const gain = next.sub(now).div(def.cycleSeconds).mul(price)
  const cost = stationCost(def, ps.level)
  if (cost.lte(big(0))) return 0

  const ratio = gain.div(cost).toNumber()
  return Number.isFinite(ratio) ? ratio : 0
}

function act(state: GameState, t: number): void {
  const mods = computeModifiers(state, content)

  // Cut to what the market will take.
  for (const def of content.products) {
    const ps = state.run.products[def.id]
    if (ps.unlocked) ps.purity = idealPurity(def, state, content)
  }

  // Rooms, then lines. Both come out of banked money.
  for (const loc of content.locations) {
    if (state.run.ownedLocations.includes(loc.id)) continue
    if (state.run.cleanCash.gte(big(loc.cost))) {
      state.run.cleanCash = state.run.cleanCash.sub(big(loc.cost))
      state.run.ownedLocations.push(loc.id)
      state.run.currentLocation = loc.id
      mark(t, `loc:${loc.id}`, `moved into ${loc.name}`)
    }
  }

  for (const def of content.products) {
    const ps = state.run.products[def.id]
    if (ps.unlocked || !state.run.ownedLocations.includes(def.requiresLocation)) continue
    if (state.run.cleanCash.gte(big(def.unlockCost))) {
      state.run.cleanCash = state.run.cleanCash.sub(big(def.unlockCost))
      ps.unlocked = true
      ps.level = 1
      for (const b of content.blocks) {
        const bs = state.run.blocks[b.id]
        if (!bs.unlocked && b.wants.includes(def.id)) bs.unlocked = true
      }
      mark(t, `prod:${def.id}`, `opened ${def.name}`)
    }
  }

  // Fronts, so the money can come out clean.
  for (const f of content.fronts) {
    if (state.run.ownedFronts.includes(f.id)) continue
    if (state.run.cleanCash.gte(big(f.cost).mul(big(2)))) {
      state.run.cleanCash = state.run.cleanCash.sub(big(f.cost))
      state.run.ownedFronts.push(f.id)
      mark(t, `front:${f.id}`, `opened ${f.name}`)
    }
  }

  // Crew, cheapest useful first.
  for (const c of content.crew) {
    if (state.run.crew[c.role]) continue
    if (!crewAvailable(c, state)) continue
    if (state.run.cleanCash.gte(big(c.hireCost).mul(big(3)))) {
      state.run.cleanCash = state.run.cleanCash.sub(big(c.hireCost))
      state.run.crew[c.role] = { defId: c.id, loyalty: BALANCE.CREW_START_LOYALTY, payLevel: 'fair' }
      mark(t, `crew:${c.id}`, `hired ${c.name}`)
    }
  }

  // Keep the corners. Dealers are cheap relative to losing a district.
  for (const b of content.blocks) {
    const bs = state.run.blocks[b.id]
    if (!bs?.unlocked) continue
    if (bs.contested) {
      const cost = state.run.recentRevenuePerSec.mul(big(BALANCE.RETAKE_COST_SECONDS))
      if (state.run.dirtyCash.gte(cost)) {
        state.run.dirtyCash = state.run.dirtyCash.sub(cost)
        bs.contested = false
        bs.rivalPressure = 50
      }
      continue
    }
    if (bs.rivalPressure > 40 && bs.dealers < b.dealerSlots) {
      const cost = state.run.recentRevenuePerSec.mul(big(BALANCE.DEALER_COST_SECONDS))
      if (state.run.dirtyCash.gte(cost)) {
        state.run.dirtyCash = state.run.dirtyCash.sub(cost)
        bs.dealers += 1
      }
    }
  }

  // Pay somebody off before it gets out of hand.
  if (state.run.heat > 72) {
    const cost = bribeCost(state, content)
    if (state.run.dirtyCash.gte(cost.mul(big(3)))) {
      state.run.dirtyCash = state.run.dirtyCash.sub(cost)
      state.run.heat = Math.max(0, state.run.heat - BALANCE.BRIBE_HEAT_RELIEF)
      state.run.bribesThisRun += 1
    }
  }

  // Open whatever has turned up, and put it on.
  const bag = state.meta.duffels
  for (const tier of ['armored', 'safe', 'street'] as const) {
    while (bag[tier] > 0) {
      bag[tier] -= 1
      const pool = content.items.filter((i) => i.rarity === rollRarity(tier))
      const item = pool[Math.floor(Math.random() * pool.length)] ?? content.items[0]
      const owned = state.meta.loadout[item.id]
      if (!owned) state.meta.loadout[item.id] = { defId: item.id, level: 1, shards: 0 }
      else {
        owned.shards += 1
        while (owned.level < BALANCE.MAX_ITEM_LEVEL && owned.shards >= owned.level) {
          owned.shards -= owned.level
          owned.level += 1
        }
      }
      // Wear the best thing available for each slot.
      const best = content.items
        .filter((i) => i.slot === item.slot && state.meta.loadout[i.id])
        .sort((a, b) => RANK[b.rarity] - RANK[a.rarity])[0]
      if (best) state.meta.equipped[item.slot] = best.id
    }
  }

  // Everything else goes into stills, best return first.
  for (let i = 0; i < 400; i++) {
    let best: ProductDef | null = null
    let bestValue = 0
    for (const def of content.products) {
      if (!state.run.products[def.id].unlocked) continue
      const v = upgradeValue(def, state)
      if (v > bestValue) { bestValue = v; best = def }
    }
    if (!best) break
    const cost = stationCost(best, state.run.products[best.id].level)
    if (state.run.dirtyCash.lt(cost)) break
    state.run.dirtyCash = state.run.dirtyCash.sub(cost)
    state.run.products[best.id].level += 1
  }

  void mods
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/** Buy up the tree, cheapest node first, the way a player would. */
function spendConnections(s: GameState): void {
  for (let i = 0; i < 200; i++) {
    const options = CONNECTION_NODES
      .map((n) => ({ n, level: nodeLevel(s, n.id) }))
      .filter(({ n, level }) => level < n.maxLevel)
      .map(({ n, level }) => ({ n, level, cost: nodeCost(n, level) }))
      .sort((a, b) => a.cost - b.cost)

    const pick = options.find((o) => s.meta.connections.gte(big(o.cost)))
    if (!pick) break
    s.meta.connections = s.meta.connections.sub(big(pick.cost))
    s.meta.connectionsSpent[pick.n.id] = pick.level + 1
  }
}

let state = createInitialState(content)
let t = 0
let prestiges = 0
let lastPrestigeAt = 0
const samples: { t: number; rate: Big; heat: number; levels: number }[] = []

while (t < HORIZON) {
  const mods = computeModifiers(state, content)
  runFor(state, content, mods, STEP, false)
  t += STEP
  act(state, t)

  if (canPrestige(state)) {
    const payout = prestigePayout(state.run.cleanEarnedThisRun)
    prestiges++
    mark(t, `cashed:${prestiges}`,
      `--- cashed out #${prestiges}, +${fmt(payout)} connections (run took ${fmtDuration(t - lastPrestigeAt)}) ---`)
    lastPrestigeAt = t
    state = applyPrestige(state, content, payout)
    spendConnections(state)
  }

  if (t % 900 === 0) {
    let levels = 0
    for (const p of Object.values(state.run.products)) levels += p.level
    samples.push({ t, rate: state.run.recentRevenuePerSec, heat: state.run.heat, levels })
  }
}

// ---------------------------------------------------------------------------
console.log(`\nPLAYTHROUGH -- ${DAYS} day(s), policy-driven\n${'='.repeat(52)}\n`)
console.log('TIMELINE')
for (const m of marks) {
  console.log(`  ${fmtDuration(m.t).padStart(9)}  ${m.what}`)
}

console.log('\nINCOME CURVE')
console.log('  time        $/sec        levels   heat')
const stride = Math.max(1, Math.floor(samples.length / 18))
for (let i = 0; i < samples.length; i += stride) {
  const s = samples[i]
  console.log(
    `  ${fmtDuration(s.t).padStart(9)}  ${fmtMoney(s.rate).padStart(11)}` +
    `  ${String(s.levels).padStart(7)}  ${s.heat.toFixed(0).padStart(4)}`
  )
}

// Flag stretches where nothing happened.
console.log('\nDEAD STRETCHES (over 40 min with no milestone)')
let prev = 0
let found = false
for (const m of marks) {
  if (m.t - prev > 2400) {
    console.log(`  ${fmtDuration(prev)} -> ${fmtDuration(m.t)}  (${fmtDuration(m.t - prev)} of nothing)`)
    found = true
  }
  prev = m.t
}
if (!found) console.log('  none')
console.log()
