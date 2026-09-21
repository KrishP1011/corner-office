/**
 * Suspicion across playstyles.
 *
 * Suspicion is meant to be a dial: quiet when you sell honestly and invest,
 * dangerous when you water product down and do not. It has twice drifted
 * into being neither -- pinned at maximum from mid-game onward, then sitting
 * at zero for a whole playthrough. This is the instrument for checking it is
 * actually a dial.
 *
 *   npx tsx tools/heatcheck.ts
 */
import { loadContent } from '../src/engine/content'
import { createInitialState } from '../src/engine/state'
import { computeModifiers, customerCeiling } from '../src/engine/economy'
import { runFor } from '../src/engine/tick'
import { fmtMoney } from '../src/engine/bignum'
import { BALANCE } from '../src/engine/balance'
import type { GameState } from '../src/engine/types'

const content = loadContent('moonshine')
/**
 * Two different things, deliberately not conflated.
 *
 * `cover` is suppression: fronts, a coat, a piece, a lawyer. It should buy
 * quiet, always.
 *
 * `reach` is expansion: dealers on corners. It raises throughput and
 * switches on lines that were not moving, so it raises exposure even though
 * it also spreads risk. Mixing the two into one "investment" knob made the
 * properties below look broken when they were only badly asked.
 */
interface Setup {
  cover: boolean
  reach: number
}

function band(h: number): string {
  return h >= 85 ? 'Hunted' : h >= 60 ? 'Watched' : h >= 30 ? 'Noticed' : 'Quiet'
}

/**
 * Median of several hours, for the human-readable column.
 *
 * A raid takes 35 off the top and stops production for five minutes, so a
 * single hour's reading swings.
 */
const TRIALS = 5

interface Result {
  /** Where suspicion settles after an hour. Saturates at 100. */
  heat: number
  /** Suspicion generated per minute, less decay. Does not saturate. */
  netRate: number
  revenue: string
}

/**
 * The properties below assert on `netRate`, not on `heat`.
 *
 * Once two scenarios are both pinned at the cap, comparing their heat is
 * comparing noise -- which is exactly how this tool started flaking. The
 * rate is the quantity that actually carries the property, and it is
 * deterministic.
 */
function run(label: string, level: number, purity: number, setup: Setup): Result {
  const runs = Array.from({ length: TRIALS }, () => once(level, purity, setup))
  const heats = runs.map((r) => r.heat).sort((a, b) => a - b)
  const median = heats[Math.floor(TRIALS / 2)]
  const last = runs[runs.length - 1]

  console.log(
    `  ${label.padEnd(36)} ${String(Math.round(median)).padStart(3)}  ${band(median).padEnd(8)}` +
    ` ${(last.netRate >= 0 ? '+' : '') + last.netRate.toFixed(1)}`.padStart(7) +
    ` ${last.revenue.padStart(10)}`
  )
  return { heat: median, netRate: last.netRate, revenue: last.revenue }
}

function once(level: number, purity: number, setup: Setup): Result {
  const s: GameState = createInitialState(content)
  const tiers = level >= 150 ? content.products : content.products.slice(0, 2)
  for (const p of tiers) {
    s.run.products[p.id].unlocked = true
    s.run.products[p.id].level = level
    s.run.products[p.id].purity = purity
  }
  for (const l of content.locations) {
    if (!s.run.ownedLocations.includes(l.id)) s.run.ownedLocations.push(l.id)
  }
  s.run.currentLocation = level >= 150 ? 'island' : 'shack'
  for (const b of content.blocks) {
    const bs = s.run.blocks[b.id]
    bs.unlocked = true
    bs.customers = customerCeiling(b, s)
  }

  for (const b of content.blocks) {
    s.run.blocks[b.id].dealers = Math.min(setup.reach, b.dealerSlots)
  }

  if (setup.cover) {
    s.run.ownedFronts = content.fronts.map((f) => f.id)
    for (const id of ['jacket_wool', 'piece_shotgun']) {
      const d = content.items.find((i) => i.id === id)!
      s.meta.loadout[id] = { defId: id, level: 1, shards: 0 }
      s.meta.equipped[d.slot] = id
    }
    s.run.crew['lawyer'] = { defId: 'crew_marsh', loyalty: 100, payLevel: 'fair' }
  }

  const r = runFor(s, content, computeModifiers(s, content), 3600, false)

  // One more minute, measured on its own, to read generation directly.
  const before = s.run.heat
  s.run.heat = 50 // clear of the cap, so nothing is clipped
  const probe = runFor(s, content, computeModifiers(s, content), 60, false)
  const decay = BALANCE.HEAT_DECAY_PER_MIN * (1 + s.run.ownedFronts.length * BALANCE.FRONT_HEAT_DECAY_BONUS)

  return {
    heat: before,
    netRate: probe.heatGained - decay,
    revenue: fmtMoney(r.revenue),
  }
}

console.log(`\nMedian of ${TRIALS} hours of play. Suspicion should rise with how thin`)
console.log('you cut, and fall with what you have built.\n')
console.log('                                       heat  band     net/min     earned')

const BARE: Setup = { cover: false, reach: 2 }
const COVERED: Setup = { cover: true, reach: 2 }
const WIDE: Setup = { cover: true, reach: 4 }

console.log('\nHOW THIN YOU CUT  (2 lines, level 60, no cover)')
const e1 = run('honest, proof 60', 60, 60, BARE)
const e2 = run('watered to 25', 60, 25, BARE)
const e3 = run('watered to 12', 60, 12, BARE)

console.log('\nWHAT COVER BUYS  (6 lines, level 150, same reach)')
const m1 = run('honest, no cover', 150, 60, BARE)
const m2 = run('honest, covered', 150, 60, COVERED)
const m3 = run('watered to 25, no cover', 150, 25, BARE)
const m4 = run('watered to 25, covered', 150, 25, COVERED)

console.log('\nAT SCALE  (6 lines, level 300)')
const l1 = run('honest, covered', 300, 60, COVERED)
const l2 = run('watered to 25, covered', 300, 25, COVERED)
const l3 = run('honest, covered, full reach', 300, 60, WIDE)

let bad = 0
const check = (ok: boolean, what: string, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? '  ' + detail : ''}`)
  if (!ok) bad++
}

console.log('\nIS IT A DIAL?  (asserted on net rate, which does not saturate)')
check(e1.netRate < e2.netRate && e2.netRate < e3.netRate,
  'cutting thinner always costs you quiet')
check(m2.netRate < m1.netRate, 'cover buys quiet when honest',
  `${m2.netRate.toFixed(1)} vs ${m1.netRate.toFixed(1)}`)
check(m4.netRate < m3.netRate, 'cover buys quiet when watering down',
  `${m4.netRate.toFixed(1)} vs ${m3.netRate.toFixed(1)}`)
check(m3.netRate > m1.netRate, 'at equal cover, cutting thinner is louder')
check(l2.netRate > l1.netRate, 'at scale, cutting thinner is still louder')
check(l1.netRate < 0, 'an honest, covered operation settles quiet')
check(e3.netRate > 0 && m3.netRate > 0, 'recklessness is still punished')
// Measured, not assumed. Once every line is already moving, extra dealers
// only spread the same volume across more hands, so reaching wider is
// rewarded rather than punished.
check(l3.netRate <= l1.netRate,
  'spreading across more corners never costs you quiet',
  `${l3.netRate.toFixed(1)} vs ${l1.netRate.toFixed(1)}`)

console.log(bad === 0 ? '\nSUSPICION IS A DIAL\n' : `\n${bad} PROPERTY(IES) FAILED\n`)
process.exit(bad === 0 ? 0 : 1)
