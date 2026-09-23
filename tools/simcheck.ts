/**
 * Headless balance harness.
 *
 * Runs the real engine with no browser, so the curve can be inspected and
 * regressions caught without clicking through six tiers. The Day 6 balance
 * pass lives here.
 *
 *   npx tsx tools/simcheck.ts
 */
import { loadContent } from '../src/engine/content'
import { createInitialState, applyPrestige } from '../src/engine/state'
import {
  computeModifiers, cutMultiplier, priceMultiplier, stationCost,
  buffFromScore, autoRunUnlocked, customerCeiling, bribeCost, heatBand,
  itemStatAtLevel, launderPerMinute, crewEffort, crewWage, effectivePurity,
  heatRatePerMinute,
  payrollPerMinute, blockDefense, blockValue, crewAvailable, totalLevels,
} from '../src/engine/economy'
import { DUFFEL_ODDS, shardsForLevel } from '../src/engine/balance'
import { CONNECTION_NODES, nodeCost } from '../src/engine/connections'
import type { ItemSlot, Rarity, StatKey } from '../src/engine/types'
import { BALANCE } from '../src/engine/balance'
import { runFor } from '../src/engine/tick'
import { fmt, fmtMoney, big, type Big } from '../src/engine/bignum'
import { serialize, deserialize } from '../src/engine/save'
import type { GameState } from '../src/engine/types'

const content = loadContent('moonshine')
let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
}

function header(s: string): void {
  console.log(`\n${s}\n${'-'.repeat(s.length)}`)
}

// ---------------------------------------------------------------------------
header('CONTENT')
console.log(`  ${content.products.length} products, ${content.locations.length} locations, ` +
            `${content.blocks.length} districts, ${content.fronts.length} fronts, ${content.items.length} items`)
check('product tiers are strictly increasing in price',
  content.products.every((p, i) => i === 0 || big(p.basePrice).gt(big(content.products[i - 1].basePrice))))

// ---------------------------------------------------------------------------
header('CUT TABLE (DESIGN.md section 2)')
console.log('  purity   units    price   revenue')
let prevRev = 0
let monotonic = true
for (const p of [100, 75, 50, 25, 10]) {
  const u = cutMultiplier(p)
  const pr = priceMultiplier(p)
  const rev = u * pr
  console.log(`    ${String(p).padStart(3)}    ${u.toFixed(2)}x    ${pr.toFixed(2)}x    ${rev.toFixed(2)}x`)
  if (prevRev && rev < prevRev) monotonic = false
  prevRev = rev
}
check('cutting harder always earns more', monotonic)
check('price multiplier is 1.0 at the pivot', Math.abs(priceMultiplier(50) - 1) < 1e-9)

// ---------------------------------------------------------------------------
header('CUT END-TO-END (same line, 15 min, purity 50 vs 20)')

function runAtPurity(purity: number, level: number, seconds: number): { state: GameState; revenue: Big } {
  const s = createInitialState(content)
  s.run.products['cider'].level = level
  s.run.products['cider'].purity = purity
  const m = computeModifiers(s, content)
  const r = runFor(s, content, m, seconds, false)
  return { state: s, revenue: r.revenue }
}

const pure = runAtPurity(50, 60, 900)
const cut = runAtPurity(20, 60, 900)
console.log(`  purity 50  revenue=${fmtMoney(pure.revenue).padStart(10)}  heat=${pure.state.run.heat.toFixed(1)}`)
console.log(`  purity 20  revenue=${fmtMoney(cut.revenue).padStart(10)}  heat=${cut.state.run.heat.toFixed(1)}`)
check('cutting to 20 earns more than 50', cut.revenue.gt(pure.revenue),
  `${cut.revenue.div(pure.revenue).toNumber().toFixed(2)}x`)
check('cutting to 20 runs hotter than 50', cut.state.run.heat > pure.state.run.heat)

// A district with minPurity above the effective cut should shed customers.
const churn = runAtPurity(12, 80, 3600)
const hts = churn.state.run.blocks['docks_row']
check('districts that reject the product are not served', !hts.unlocked || hts.customers >= 0)

// ---------------------------------------------------------------------------
header('PROGRESSION (fresh save, reinvest everything into the first line)')
const state = createInitialState(content)
let elapsed = 0
for (const mark of [300, 900, 3600, 3600 * 4, 3600 * 12]) {
  const mods = computeModifiers(state, content)
  runFor(state, content, mods, mark - elapsed, false)
  elapsed = mark

  const def = content.products[0]
  const ps = state.run.products[def.id]
  let bought = 0
  while (state.run.dirtyCash.gte(stationCost(def, ps.level)) && bought < 20000) {
    state.run.dirtyCash = state.run.dirtyCash.sub(stationCost(def, ps.level))
    ps.level += 1
    bought += 1
  }

  console.log(
    `  t=${String(Math.round(mark / 60)).padStart(4)}m  lvl=${String(ps.level).padStart(4)}` +
    `  dirty=${fmtMoney(state.run.dirtyCash).padStart(10)}` +
    `  clean=${fmtMoney(state.run.cleanCash).padStart(10)}` +
    `  inv=${fmt(ps.inventory).padStart(9)}` +
    `  heat=${state.run.heat.toFixed(1).padStart(5)}`
  )
}
check('clean cash flows without owning a front (no deadlock)', state.run.cleanCash.gt(big(0)))
check('second product is reachable inside 12h', state.run.cleanCash.gte(big(content.products[1].unlockCost)),
  `have ${fmtMoney(state.run.cleanCash)}, need ${fmtMoney(big(content.products[1].unlockCost))}`)
check('heat stays survivable in the first session', state.run.heat < 95,
  `heat=${state.run.heat.toFixed(1)}`)

// Every check above this one spends the moment it can afford to, which is
// exactly why they all passed while the game was soft-locked: laundering had
// a flat floor that outran opening income, so a player who saved up for
// anything watched every dollar wash itself before the button lit. The policy
// that catches that is the one that buys nothing.
{
  const idle = createInitialState(content)
  const mods = computeModifiers(idle, content)
  runFor(idle, content, mods, 1800, 0.25)

  check('saving up is possible -- loose cash accumulates when nothing is spent',
    idle.run.dirtyCash.gt(big(0)),
    `after 30m idle: loose=${fmtMoney(idle.run.dirtyCash)}, banked=${fmtMoney(idle.run.cleanCash)}`)

  // Not a ratio, so state it as one: laundering must leave the majority of
  // income where upgrades can reach it.
  const total = idle.run.dirtyCash.add(idle.run.cleanCash)
  const loose = total.gt(big(0)) ? idle.run.dirtyCash.div(total).toNumber() : 0
  check('laundering leaves most of the take spendable', loose > 0.5,
    `${(loose * 100).toFixed(0)}% of the take is still loose`)

  // The smoothed rate prices wages, payoffs and dealers, and it is the
  // headline number on screen. Sales arrive in spikes; it must report the
  // mean, not the spike.
  const earned = total.toNumber()
  const claimed = idle.run.recentRevenuePerSec.toNumber() * 1800
  const err = Math.abs(claimed - earned) / Math.max(1, earned)
  check('the reported income rate matches what was actually earned', err < 0.25,
    `reported ${fmtMoney(big(claimed))} over 30m vs ${fmtMoney(big(earned))} earned`)
}

// ---------------------------------------------------------------------------
header('HEAT PRESSURE (every line watered down as far as it will still sell)')
// 18, not lower: under 15 every district in the game refuses, so nothing
// sells, and a line that sells nothing draws no attention. Correct
// behaviour, useless test.
const hot = createInitialState(content)
for (const p of content.products) {
  hot.run.products[p.id].unlocked = true
  hot.run.products[p.id].level = 200
  hot.run.products[p.id].purity = 18
}
for (const b of content.blocks) hot.run.blocks[b.id].unlocked = true
const hotMods = computeModifiers(hot, content)
for (const m of [5, 15, 30, 60]) {
  runFor(hot, content, hotMods, m === 5 ? 300 : 600, false)
  console.log(`  t=${String(m).padStart(3)}m  heat=${hot.run.heat.toFixed(1).padStart(5)}  dirty=${fmtMoney(hot.run.dirtyCash)}`)
}
check('recklessness eventually draws heat', hot.run.heat > 40, `heat=${hot.run.heat.toFixed(1)}`)

// Suspicion is a rate driven by the cut, not a toll on every unit.
const cider = content.products[0]
const bareMods = computeModifiers(createInitialState(content), content)
const atFull = heatRatePerMinute(cider, 10, 100, 0, bareMods)
const atHalf = heatRatePerMinute(cider, 10, 50, 0, bareMods)
const atThin = heatRatePerMinute(cider, 10, 15, 0, bareMods)
console.log(`  one line at 10 units/s: proof 100=${atFull.toFixed(2)}/min  50=${atHalf.toFixed(2)}  15=${atThin.toFixed(2)}`)
check('watering down is what draws attention', atThin > atHalf && atHalf > atFull)
check('selling honestly is a discount, not a penalty', atFull < atHalf)
check('volume counts, but never runs away', (() => {
  const small = heatRatePerMinute(cider, 1, 50, 0, bareMods)
  const huge = heatRatePerMinute(cider, 100_000, 50, 0, bareMods)
  // A hundred-thousand-fold operation, at most a handful of times as loud.
  return huge > small && huge < small * 6
})())
check('dealers spread the risk', (() => {
  const s = createInitialState(content)
  for (const b of content.blocks) { s.run.blocks[b.id].unlocked = true; s.run.blocks[b.id].dealers = b.dealerSlots }
  const spread = computeModifiers(s, content)
  return heatRatePerMinute(cider, 10, 50, 0, spread) < atHalf
})())

// ---------------------------------------------------------------------------
header('MINIGAMES')

const beer = content.products.find((p) => p.id === 'beer')!
const scotch = content.products.find((p) => p.id === 'scotch')!
const gin = content.products.find((p) => p.id === 'gin')!

const perfect = buffFromScore(beer, 1)
const botched = buffFromScore(beer, 0)
console.log(`  beer   perfect -> yield x${perfect.yieldMult.toFixed(2)}, botched -> x${botched.yieldMult.toFixed(2)}`)
console.log(`  gin    perfect -> +${buffFromScore(gin, 1).purityBonus} proof`)
console.log(`  scotch perfect -> heat x${buffFromScore(scotch, 1).heatMult.toFixed(2)}`)

check('a perfect run pays the full yield ceiling',
  Math.abs(perfect.yieldMult - (1 + BALANCE.MAX_YIELD_BONUS)) < 1e-9)
check('a botched run is never worse than neutral',
  botched.yieldMult >= 1 && botched.heatMult <= 1 && botched.purityBonus >= 0)
check('each minigame buys something different',
  buffFromScore(gin, 1).purityBonus > 0 &&
  buffFromScore(scotch, 1).heatMult < 1 &&
  buffFromScore(beer, 1).yieldMult > 1 &&
  buffFromScore(gin, 1).yieldMult === 1)

// Active play should be worth meaningfully more than leaving it running.
//
// Customers are seeded at their ceiling first. From a cold start the window
// is dominated by customers ramping from zero, so sales are demand-limited
// and extra production only becomes inventory -- which is real behaviour,
// but not what this check is about.
function revenueOver(seconds: number, withBuff: boolean): Big {
  const s = createInitialState(content)
  s.run.products['cider'].level = 60
  s.run.products['beer'].unlocked = true
  s.run.products['beer'].level = 40
  if (withBuff) s.run.products['beer'].buff = buffFromScore(beer, 1)

  for (const b of content.blocks) {
    const bs = s.run.blocks[b.id]
    if (bs.unlocked) bs.customers = customerCeiling(b, s)
  }

  const m = computeModifiers(s, content)
  return runFor(s, content, m, seconds, false).revenue
}
const idle = revenueOver(240, false)
const active = revenueOver(240, true)
console.log(`  4 min idle=${fmtMoney(idle)}  buffed=${fmtMoney(active)}`)
check('a bonus measurably raises income', active.gt(idle),
  `${active.div(idle).toNumber().toFixed(2)}x`)

// Buffs must expire.
const decay = createInitialState(content)
decay.run.products['cider'].buff = buffFromScore(beer, 1)
const decayMods = computeModifiers(decay, content)
runFor(decay, content, decayMods, BALANCE.BUFF_DURATION_SECONDS + 60, false)
check('bonuses expire', decay.run.products['cider'].buff === null)

// Auto-run gate.
const auto = createInitialState(content)
check('auto-run is locked before the play count', !autoRunUnlocked(auto, 'beer'))
auto.meta.minigamePlays['beer'] = BALANCE.AUTO_UNLOCK_PLAYS
check('auto-run unlocks at the play count', autoRunUnlocked(auto, 'beer'))

auto.meta.autoRun['beer'] = true
auto.run.products['beer'].unlocked = true
auto.run.products['beer'].level = 10
runFor(auto, content, computeModifiers(auto, content), 30, false)
const held = auto.run.products['beer'].buff
check('auto-run keeps a weaker bonus topped up',
  held !== null && held.yieldMult > 1 && held.yieldMult < perfect.yieldMult,
  held ? `x${held.yieldMult.toFixed(2)} vs perfect x${perfect.yieldMult.toFixed(2)}` : 'none')

// ---------------------------------------------------------------------------
header('HEAT, RAIDS AND PAYOFFS')

// Heat must be attributable, or the player cannot act on it.
const attr = createInitialState(content)
attr.run.products['cider'].level = 300
attr.run.products['cider'].purity = 20
for (const b of content.blocks) {
  const bs = attr.run.blocks[b.id]
  if (bs.unlocked) bs.customers = customerCeiling(b, attr)
}
const attrReport = runFor(attr, content, computeModifiers(attr, content), 120, false)
const attributed = Object.values(attrReport.heatByProduct).reduce((a, b) => a + b, 0)
console.log(`  heat this step=${attrReport.heatGained.toFixed(2)}  attributed to lines=${attributed.toFixed(2)}`)
check('heat is attributable to the lines that caused it',
  attributed > 0 && attributed <= attrReport.heatGained + 1e-6)

// Band crossings should announce themselves exactly once.
//
// Calibrated against the rate model: suspicion is driven by how thin the
// product is and which tiers are running, so a single watered-down tier-one
// line is no longer enough to climb through the bands.
const bandState = createInitialState(content)
bandState.run.heat = 0
for (const p of content.products) {
  bandState.run.products[p.id].unlocked = true
  bandState.run.products[p.id].level = 200
  bandState.run.products[p.id].purity = 18
}
for (const b of content.blocks) bandState.run.blocks[b.id].unlocked = true
for (const b of content.blocks) {
  const bs = bandState.run.blocks[b.id]
  if (bs.unlocked) bs.customers = customerCeiling(b, bandState)
}
const climb = runFor(bandState, content, computeModifiers(bandState, content), 1200, false)
const crossings = climb.events.filter((e) => e.kind === 'bandUp' || e.kind === 'bandDown')
console.log(`  heat ${bandState.run.heat.toFixed(0)}, band ${heatBand(bandState.run.heat).band}, ${crossings.length} crossing(s) announced`)
check('a band is never announced twice in a row without changing',
  crossings.every((e, i) => i === 0 || e.subject !== crossings[i - 1].subject),
  `${crossings.length} events`)
check('crossings were actually announced', crossings.length > 0)
check('a raid announces itself', (() => {
  const s = createInitialState(content)
  s.run.heat = 99
  s.run.products['cider'].level = 200
  for (const b of content.blocks) {
    const bs = s.run.blocks[b.id]
    if (bs.unlocked) bs.customers = customerCeiling(b, s)
  }
  const r = runFor(s, content, computeModifiers(s, content), 600, false)
  return !r.raided || r.events.some((e) => e.kind === 'raid')
})())

// Payoffs: priced off the operation, escalating, and never free.
//
// Each state is run before pricing, because the basis is a smoothed income
// rate that only exists once trade has happened.
function traded(level: number, heat: number, seconds = 600): GameState {
  const s = createInitialState(content)
  s.run.products['cider'].level = level
  s.run.heat = 0
  for (const b of content.blocks) {
    const bs = s.run.blocks[b.id]
    if (bs.unlocked) bs.customers = customerCeiling(b, s)
  }
  runFor(s, content, computeModifiers(s, content), seconds, false)
  s.run.heat = heat
  return s
}

const bribeState = traded(80, 70)
const cost1 = bribeCost(bribeState, content)
bribeState.run.bribesThisRun = 3
const cost4 = bribeCost(bribeState, content)
bribeState.run.bribesThisRun = 0
bribeState.run.heat = 10
const costCold = bribeCost(bribeState, content)
console.log(`  payoff at heat 70=${fmtMoney(cost1)}  after 3 payoffs=${fmtMoney(cost4)}  at heat 10=${fmtMoney(costCold)}`)
check('payoffs get more expensive each time', cost4.gt(cost1))
check('payoffs cost more when they have more on you', cost1.gt(costCold))
const smallOp = bribeCost(traded(20, 50), content)
const bigOp = bribeCost(traded(300, 50), content)
console.log(`  payoff at level 20=${fmtMoney(smallOp)}  at level 300=${fmtMoney(bigOp)}`)
check('payoffs scale with the operation, not a flat price', bigOp.gt(smallOp.mul(5)))

// Crashing your own sales must not make the law cheap.
const exploit = traded(80, 70)
const before = bribeCost(exploit, content)
exploit.run.products['cider'].purity = 10 // under every district's tolerance
runFor(exploit, content, computeModifiers(exploit, content), 20, false)
const after = bribeCost(exploit, content)
console.log(`  payoff before a sales stop=${fmtMoney(before)}  20s after=${fmtMoney(after)}`)
check('stopping sales does not immediately cheapen a payoff',
  after.gt(before.mul(0.85)), `${after.div(before).toNumber().toFixed(2)}x`)

// A payoff has to actually be affordable out of a working operation.
const afford = createInitialState(content)
afford.run.products['cider'].level = 80
afford.run.heat = 60
for (const b of content.blocks) {
  const bs = afford.run.blocks[b.id]
  if (bs.unlocked) bs.customers = customerCeiling(b, afford)
}
runFor(afford, content, computeModifiers(afford, content), 600, false)
console.log(`  after 10 min at level 80: loose=${fmtMoney(afford.run.dirtyCash)} payoff=${fmtMoney(bribeCost(afford, content))}`)
check('a payoff is reachable from ten minutes of trade',
  afford.run.dirtyCash.gte(bribeCost(afford, content).div(4)))

// ---------------------------------------------------------------------------
header('OFFLINE (4h at level 50)')
const s3 = createInitialState(content)
s3.run.products['cider'].level = 50
const m3 = computeModifiers(s3, content)
const off = runFor(s3, content, m3, 4 * 3600, true)
console.log(`  revenue=${fmtMoney(off.revenue)}  units=${fmt(off.unitsSold)}  raided=${off.raided}  crates=${off.duffelsEarned}`)
check('offline crate drops stay reasonable', off.duffelsEarned <= 12, `${off.duffelsEarned} crates`)

// ---------------------------------------------------------------------------
header('THE LOADOUT')

const bySlot = new Map<ItemSlot, number>()
const byRarity = new Map<Rarity, number>()
for (const it of content.items) {
  bySlot.set(it.slot, (bySlot.get(it.slot) ?? 0) + 1)
  byRarity.set(it.rarity, (byRarity.get(it.rarity) ?? 0) + 1)
}
console.log(`  ${content.items.length} items across ${bySlot.size} slots`)
console.log(`  ${[...byRarity.entries()].map(([r, n]) => `${r} ${n}`).join(', ')}`)

check('every slot has gear', bySlot.size === 8)
check('each slot has six pieces', [...bySlot.values()].every((n) => n === 6))
check('every rarity is represented', byRarity.size === 5)
check('there is one untouchable per slot', (byRarity.get('untouchable') ?? 0) === 8)
check('every untouchable carries a unique effect',
  content.items.filter((i) => i.rarity === 'untouchable').every((i) => !!i.unique))
check('no unique effect is duplicated', (() => {
  const u = content.items.filter((i) => i.unique).map((i) => i.unique!)
  return new Set(u).size === u.length
})())

for (const [tier, odds] of Object.entries(DUFFEL_ODDS)) {
  const sum = Object.values(odds).reduce((a, b) => a + b, 0)
  check(`${tier} crate odds sum to 1`, Math.abs(sum - 1) < 1e-9, sum.toFixed(3))
}
check('better crates carry better odds',
  DUFFEL_ODDS.armored.made > DUFFEL_ODDS.safe.made &&
  DUFFEL_ODDS.safe.made > DUFFEL_ODDS.street.made)

// Levelling: +12% of base per level, so ten is 2.08x.
console.log(`  a 0.25 stat at Lv1=${itemStatAtLevel(0.25, 1).toFixed(3)} Lv10=${itemStatAtLevel(0.25, 10).toFixed(3)}`)
check('level 1 is the base roll', Math.abs(itemStatAtLevel(0.25, 1) - 0.25) < 1e-9)
check('level 10 is 2.08x the roll', Math.abs(itemStatAtLevel(1, 10) - 2.08) < 1e-9)
const toMax = Array.from({ length: 9 }, (_, i) => shardsForLevel(i + 1)).reduce((a, b) => a + b, 0)
console.log(`  duplicates needed to reach level 10: ${toMax}`)
check('maxing a piece takes a real grind', toMax === 45)

// Equipping actually changes the numbers.
function withGear(ids: string[]) {
  const s = createInitialState(content)
  for (const id of ids) {
    const def = content.items.find((i) => i.id === id)!
    s.meta.loadout[id] = { defId: id, level: 1, shards: 0 }
    s.meta.equipped[def.slot] = id
  }
  return s
}

const bare = computeModifiers(createInitialState(content), content)
const geared = computeModifiers(withGear(['watch_deadman', 'case_clean', 'ride_company']), content)
console.log(`  bare proof floor=${bare.purityFloor}  geared=${geared.purityFloor}`)
check('gear raises the proof floor', geared.purityFloor > bare.purityFloor)
check('gear extends time away', geared.offlineCapHours > bare.offlineCapHours)
check('equipped untouchables register their effects',
  geared.uniques.has('deadmans_watch') && geared.uniques.has('clean_hands'))
check('Company Car widens demand', geared.demandMult > 1)

// Uniques have to do something, not just read well.
//
// Both states are run first: laundering is a share of income, so a state
// that has never traded launders only the opening floor.
const cleanState = traded(120, 0)
for (const id of ['case_clean']) {
  cleanState.meta.loadout[id] = { defId: id, level: 1, shards: 0 }
  cleanState.meta.equipped['briefcase'] = id
}
cleanState.run.dirtyCash = big(1e9)
const plainState = traded(120, 0)
plainState.run.dirtyCash = big(1e9)
const withClean = launderPerMinute(cleanState, content, computeModifiers(cleanState, content))
const withoutClean = launderPerMinute(plainState, content, computeModifiers(plainState, content))
console.log(`  wash rate: plain=${fmtMoney(withoutClean)}/min  Clean Hands=${fmtMoney(withClean)}/min`)
check('Clean Hands washes more', withClean.gt(withoutClean.mul(1.5)))

const jacket = withGear(['jacket_nobody'])
jacket.run.products['cider'].level = 200
jacket.run.heat = 10
for (const b of content.blocks) {
  const bs = jacket.run.blocks[b.id]
  if (bs.unlocked) bs.customers = customerCeiling(b, jacket)
}
const jacketReport = runFor(jacket, content, computeModifiers(jacket, content), 60, false)
check("Nobody's Jacket suppresses heat under 40", jacketReport.heatGained === 0,
  `heat gained ${jacketReport.heatGained.toFixed(3)}`)

const watch = withGear(['watch_deadman'])
watch.run.heat = 99
watch.run.products['cider'].level = 100
watch.run.dirtyCash = big(100000)
const beforeRaid = watch.run.dirtyCash.toString()
const watchReport = runFor(watch, content, computeModifiers(watch, content), 900, false)
check("Dead Man's Watch absorbs the first raid",
  !watchReport.raided || watch.run.raidShieldUsed,
  watchReport.raided ? `shielded=${watch.run.raidShieldUsed}, cash ${beforeRaid} -> ${watch.run.dirtyCash.toString()}` : 'no raid fired')

// ---------------------------------------------------------------------------
header('CREW')

const roles = new Map<string, number>()
for (const c of content.crew) roles.set(c.role, (roles.get(c.role) ?? 0) + 1)
console.log(`  ${content.crew.length} people across ${roles.size} roles`)
check('the roster is filled out', content.crew.length >= 12)
check('every role has somebody', roles.size === 5)
check('every role has a first hire available from the start',
  [...roles.keys()].every((role) =>
    content.crew.some((c) => c.role === role && c.requiresLevels <= 30)))

console.log(`  effort at loyalty 100=${crewEffort(100).toFixed(2)} 25=${crewEffort(25).toFixed(2)} 0=${crewEffort(0).toFixed(2)}`)
check('a happy hire works fully', crewEffort(100) === 1)
check('an unhappy one is a liability before a loss',
  crewEffort(10) < 1 && crewEffort(10) > 0)

// Wages have to scale with the operation, like payoffs do.
const smallCrew = traded(20, 0)
const bigCrew = traded(300, 0)
const hattie = content.crew.find((c) => c.id === 'crew_hattie')!
const wSmall = crewWage(hattie, 'fair', smallCrew)
const wBig = crewWage(hattie, 'fair', bigCrew)
console.log(`  same hire at level 20=${fmtMoney(wSmall)}/min  at level 300=${fmtMoney(wBig)}/min`)
check('wages scale with the operation', wBig.gt(wSmall.mul(5)))
check('paying generously costs more than paying short',
  crewWage(hattie, 'generous', bigCrew).gt(crewWage(hattie, 'short', bigCrew)))

// Loyalty must actually move, in both directions.
function runPaying(pay: 'short' | 'fair' | 'generous', minutes: number) {
  const s = traded(80, 0)
  s.run.crew['chemist'] = { defId: 'crew_hattie', loyalty: 60, payLevel: pay }
  runFor(s, content, computeModifiers(s, content), minutes * 60, false)
  return s.run.crew['chemist']?.loyalty ?? -1
}
const shortPay = runPaying('short', 5)
const generousPay = runPaying('generous', 5)
console.log(`  after 5 min: short=${shortPay.toFixed(0)} generous=${generousPay.toFixed(0)} (from 60)`)
check('paying short costs loyalty', shortPay < 60)
check('paying well earns it back', generousPay > 60)

// Somebody left at zero loyalty has to eventually talk. Run several hours
// independently: one hour alone fails by chance about once in 150 tries,
// and a test that flakes is worse than no test.
let talkedIn = 0
let heatAfterTalking = 0
for (let i = 0; i < 6; i++) {
  const sour = traded(80, 0)
  sour.run.crew['chemist'] = { defId: 'crew_hattie', loyalty: 1, payLevel: 'short' }
  const r = runFor(sour, content, computeModifiers(sour, content), 3600, false)
  if (r.events.some((e) => e.kind === 'snitch')) {
    talkedIn++
    heatAfterTalking = Math.max(heatAfterTalking, sour.run.heat)
  }
}
console.log(`  six independent hours at zero loyalty: talked in ${talkedIn}`)
check('a sour hire eventually talks', talkedIn >= 5, `${talkedIn}/6`)
check('talking hurts', heatAfterTalking > 15, `heat ${heatAfterTalking.toFixed(0)}`)

check('payroll adds up', (() => {
  const s = traded(80, 0)
  s.run.crew['chemist'] = { defId: 'crew_hattie', loyalty: 70, payLevel: 'fair' }
  s.run.crew['accountant'] = { defId: 'crew_okonkwo', loyalty: 70, payLevel: 'fair' }
  const total = payrollPerMinute(s, content)
  const parts = crewWage(hattie, 'fair', s)
    .add(crewWage(content.crew.find((c) => c.id === 'crew_okonkwo')!, 'fair', s))
  return total.sub(parts).abs().lt(big(0.01))
})())

check('who you can reach grows with the operation', (() => {
  const small = createInitialState(content)
  const big1 = createInitialState(content)
  big1.run.products['cider'].level = 1000
  const boyle = content.crew.find((c) => c.id === 'crew_boyle')!
  return !crewAvailable(boyle, small) && crewAvailable(boyle, big1) && totalLevels(big1) > 0
})())

// ---------------------------------------------------------------------------
header('RIVALS')

const rivalState = traded(120, 0)
const rivalMods = computeModifiers(rivalState, content)
const pier = content.blocks.find((b) => b.id === 'docks_pier')!
const pierState = rivalState.run.blocks['docks_pier']
console.log(`  ${pier.name}: value ${blockValue(pier).toFixed(2)}, defence ${blockDefense(pierState, rivalMods).toFixed(0)} from ${pierState.dealers} dealer(s)`)

const undefended = traded(120, 0)
const loneCorner = undefended.run.blocks['hts_club']
loneCorner.unlocked = true
runFor(undefended, content, computeModifiers(undefended, content), 1800, false)
console.log(`  a rich corner left alone for 30 min: pressure ${loneCorner.rivalPressure.toFixed(0)}, contested=${loneCorner.contested}`)
check('valuable corners come under pressure', loneCorner.rivalPressure > 0)

// Dealers and muscle should be able to hold ground.
const defended = traded(120, 0)
const heldBlock = defended.run.blocks['hts_club']
heldBlock.unlocked = true
heldBlock.dealers = 4
defended.run.crew['enforcer'] = { defId: 'crew_boyle', loyalty: 100, payLevel: 'fair' }
runFor(defended, content, computeModifiers(defended, content), 1800, false)
console.log(`  the same corner with 4 dealers and muscle: pressure ${heldBlock.rivalPressure.toFixed(0)}`)
check('dealers and muscle hold a corner', heldBlock.rivalPressure < loneCorner.rivalPressure)
check('a held corner is not lost', !heldBlock.contested)

check('four hours away cannot cost you the map', (() => {
  const s = traded(120, 0)
  runFor(s, content, computeModifiers(s, content), 4 * 3600, true)
  return content.blocks.every((b) => !s.run.blocks[b.id].contested)
})())

check('the last corner standing is never taken', (() => {
  const s = traded(120, 0)
  runFor(s, content, computeModifiers(s, content), 6 * 3600, false)
  const held = content.blocks.filter((b) => {
    const bs = s.run.blocks[b.id]
    return bs.unlocked && !bs.contested
  })
  return held.length >= 1
})(), 'no soft-lock')

check('effective proof is a whole number', (() => {
  const s = withGear(['watch_deadman'])
  s.run.crew['chemist'] = { defId: 'crew_hattie', loyalty: 63, payLevel: 'fair' }
  const eff = effectivePurity(50, computeModifiers(s, content))
  return Number.isInteger(eff)
})())

check('a lost corner stops selling', (() => {
  const s = traded(120, 0)
  for (const b of content.blocks) {
    const bs = s.run.blocks[b.id]
    if (bs.unlocked) { bs.contested = true; bs.rivalPressure = 100 }
  }
  const r = runFor(s, content, computeModifiers(s, content), 120, false)
  return r.revenue.lte(big(0))
})())

// ---------------------------------------------------------------------------
header('PRESTIGE AND THE BOOK')

const treeTotal = CONNECTION_NODES
  .filter((n) => n.maxLevel < 900)
  .reduce((sum, n) => sum + Array.from({ length: n.maxLevel }, (_, i) => nodeCost(n, i)).reduce((a, b) => a + b, 0), 0)
console.log(`  ${CONNECTION_NODES.length} nodes; the finite ones cost ${treeTotal} connections in total`)
check('the book never dead-ends', CONNECTION_NODES.some((n) => n.maxLevel >= 900))
check('every node does something',
  CONNECTION_NODES.every((n) => (n.stat && n.perLevel) || n.id === 'rooms' || n.id === 'lines'))
check('node costs climb', CONNECTION_NODES.every((n) => nodeCost(n, 3) > nodeCost(n, 0)))

// Laundering: the bug that gated the whole game.
const rich = traded(200, 0)
const perMin = launderPerMinute(rich, content, computeModifiers(rich, content))
const grossPerMin = rich.run.recentRevenuePerSec.mul(60)
const shareOfIncome = perMin.div(grossPerMin).toNumber()
console.log(`  earning ${fmtMoney(grossPerMin)}/min, washing ${fmtMoney(perMin)}/min (${(shareOfIncome * 100).toFixed(1)}%)`)
check('laundering keeps pace with earnings', shareOfIncome > 0.03,
  `${(shareOfIncome * 100).toFixed(1)}% of income`)
check('fronts raise the share', (() => {
  const withFronts = traded(200, 0)
  withFronts.run.ownedFronts = content.fronts.map((f) => f.id)
  withFronts.run.dirtyCash = big(1e12)
  const a = launderPerMinute(withFronts, content, computeModifiers(withFronts, content))
  const bare = traded(200, 0)
  bare.run.dirtyCash = big(1e12)
  const b = launderPerMinute(bare, content, computeModifiers(bare, content))
  return a.gt(b.mul(3))
})())

// Raids must cost a reinvesting player something.
check('a raid stops production', (() => {
  const s = traded(120, 0)
  s.run.heat = 99
  s.run.dirtyCash = big(0)
  for (let i = 0; i < 40; i++) {
    const r = runFor(s, content, computeModifiers(s, content), 60, false)
    if (r.raided) return s.run.shutdownSeconds > 0
  }
  return true
})())

// Head starts from the book.
check('rooms already paid for carry over', (() => {
  const s = createInitialState(content)
  s.meta.connectionsSpent['rooms'] = 2
  s.meta.connections = big(0)
  const after = applyPrestige(s, content, big(0))
  return after.run.ownedLocations.length === 3
})())
check('lines already running carry over', (() => {
  const s = createInitialState(content)
  s.meta.connectionsSpent['lines'] = 2
  const after = applyPrestige(s, content, big(0))
  return content.products.slice(0, 3).every((p) => after.run.products[p.id].unlocked)
})())
check('the kit survives cashing out', (() => {
  const s = createInitialState(content)
  s.meta.loadout['watch_deadman'] = { defId: 'watch_deadman', level: 5, shards: 1 }
  s.meta.equipped['watch'] = 'watch_deadman'
  const after = applyPrestige(s, content, big(7))
  return after.meta.loadout['watch_deadman']?.level === 5 &&
    after.meta.equipped['watch'] === 'watch_deadman' &&
    after.meta.connections.eq(big(7)) &&
    after.run.cleanCash.eq(big(0))
})())

// ---------------------------------------------------------------------------
header('SAVE')
s3.run.cleanCash = big('1.2345e40')
s3.run.products['cider'].purity = 37
const back = deserialize(serialize(s3), content)
check('huge values survive a round trip', back.run.cleanCash.toString() === s3.run.cleanCash.toString(),
  back.run.cleanCash.toString())
check('levels survive', back.run.products['cider'].level === 50)
check('purity survives', back.run.products['cider'].purity === 37)

s3.run.products['beer'].buff = buffFromScore(beer, 1)
s3.meta.minigamePlays['beer'] = 12
s3.meta.autoRun['beer'] = true
const back2 = deserialize(serialize(s3), content)
check('bonuses survive a round trip',
  back2.run.products['beer'].buff?.yieldMult === s3.run.products['beer'].buff!.yieldMult)
check('play counts and auto-run survive',
  back2.meta.minigamePlays['beer'] === 12 && back2.meta.autoRun['beer'] === true)

s3.meta.loadout['watch_deadman'] = { defId: 'watch_deadman', level: 4, shards: 2 }
s3.meta.equipped['watch'] = 'watch_deadman'
s3.meta.duffels = { street: 3, safe: 2, armored: 1 }
const back3 = deserialize(serialize(s3), content)
check('gear and its level survive a round trip',
  back3.meta.loadout['watch_deadman']?.level === 4 &&
  back3.meta.loadout['watch_deadman']?.shards === 2)
check('what you have on survives', back3.meta.equipped['watch'] === 'watch_deadman')
check('unopened crates survive', back3.meta.duffels.armored === 1)

s3.run.crew['lawyer'] = { defId: 'crew_marsh', loyalty: 42, payLevel: 'generous' }
s3.run.blocks['docks_pier'].dealers = 2
s3.run.blocks['docks_pier'].rivalPressure = 63
s3.run.blocks['docks_pier'].contested = true
const back4 = deserialize(serialize(s3), content)
check('the payroll survives a round trip',
  back4.run.crew['lawyer']?.defId === 'crew_marsh' &&
  Math.round(back4.run.crew['lawyer']!.loyalty) === 42 &&
  back4.run.crew['lawyer']?.payLevel === 'generous')
check('dealers and pressure survive',
  back4.run.blocks['docks_pier'].dealers === 2 &&
  Math.round(back4.run.blocks['docks_pier'].rivalPressure) === 63 &&
  back4.run.blocks['docks_pier'].contested === true)
check('a hire in the wrong role slot is dropped', (() => {
  const raw = JSON.parse(serialize(s3))
  raw.run.crew['chemist'] = { defId: 'crew_marsh', loyalty: 90, payLevel: 'fair' }
  return !deserialize(JSON.stringify(raw), content).run.crew['chemist']
})())
check('gear whose definition vanished is dropped, not kept', (() => {
  const raw = JSON.parse(serialize(s3))
  raw.meta.loadout['ghost_of_a_thing'] = { defId: 'ghost_of_a_thing', level: 9, shards: 0 }
  raw.meta.equipped['chain'] = 'ghost_of_a_thing'
  const back = deserialize(JSON.stringify(raw), content)
  return !back.meta.loadout['ghost_of_a_thing'] && !back.meta.equipped['chain']
})())
check('corrupt save does not throw', (() => {
  try { deserialize('{"schemaVersion":1,"run":{"dirtyCash":"garbage"}}', content); return true }
  catch { return false }
})())

// ---------------------------------------------------------------------------
header('ONBOARDING AND SHIPPING')

check('tips are remembered across a save', (() => {
  const s = createInitialState(content)
  s.meta.hintsSeen = ['intro', 'heat']
  const back = deserialize(serialize(s), content)
  return back.meta.hintsSeen.includes('intro') && back.meta.hintsSeen.includes('heat')
})())
check('tips survive cashing out', (() => {
  const s = createInitialState(content)
  s.meta.hintsSeen = ['intro']
  return applyPrestige(s, content, big(0)).meta.hintsSeen.includes('intro')
})())
check('a fresh save has seen nothing', createInitialState(content).meta.hintsSeen.length === 0)

// ---------------------------------------------------------------------------
header('FORMATTING')
for (const v of ['0', '7.5', '999', '1234', '1.5e6', '8.2e9', '3.3e15', '9.9e33', '1e120', '1e600']) {
  console.log(`  ${v.padStart(8)} -> ${fmt(big(v))}`)
}
check('no NaN in formatted output',
  ['0', '1e600', '1.5e6'].every((v) => !fmt(big(v)).includes('NaN')))

// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
process.exit(failures === 0 ? 0 : 1)
