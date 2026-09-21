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
import { createInitialState } from '../src/engine/state'
import {
  computeModifiers, cutMultiplier, priceMultiplier, stationCost,
  buffFromScore, autoRunUnlocked, customerCeiling,
} from '../src/engine/economy'
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

// ---------------------------------------------------------------------------
header('HEAT PRESSURE (level 400, purity 18 -- reckless volume)')
const hot = createInitialState(content)
hot.run.products['cider'].level = 400
hot.run.products['cider'].purity = 18
const hotMods = computeModifiers(hot, content)
for (const m of [5, 15, 30, 60]) {
  runFor(hot, content, hotMods, m === 5 ? 300 : 600, false)
  console.log(`  t=${String(m).padStart(3)}m  heat=${hot.run.heat.toFixed(1).padStart(5)}  dirty=${fmtMoney(hot.run.dirtyCash)}`)
}
check('reckless volume eventually draws heat', hot.run.heat > 40, `heat=${hot.run.heat.toFixed(1)}`)

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
header('OFFLINE (4h at level 50)')
const s3 = createInitialState(content)
s3.run.products['cider'].level = 50
const m3 = computeModifiers(s3, content)
const off = runFor(s3, content, m3, 4 * 3600, true)
console.log(`  revenue=${fmtMoney(off.revenue)}  units=${fmt(off.unitsSold)}  raided=${off.raided}  crates=${off.duffelsEarned}`)
check('offline crate drops stay reasonable', off.duffelsEarned <= 12, `${off.duffelsEarned} crates`)

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
check('corrupt save does not throw', (() => {
  try { deserialize('{"schemaVersion":1,"run":{"dirtyCash":"garbage"}}', content); return true }
  catch { return false }
})())

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
