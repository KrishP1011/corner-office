import { big, type Big, ZERO } from './bignum'
import { BALANCE } from './balance'
import {
  yieldPerCycle, effectivePurity, unitPrice, customerCeiling,
  blockAccepts, isBadBatch, heatBand, heatFromUnits,
  dirtyCap, launderPerMinute, buffFromScore, autoRunUnlocked,
  crewWage, blockValue, blockDefense,
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
    heatByProduct: {},
    unitsByProduct: {},
    events: [],
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

  // -- 0. Minigame bonuses -------------------------------------------------
  for (const def of content.products) {
    const ps = run.products[def.id]
    if (!ps) continue

    if (ps.buff) {
      ps.buff.remaining -= dt
      if (ps.buff.remaining <= 0) ps.buff = null
    }

    // Auto-run keeps a weaker bonus topped up so long grinds are optional.
    if (state.meta.autoRun[def.id] && autoRunUnlocked(state, def.id)) {
      const auto = buffFromScore(def, BALANCE.AUTO_STRENGTH)
      if (!ps.buff || ps.buff.yieldMult < auto.yieldMult || ps.buff.remaining < auto.remaining / 2) {
        ps.buff = auto
      }
    }
  }

  // -- 1. Production -------------------------------------------------------
  const productsById = new Map(content.products.map((p) => [p.id, p]))

  for (const def of content.products) {
    const ps = run.products[def.id]
    if (!ps || ps.level <= 0 || !ps.unlocked) continue

    ps.cycleProgress += dt
    const cycles = Math.floor(ps.cycleProgress / def.cycleSeconds)
    if (cycles <= 0) continue

    ps.cycleProgress -= cycles * def.cycleSeconds
    const perCycle = yieldPerCycle(def, ps.level, ps.purity, mods, state.meta.purchased2x, ps.buff)
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
      report.events.push({ kind: 'crate', tone: 'good', value: drops })
    }
  }

  // -- 2. Customers and sales ---------------------------------------------
  let heatGained = 0
  const badBatches = new Set<string>()
  const unpaid = new Set<string>()

  // Nothing Personal: whichever district is carrying you does not churn.
  let protectedBlock: string | null = null
  if (mods.uniques.has('nothing_personal')) {
    let best = -1
    for (const b of content.blocks) {
      const bs = run.blocks[b.id]
      if (bs?.unlocked && bs.customers > best) {
        best = bs.customers
        protectedBlock = b.id
      }
    }
  }

  for (const bdef of content.blocks) {
    const bs = run.blocks[bdef.id]
    if (!bs || !bs.unlocked) continue

    // -- Rivals. Somebody else always wants the good corners. --------------
    const immune = bdef.id === protectedBlock
    if (!immune) {
      const pressure =
        blockValue(bdef) * BALANCE.RIVAL_PRESSURE_PER_MIN - blockDefense(bs, mods)
      bs.rivalPressure = Math.max(
        0,
        Math.min(BALANCE.RIVAL_PRESSURE_MAX, bs.rivalPressure + pressure * (dt / 60)),
      )

      if (bs.rivalPressure >= BALANCE.RIVAL_PRESSURE_MAX && !bs.contested) {
        // Two things a corner can never be lost to.
        //
        // Offline: you are not there to defend it. Pressure still builds, so
        // you come back to a crisis you can act on rather than to an empty
        // map -- four hours away was enough to lose all twelve.
        //
        // The last one standing: with every district gone there are no
        // sales, with no sales there is no loose cash, and retaking costs
        // loose cash. That is a soft-lock, not a difficulty curve.
        const lastStanding = countHeld(run, content) <= 1

        if (offline || lastStanding) {
          bs.rivalPressure = BALANCE.RIVAL_PRESSURE_MAX - 0.01
        } else {
          bs.contested = true
          report.events.push({ kind: 'blockLost', tone: 'bad', subject: bdef.id })
        }
      }
    } else if (bs.contested) {
      // Nothing Personal does not just hold the corner, it takes it back.
      bs.contested = false
      bs.rivalPressure = 0
    }

    if (bs.contested) {
      bs.customers = Math.max(0, bs.customers * (1 - BALANCE.CUSTOMER_DECAY_PER_MIN * dt / 60))
      continue
    }

    // Which of this district's wanted goods can actually be supplied.
    const live: ProductDef[] = []
    for (const want of bdef.wants) {
      const ps = run.products[want]
      const pdef = productsById.get(want)
      if (ps && pdef && ps.unlocked && ps.level > 0) live.push(pdef)
    }

    if (live.length === 0) {
      if (bdef.id !== protectedBlock) {
        bs.customers = Math.max(0, bs.customers * (1 - BALANCE.CUSTOMER_DECAY_PER_MIN * dt / 60))
      }
      continue
    }

    // A district's opinion is set by the worst thing you are selling it.
    let worstEff = Infinity
    for (const pdef of live) {
      const ps = run.products[pdef.id]
      worstEff = Math.min(worstEff, effectivePurity(ps.purity, mods, ps.buff))
    }

    const ceiling = customerCeiling(bdef, state, mods)
    if (blockAccepts(bdef, worstEff)) {
      const growth = ceiling * BALANCE.CUSTOMER_GROWTH_PER_MIN * (dt / 60)
      bs.customers = Math.min(ceiling, bs.customers + growth)
    } else if (bdef.id !== protectedBlock) {
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

      const eff = effectivePurity(ps.purity, mods, ps.buff)
      const gross = sold.mul(unitPrice(pdef, eff, bdef, mods))
      const net = gross.mul(big(1 - band.salesPenalty))

      run.dirtyCash = run.dirtyCash.add(net)
      report.revenue = report.revenue.add(net)
      report.unitsSold = report.unitsSold.add(sold)

      let h = heatFromUnits(sold, pdef, locationHeatMod, mods, ps.buff)
      if (isBadBatch(bdef, eff)) {
        h *= BALANCE.BAD_BATCH_HEAT_MULT
        badBatches.add(pdef.id)
      }
      heatGained += h

      report.heatByProduct[pdef.id] = (report.heatByProduct[pdef.id] ?? 0) + h
      report.unitsByProduct[pdef.id] = (report.unitsByProduct[pdef.id] ?? ZERO).add(sold)
    }
  }

  // Smoothed with a time-normalised half-life, so the result does not depend
  // on how the caller happened to chunk `dt`. Asymmetric on purpose: it rises
  // quickly but falls slowly, so a player cannot crash their own sales for a
  // moment to make a payoff cheap and then resume.
  const instantRate = report.revenue.div(big(dt))
  const tau = instantRate.gt(run.recentRevenuePerSec)
    ? BALANCE.INCOME_RISE_TAU
    : BALANCE.INCOME_FALL_TAU
  const alpha = 1 - Math.exp(-dt / tau)
  run.recentRevenuePerSec = run.recentRevenuePerSec
    .mul(big(1 - alpha))
    .add(instantRate.mul(big(alpha)))

  // -- 2b. Payroll ---------------------------------------------------------
  const crewById = new Map(content.crew.map((c) => [c.id, c]))
  for (const role of Object.keys(run.crew) as (keyof typeof run.crew)[]) {
    const hired = run.crew[role]
    if (!hired) continue
    const def = crewById.get(hired.defId)
    if (!def) { delete run.crew[role]; continue }

    const owed = crewWage(def, hired.payLevel, state).mul(big(dt / 60))

    if (run.dirtyCash.gte(owed)) {
      run.dirtyCash = run.dirtyCash.sub(owed)
      hired.loyalty += (BALANCE.PAY_LOYALTY[hired.payLevel] ?? 0) * (dt / 60)
    } else {
      // Missing payroll outright is far worse than paying short.
      run.dirtyCash = ZERO
      hired.loyalty += BALANCE.UNPAID_LOYALTY_PER_MIN * (dt / 60)
      unpaid.add(def.id)
    }

    hired.loyalty = Math.max(0, Math.min(100, hired.loyalty))

    if (hired.loyalty < BALANCE.SNITCH_THRESHOLD) {
      const severity = 1 - hired.loyalty / BALANCE.SNITCH_THRESHOLD
      const perMin = BALANCE.SNITCH_CHANCE_AT_ZERO * severity
      const p = 1 - Math.pow(1 - perMin, dt / 60)
      if (Math.random() < p) {
        delete run.crew[role]
        run.heat = Math.min(BALANCE.HEAT_MAX, run.heat + BALANCE.SNITCH_HEAT)
        report.events.push({ kind: 'snitch', tone: 'bad', subject: def.id })
      }
    }
  }

  for (const id of unpaid) {
    report.events.push({ kind: 'unpaid', tone: 'bad', subject: id })
  }

  // -- 3. Sitting on a pile is its own kind of evidence --------------------
  const cap = dirtyCap(state, content)
  if (run.dirtyCash.gt(cap)) {
    const over = run.dirtyCash.div(cap).toNumber() - 1
    if (Number.isFinite(over)) {
      heatGained += over * BALANCE.HOARD_HEAT_PER_MIN * (dt / 60)
    }
  }

  // Nobody's Jacket: under 40 you simply do not register.
  if (mods.uniques.has('nobodys_jacket') && run.heat < 40) {
    heatGained = 0
    for (const id of Object.keys(report.heatByProduct)) report.heatByProduct[id] = 0
  }
  // Dead Stock: the crew works quietly while you are gone.
  if (offline && mods.uniques.has('dead_stock')) {
    heatGained = 0
    for (const id of Object.keys(report.heatByProduct)) report.heatByProduct[id] = 0
  }

  for (const id of badBatches) {
    report.events.push({ kind: 'badBatch', tone: 'bad', subject: id })
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
  let decayRate = offline
    ? BALANCE.HEAT_DECAY_PER_MIN_OFFLINE
    : BALANCE.HEAT_DECAY_PER_MIN
  if (offline && mods.uniques.has('ghost_line')) decayRate *= 2
  run.heat = run.heat + heatGained - decayRate * (dt / 60)
  run.heat = Math.max(0, Math.min(BALANCE.HEAT_MAX, run.heat))
  report.heatGained = heatGained

  // -- 6. Raids ------------------------------------------------------------
  // Band is re-read post-heat so a step that spikes you into Burned can be
  // punished by that same step.
  run.raidCooldownSeconds = Math.max(0, run.raidCooldownSeconds - dt)

  const nowBand = heatBand(run.heat)
  if (nowBand.band !== run.lastBand) {
    const order = ['cold', 'warm', 'hot', 'burned']
    const rising = order.indexOf(nowBand.band) > order.indexOf(run.lastBand)
    report.events.push({
      kind: rising ? 'bandUp' : 'bandDown',
      tone: rising ? 'bad' : 'good',
      subject: nowBand.band,
    })
    run.lastBand = nowBand.band
  }

  if (nowBand.raidChancePerMin > 0 && run.raidCooldownSeconds <= 0) {
    const p = 1 - Math.pow(1 - nowBand.raidChancePerMin, dt / 60)
    if (Math.random() < p) {
      applyRaid(state, content, report, mods)
    }
  }

  state.totalPlaySeconds += dt
  return report
}

/** Districts still under your control. */
function countHeld(run: GameState['run'], content: ContentPack): number {
  let n = 0
  for (const b of content.blocks) {
    const bs = run.blocks[b.id]
    if (bs?.unlocked && !bs.contested) n++
  }
  return n
}

function applyRaid(
  state: GameState, content: ContentPack, report: StepReport, mods: Modifiers,
): void {
  const run = state.run
  report.raided = true

  // Dead Man's Watch: they turn the place over and find nothing, once.
  if (mods.uniques.has('deadmans_watch') && !run.raidShieldUsed) {
    run.raidShieldUsed = true
    run.heat = Math.max(0, run.heat - BALANCE.RAID_HEAT_RELIEF)
    run.raidCooldownSeconds = BALANCE.RAID_COOLDOWN_MINUTES * 60
    state.meta.duffels.safe += 1
    report.duffelsEarned += 1
    report.events.push({ kind: 'raidShielded', tone: 'good' })
    return
  }

  const cover = 1 - mods.raidShield

  for (const def of content.products) {
    const ps = run.products[def.id]
    if (!ps) continue
    ps.inventory = ps.inventory.mul(big(1 - BALANCE.RAID_INVENTORY_LOSS * cover))
  }

  const lost = run.dirtyCash.mul(big(BALANCE.RAID_DIRTY_LOSS * cover))
  run.dirtyCash = run.dirtyCash.sub(lost)
  report.raidLoss = lost

  // Getting hit buys you quiet -- and a crate, which is the whole reason
  // running hot is a temptation rather than simply a mistake.
  run.heat = Math.max(0, run.heat - BALANCE.RAID_HEAT_RELIEF)
  run.raidCooldownSeconds = BALANCE.RAID_COOLDOWN_MINUTES * 60
  state.meta.duffels.safe += 1
  report.duffelsEarned += 1
  report.events.push({ kind: 'raid', tone: 'bad', amount: lost })
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
    total.events.push(...r.events)

    for (const [id, h] of Object.entries(r.heatByProduct)) {
      total.heatByProduct[id] = (total.heatByProduct[id] ?? 0) + h
    }
    for (const [id, u] of Object.entries(r.unitsByProduct)) {
      total.unitsByProduct[id] = (total.unitsByProduct[id] ?? ZERO).add(u)
    }
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
