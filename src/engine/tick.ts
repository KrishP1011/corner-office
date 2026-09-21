import { big, type Big, ZERO } from './bignum'
import { BALANCE } from './balance'
import {
  yieldPerCycle, effectivePurity, unitPrice, customerCeiling,
  blockAccepts, isBadBatch, heatBand, heatFromUnits,
  dirtyCap, launderPerMinute,
} from './economy'
import type {
  ContentPack, GameState, Modifiers, StepReport, ProductDef,
} from './types'

function emptyReport(dt: number): StepReport {
  return {
    dtSeconds: dt,
    revenue: ZERO,
    unitsSold: ZERO,
    heatGained: 0,
    laundered: ZERO,
    raided: false,
    raidLoss: ZERO,
    duffelsEarned: 0,
  }
}

/**
 * Advance the simulation by `dt` seconds. Mutates `state`.
 *
 * This is the only place the world moves, and it is deliberately the same
 * code path for foreground ticks and offline catch-up. Two code paths would
 * drift apart and players would find the gap.
 *
 * `dt` must be small enough for the integration to stay honest -- callers go
 * through `runFor`, which chunks anything large.
 */
export function step(
  state: GameState,
  content: ContentPack,
  mods: Modifiers,
  dt: number,
  offline: boolean,
): StepReport {
  const report = emptyReport(dt)
  if (dt <= 0 || !Number.isFinite(dt)) return report

  const run = state.run
  const location = content.locations.find((l) => l.id === run.currentLocation)
  const locationHeatMod = location?.heatMod ?? 0
  const band = heatBand(run.heat)

  // -- 1. Production -------------------------------------------------------
  const productsById = new Map(content.products.map((p) => [p.id, p]))

  for (const def of content.products) {
    const ps = run.products[def.id]
    if (!ps || ps.level <= 0 || !ps.unlocked) continue

    ps.cycleProgress += dt
    const cycles = Math.floor(ps.cycleProgress / def.cycleSeconds)
    if (cycles <= 0) continue

    ps.cycleProgress -= cycles * def.cycleSeconds
    const perCycle = yieldPerCycle(def, ps.level, ps.purity, mods, state.meta.purchased2x)
    ps.inventory = ps.inventory.add(perCycle.mul(big(cycles)))

    // Crates fall out of production, not out of sales -- a player who is
    // stockpiling still gets them.
    const dropChance = BALANCE.DUFFEL_CHANCE_PER_CYCLE * (1 + mods.duffelDropRate)
    const expected = cycles * dropChance
    let drops = Math.floor(expected)
    if (Math.random() < expected - drops) drops += 1
    if (drops > 0) {
      state.meta.duffels.street += drops
      report.duffelsEarned += drops
    }
  }

  // -- 2. Customers and sales ---------------------------------------------
  let heatGained = 0

  for (const bdef of content.blocks) {
    const bs = run.blocks[bdef.id]
    if (!bs || !bs.unlocked) continue

    // Which of this district's wanted goods can actually be supplied.
    const live: ProductDef[] = []
    for (const want of bdef.wants) {
      const ps = run.products[want]
      const pdef = productsById.get(want)
      if (ps && pdef && ps.unlocked && ps.level > 0) live.push(pdef)
    }

    if (live.length === 0) {
      bs.customers = Math.max(0, bs.customers * (1 - BALANCE.CUSTOMER_DECAY_PER_MIN * dt / 60))
      continue
    }

    // A district's opinion is set by the worst thing you are selling it.
    let worstEff = Infinity
    for (const pdef of live) {
      worstEff = Math.min(worstEff, effectivePurity(run.products[pdef.id].purity, mods))
    }

    const ceiling = customerCeiling(bdef, state)
    if (blockAccepts(bdef, worstEff)) {
      const growth = ceiling * BALANCE.CUSTOMER_GROWTH_PER_MIN * (dt / 60)
      bs.customers = Math.min(ceiling, bs.customers + growth)
    } else {
      bs.customers = Math.max(0, bs.customers * (1 - BALANCE.CUSTOMER_DECAY_PER_MIN * dt / 60))
    }

    if (bs.customers <= 0) continue

    // Demand splits evenly across whatever this district will take.
    const totalDemand = bs.customers * BALANCE.DEMAND_PER_CUSTOMER * dt * bs.dealers
    const perProduct = big(totalDemand / live.length)

    for (const pdef of live) {
      const ps = run.products[pdef.id]
      if (ps.inventory.lte(ZERO)) continue

      const sold = ps.inventory.lt(perProduct) ? ps.inventory : perProduct
      if (sold.lte(ZERO)) continue

      ps.inventory = ps.inventory.sub(sold)

      const eff = effectivePurity(ps.purity, mods)
      const gross = sold.mul(unitPrice(pdef, eff, bdef, mods))
      const net = gross.mul(big(1 - band.salesPenalty))

      run.dirtyCash = run.dirtyCash.add(net)
      report.revenue = report.revenue.add(net)
      report.unitsSold = report.unitsSold.add(sold)

      let h = heatFromUnits(sold, pdef, locationHeatMod, mods)
      if (isBadBatch(bdef, eff)) h *= BALANCE.BAD_BATCH_HEAT_MULT
      heatGained += h
    }
  }

  // -- 3. Sitting on a pile is its own kind of evidence --------------------
  const cap = dirtyCap(state, content)
  if (run.dirtyCash.gt(cap)) {
    const over = run.dirtyCash.div(cap).toNumber() - 1
    if (Number.isFinite(over)) {
      heatGained += over * BALANCE.HOARD_HEAT_PER_MIN * (dt / 60)
    }
  }

  // -- 4. Laundering -------------------------------------------------------
  const perMin = launderPerMinute(state, content, mods)
  if (perMin.gt(ZERO)) {
    let moved = perMin.mul(big(dt / 60))
    if (moved.gt(run.dirtyCash)) moved = run.dirtyCash
    run.dirtyCash = run.dirtyCash.sub(moved)
    run.cleanCash = run.cleanCash.add(moved)
    run.cleanEarnedThisRun = run.cleanEarnedThisRun.add(moved)
    report.laundered = moved
  }

  // -- 5. Heat -------------------------------------------------------------
  const decayRate = offline
    ? BALANCE.HEAT_DECAY_PER_MIN_OFFLINE
    : BALANCE.HEAT_DECAY_PER_MIN
  run.heat = run.heat + heatGained - decayRate * (dt / 60)
  run.heat = Math.max(0, Math.min(BALANCE.HEAT_MAX, run.heat))
  report.heatGained = heatGained

  // -- 6. Raids ------------------------------------------------------------
  // Band is re-read post-heat so a step that spikes you into Burned can be
  // punished by that same step.
  run.raidCooldownSeconds = Math.max(0, run.raidCooldownSeconds - dt)

  const nowBand = heatBand(run.heat)
  if (nowBand.raidChancePerMin > 0 && run.raidCooldownSeconds <= 0) {
    const p = 1 - Math.pow(1 - nowBand.raidChancePerMin, dt / 60)
    if (Math.random() < p) {
      applyRaid(state, content, report)
    }
  }

  state.totalPlaySeconds += dt
  return report
}

function applyRaid(state: GameState, content: ContentPack, report: StepReport): void {
  const run = state.run
  report.raided = true

  for (const def of content.products) {
    const ps = run.products[def.id]
    if (!ps) continue
    ps.inventory = ps.inventory.mul(big(1 - BALANCE.RAID_INVENTORY_LOSS))
  }

  const lost = run.dirtyCash.mul(big(BALANCE.RAID_DIRTY_LOSS))
  run.dirtyCash = run.dirtyCash.sub(lost)
  report.raidLoss = lost

  // Getting hit buys you quiet -- and a crate, which is the whole reason
  // running hot is a temptation rather than simply a mistake.
  run.heat = Math.max(0, run.heat - BALANCE.RAID_HEAT_RELIEF)
  run.raidCooldownSeconds = BALANCE.RAID_COOLDOWN_MINUTES * 60
  state.meta.duffels.safe += 1
  report.duffelsEarned += 1
}

/**
 * Run `seconds` of simulation in stable chunks and fold the reports together.
 * Used for foreground catch-up (a throttled background tab) and for offline
 * progress, which are the same problem.
 */
export function runFor(
  state: GameState,
  content: ContentPack,
  mods: Modifiers,
  seconds: number,
  offline: boolean,
): StepReport {
  const total = emptyReport(seconds)
  if (seconds <= 0 || !Number.isFinite(seconds)) return total

  const chunk = offline ? BALANCE.OFFLINE_CHUNK_SECONDS : BALANCE.MAX_STEP_SECONDS
  const chunks = Math.min(Math.ceil(seconds / chunk), BALANCE.OFFLINE_MAX_CHUNKS)
  const dt = seconds / chunks

  for (let i = 0; i < chunks; i++) {
    const r = step(state, content, mods, dt, offline)
    total.revenue = total.revenue.add(r.revenue)
    total.unitsSold = total.unitsSold.add(r.unitsSold)
    total.heatGained += r.heatGained
    total.laundered = total.laundered.add(r.laundered)
    total.duffelsEarned += r.duffelsEarned
    if (r.raided) {
      total.raided = true
      total.raidLoss = total.raidLoss.add(r.raidLoss)
    }
  }

  return total
}

/** Seconds of offline progress to award, after the cap. */
export function cappedOfflineSeconds(elapsedSeconds: number, mods: Modifiers): number {
  const capSeconds = mods.offlineCapHours * 3600
  return Math.max(0, Math.min(elapsedSeconds, capSeconds))
}

export type { StepReport, Big }
