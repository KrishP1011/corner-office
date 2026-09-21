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
import type { GameState } from '../src/engine/types'

const content = loadContent('moonshine')
type Invest = 'none' | 'some' | 'full'

function band(h: number): string {
  return h >= 85 ? 'Hunted' : h >= 60 ? 'Watched' : h >= 30 ? 'Noticed' : 'Quiet'
}

function run(label: string, level: number, purity: number, invest: Invest): number {
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

  if (invest !== 'none') {
    s.run.ownedFronts = content.fronts.slice(0, invest === 'full' ? 4 : 2).map((f) => f.id)
    for (const b of content.blocks) s.run.blocks[b.id].dealers = invest === 'full' ? b.dealerSlots : 2
  }
  if (invest === 'full') {
    for (const id of ['jacket_wool', 'piece_shotgun']) {
      const d = content.items.find((i) => i.id === id)!
      s.meta.loadout[id] = { defId: id, level: 1, shards: 0 }
      s.meta.equipped[d.slot] = id
    }
    s.run.crew['lawyer'] = { defId: 'crew_marsh', loyalty: 100, payLevel: 'fair' }
  }

  const r = runFor(s, content, computeModifiers(s, content), 3600, false)
  console.log(
    `  ${label.padEnd(36)} ${String(Math.round(s.run.heat)).padStart(3)}  ${band(s.run.heat).padEnd(8)} ${fmtMoney(r.revenue).padStart(10)}`
  )
  return s.run.heat
}

console.log('\nAn hour of play. Suspicion should rise with how thin you cut,')
console.log('and fall with what you have built.\n')
console.log('                                       heat  band      earned')

console.log('\nEARLY  (2 lines, level 60)')
const e1 = run('honest, nothing built', 60, 60, 'none')
const e2 = run('watered to 25, nothing built', 60, 25, 'none')
const e3 = run('watered to 12, nothing built', 60, 12, 'none')

console.log('\nMID    (6 lines, level 150)')
const m1 = run('honest, some investment', 150, 60, 'some')
const m2 = run('watered to 25, some investment', 150, 25, 'some')
const m3 = run('watered to 25, nothing built', 150, 25, 'none')

console.log('\nLATE   (6 lines, level 300)')
const l1 = run('honest, fully invested', 300, 60, 'full')
const l2 = run('watered to 25, fully invested', 300, 25, 'full')
const l3 = run('watered to 25, nothing built', 300, 25, 'none')

let bad = 0
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`)
  if (!ok) bad++
}

console.log('\nIS IT A DIAL?')
check(e1 < e2 && e2 < e3, 'early: cutting thinner always costs you quiet')
check(m1 < m2, 'mid: cutting thinner costs you quiet')
check(m2 <= m3, 'mid: investment buys quiet at the same cut')
check(l1 < l2, 'late: cutting thinner costs you quiet')
check(l2 <= l3, 'late: investment buys quiet at the same cut')
check(l1 < 60, 'late: an honest, invested operation is not hunted')
check(e3 > 60 || m3 > 60 || l3 > 60, 'recklessness is still punished somewhere')
check(m1 > 5 || l2 > 5, 'suspicion is not simply absent')

console.log(bad === 0 ? '\nSUSPICION IS A DIAL\n' : `\n${bad} PROPERTY(IES) FAILED\n`)
process.exit(bad === 0 ? 0 : 1)
