import { big, fmtMoney, type Big, ZERO } from './bignum'
import { BALANCE, DUFFEL_ODDS, shardsForLevel } from './balance'
import { loadContent, DEFAULT_THEME } from './content'
import {
  computeModifiers, stationCost, stationCostBulk, affordableLevels,
  canPrestige, prestigePayout, prestigeRequirement,
  buffFromScore, autoRunUnlocked, bribeCost,
  crewAvailable, crewWage, payrollPerMinute, secondsOfIncome, totalLevels,
} from './economy'
import { createInitialState, applyPrestige, refreshBlockUnlocks } from './state'
import { runFor, cappedOfflineSeconds } from './tick'
import { loadFromStorage, saveToStorage, clearStorage, exportSave, importSave } from './save'
import type {
  ContentPack, GameState, Modifiers, StepReport, ItemSlot,
  GameEvent, EventDraft, DuffelTier, OpenResult, Rarity, ItemDef,
  CrewRole, PayLevel, CrewDef,
} from './types'

const RARITY_ORDER: Rarity[] = ['street', 'solid', 'connected', 'made', 'untouchable']

/** Any elapsed gap longer than this is treated as time away, not a hitch. */
const OFFLINE_THRESHOLD_SECONDS = 10

const BAND_NAMES: Record<string, string> = {
  cold: 'Quiet',
  warm: 'Noticed',
  hot: 'Watched',
  burned: 'Hunted',
}

export interface OfflineSummary {
  seconds: number
  cappedAt: number
  report: StepReport
}

type Listener = () => void

/**
 * Owns the world. Nothing in the UI mutates state directly -- React calls
 * commands on this object, and reads a snapshot the store publishes at a
 * fixed rate. DESIGN.md section "the one architectural decision that
 * matters": the simulation does not live in React.
 */
export class Engine {
  state: GameState
  content: ContentPack
  mods: Modifiers

  /** Set on boot when time had passed since the last save. */
  offlineSummary: OfflineSummary | null = null
  /** The most recent step, so the UI can show per-second rates. */
  lastReport: StepReport | null = null
  /**
   * Recent notable events, newest first. Session-only: they exist to make
   * the world legible while playing, not to be persisted.
   */
  events: GameEvent[] = []

  private nextEventId = 1

  private listeners = new Set<Listener>()
  private intervalHandle: ReturnType<typeof setInterval> | null = null
  private lastUiPush = 0
  private sinceSave = 0
  private running = false

  constructor(themeId: string = DEFAULT_THEME) {
    this.content = loadContent(themeId)
    const loaded = loadFromStorage(this.content)
    this.state = loaded ?? createInitialState(this.content)
    this.mods = computeModifiers(this.state, this.content)

    if (loaded) this.applyOfflineProgress()
  }

  // -- Lifecycle -----------------------------------------------------------

  private applyOfflineProgress(): void {
    const elapsed = (Date.now() - this.state.lastTickAt) / 1000
    if (elapsed < OFFLINE_THRESHOLD_SECONDS) {
      this.state.lastTickAt = Date.now()
      return
    }

    const granted = cappedOfflineSeconds(elapsed, this.mods)
    const report = runFor(this.state, this.content, this.mods, granted, true)

    this.record(report.events)
    this.offlineSummary = {
      seconds: elapsed,
      cappedAt: this.mods.offlineCapHours * 3600,
      report,
    }
    this.state.lastTickAt = Date.now()
  }

  start(): void {
    if (this.running) return
    this.running = true

    // setInterval is throttled hard in background tabs, which is fine: the
    // loop derives dt from the wall clock, so a slow timer produces fewer,
    // larger steps rather than lost time.
    this.intervalHandle = setInterval(() => this.loop(), BALANCE.TICK_MS)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') this.loop()
      else this.save()
    }
    const onPageHide = () => this.save()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)

    this.cleanupListeners = () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }

  private cleanupListeners: (() => void) | null = null

  stop(): void {
    this.running = false
    if (this.intervalHandle !== null) clearInterval(this.intervalHandle)
    this.intervalHandle = null
    this.cleanupListeners?.()
    this.cleanupListeners = null
    this.save()
  }

  private loop(): void {
    const now = Date.now()
    const elapsed = (now - this.state.lastTickAt) / 1000
    this.state.lastTickAt = now
    if (elapsed <= 0) return

    this.mods = computeModifiers(this.state, this.content)

    // A long gap with the tab still open is time away like any other -- it
    // gets the offline cap, so parking a tab is not a way around it.
    if (elapsed > OFFLINE_THRESHOLD_SECONDS) {
      const granted = cappedOfflineSeconds(elapsed, this.mods)
      this.lastReport = runFor(this.state, this.content, this.mods, granted, true)
    } else {
      this.lastReport = runFor(this.state, this.content, this.mods, elapsed, false)
    }
    this.record(this.lastReport.events)
    this.refreshCrewRoster()

    this.sinceSave += elapsed
    if (this.sinceSave >= BALANCE.SAVE_INTERVAL_SECONDS) {
      this.sinceSave = 0
      this.save()
    }

    const uiInterval = 1000 / BALANCE.UI_HZ
    if (now - this.lastUiPush >= uiInterval) {
      this.lastUiPush = now
      this.notify()
    }
  }

  /** Turn sim drafts into displayable events. The Engine owns the wording. */
  private record(drafts: EventDraft[]): void {
    if (drafts.length === 0) return

    for (const d of drafts) {
      const text = this.describe(d)
      if (!text) continue
      this.events.unshift({
        id: this.nextEventId++,
        kind: d.kind,
        tone: d.tone,
        at: Date.now(),
        text,
      })
    }

    // Ring buffer. Nothing reads further back than this.
    if (this.events.length > 60) this.events.length = 60
  }

  private describe(d: EventDraft): string | null {
    const s = this.content.strings
    const productName = (id?: string) =>
      this.content.products.find((p) => p.id === id)?.name ?? 'a line'
    const crewName = (id?: string) =>
      this.content.crew.find((c) => c.id === id)?.name ?? 'Somebody'
    const blockName = (id?: string) =>
      this.content.blocks.find((b) => b.id === id)?.name ?? 'A corner'

    switch (d.kind) {
      case 'raid':
        return `Raided. They took ${fmtMoney(d.amount ?? ZERO)} and a third of the stock.`
      case 'raidShielded':
        return 'They turned the place over and found nothing. You knew they were coming.'
      case 'badBatch':
        return `${productName(d.subject)} is going out too weak. People are getting hurt, and it shows.`
      case 'bandUp':
        return `${s.lawLabel} are paying attention. ${BAND_NAMES[d.subject ?? 'warm']}.`
      case 'bandDown':
        return `Things have quieted down. ${BAND_NAMES[d.subject ?? 'cold']}.`
      case 'crate':
        return d.value && d.value > 1
          ? `Found ${d.value} ${s.chestLabel.toLowerCase()}s tucked in the stock.`
          : `Found a ${s.chestLabel.toLowerCase()} tucked in the stock.`
      case 'snitch':
        return `${crewName(d.subject)} talked. Everything they knew, the ${s.lawLabel.toLowerCase()} know now.`
      case 'unpaid':
        return `${crewName(d.subject)} did not get paid. People remember that.`
      case 'crewAvailable':
        return `${crewName(d.subject)} will take your call now.`
      case 'blockLost':
        return `${blockName(d.subject)} is somebody else's corner now.`
      case 'blockHeld':
        return `${blockName(d.subject)} is yours again. It will not stay that way on its own.`
      case 'bribe':
        return `Paid off the sheriff. ${fmtMoney(d.amount ?? ZERO)} out of the loose cash.`
      default:
        return null
    }
  }

  clearEvents(): void {
    this.events = []
    this.notify()
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Publish to the UI immediately. Called after every command. */
  notify(): void {
    for (const fn of this.listeners) fn()
  }

  save(): void {
    saveToStorage(this.state)
  }

  // -- Commands ------------------------------------------------------------

  setPurity(productId: string, purity: number): void {
    const ps = this.state.run.products[productId]
    if (!ps) return
    ps.purity = Math.max(BALANCE.PURITY_MIN, Math.min(BALANCE.PURITY_MAX, Math.round(purity)))
    this.notify()
  }

  /** Unlock a product line with clean cash. */
  unlockProduct(productId: string): boolean {
    const def = this.content.products.find((p) => p.id === productId)
    const ps = this.state.run.products[productId]
    if (!def || !ps || ps.unlocked) return false
    if (!this.state.run.ownedLocations.includes(def.requiresLocation)) return false

    const cost = big(def.unlockCost)
    if (this.state.run.cleanCash.lt(cost)) return false

    this.state.run.cleanCash = this.state.run.cleanCash.sub(cost)
    ps.unlocked = true
    if (ps.level === 0) ps.level = 1
    refreshBlockUnlocks(this.state, this.content)
    this.notify()
    return true
  }

  /** Buy `count` station levels with dirty cash. `count` of -1 means "max". */
  upgradeStation(productId: string, count: number): boolean {
    const def = this.content.products.find((p) => p.id === productId)
    const ps = this.state.run.products[productId]
    if (!def || !ps || !ps.unlocked) return false

    const activeLines = this.content.products.filter(
      (p) => (this.state.run.products[p.id]?.level ?? 0) > 0,
    ).length
    const location = this.content.locations.find((l) => l.id === this.state.run.currentLocation)
    if (ps.level === 0 && location && activeLines >= location.stationSlots) return false

    const n = count === -1
      ? affordableLevels(def, ps.level, this.state.run.dirtyCash)
      : count
    if (n <= 0) return false

    const cost = stationCostBulk(def, ps.level, n)
    if (this.state.run.dirtyCash.lt(cost)) return false

    this.state.run.dirtyCash = this.state.run.dirtyCash.sub(cost)
    ps.level += n
    this.notify()
    return true
  }

  buyLocation(locationId: string): boolean {
    const def = this.content.locations.find((l) => l.id === locationId)
    if (!def || this.state.run.ownedLocations.includes(locationId)) return false

    const cost = big(def.cost)
    if (this.state.run.cleanCash.lt(cost)) return false

    this.state.run.cleanCash = this.state.run.cleanCash.sub(cost)
    this.state.run.ownedLocations.push(locationId)
    this.state.run.currentLocation = locationId
    this.notify()
    return true
  }

  setLocation(locationId: string): boolean {
    if (!this.state.run.ownedLocations.includes(locationId)) return false
    this.state.run.currentLocation = locationId
    this.notify()
    return true
  }

  buyFront(frontId: string): boolean {
    const def = this.content.fronts.find((f) => f.id === frontId)
    if (!def || this.state.run.ownedFronts.includes(frontId)) return false

    const cost = big(def.cost)
    if (this.state.run.cleanCash.lt(cost)) return false

    this.state.run.cleanCash = this.state.run.cleanCash.sub(cost)
    this.state.run.ownedFronts.push(frontId)
    this.notify()
    return true
  }

  /**
   * Record a finished minigame. `score` is 0..1; anything at or below the
   * floor still grants a sliver, so a bad run is never worse than skipping.
   */
  completeMinigame(productId: string, score: number): boolean {
    const def = this.content.products.find((p) => p.id === productId)
    const ps = this.state.run.products[productId]
    if (!def || !ps || !ps.unlocked || def.minigame === 'none') return false

    const earned = buffFromScore(def, score)

    // Never downgrade a bonus the player already has running.
    if (!ps.buff || earned.yieldMult >= ps.buff.yieldMult) {
      ps.buff = earned
    } else {
      ps.buff.remaining = Math.max(ps.buff.remaining, earned.remaining)
    }

    this.state.meta.minigamePlays[productId] =
      (this.state.meta.minigamePlays[productId] ?? 0) + 1

    this.save()
    this.notify()
    return true
  }

  toggleAutoRun(productId: string): boolean {
    if (!autoRunUnlocked(this.state, productId)) return false
    const on = this.state.meta.autoRun[productId] === true
    if (on) delete this.state.meta.autoRun[productId]
    else this.state.meta.autoRun[productId] = true
    this.notify()
    return true
  }

  bribeCost(): Big {
    return bribeCost(this.state, this.content)
  }

  /** Pay off the law. Dirty cash only -- this is not a bookkeeping expense. */
  bribe(): boolean {
    const cost = this.bribeCost()
    if (this.state.run.dirtyCash.lt(cost)) return false
    if (this.state.run.heat <= 0) return false

    this.state.run.dirtyCash = this.state.run.dirtyCash.sub(cost)
    this.state.run.heat = Math.max(0, this.state.run.heat - BALANCE.BRIBE_HEAT_RELIEF)
    this.state.run.bribesThisRun += 1

    this.record([{ kind: 'bribe', tone: 'neutral', amount: cost }])
    this.save()
    this.notify()
    return true
  }

  // -- Crew ----------------------------------------------------------------

  /**
   * People you have met. Once someone is willing to work for you they stay
   * on the list through a prestige -- DESIGN.md section 11 keeps the roster
   * and wipes only the loyalty.
   */
  private refreshCrewRoster(): void {
    for (const def of this.content.crew) {
      if (this.state.meta.unlockedCrew.includes(def.id)) continue
      if (crewAvailable(def, this.state)) {
        this.state.meta.unlockedCrew.push(def.id)
        this.record([{ kind: 'crewAvailable', tone: 'good', subject: def.id }])
      }
    }
  }

  crewKnown(def: CrewDef): boolean {
    return this.state.meta.unlockedCrew.includes(def.id) || crewAvailable(def, this.state)
  }

  hireCrew(defId: string): boolean {
    const def = this.content.crew.find((c) => c.id === defId)
    if (!def || !this.crewKnown(def)) return false
    if (this.state.run.crew[def.role]) return false

    const cost = big(def.hireCost)
    if (this.state.run.cleanCash.lt(cost)) return false

    this.state.run.cleanCash = this.state.run.cleanCash.sub(cost)
    this.state.run.crew[def.role] = {
      defId: def.id,
      loyalty: BALANCE.CREW_START_LOYALTY,
      payLevel: 'fair',
    }

    this.mods = computeModifiers(this.state, this.content)
    this.save()
    this.notify()
    return true
  }

  /** Letting someone go is free, and safer than letting them go sour. */
  fireCrew(role: CrewRole): boolean {
    if (!this.state.run.crew[role]) return false
    delete this.state.run.crew[role]
    this.mods = computeModifiers(this.state, this.content)
    this.save()
    this.notify()
    return true
  }

  setPayLevel(role: CrewRole, level: PayLevel): boolean {
    const hired = this.state.run.crew[role]
    if (!hired) return false
    hired.payLevel = level
    this.notify()
    return true
  }

  crewWage(defId: string, payLevel: PayLevel): Big {
    const def = this.content.crew.find((c) => c.id === defId)
    if (!def) return ZERO
    return crewWage(def, payLevel, this.state)
  }

  payroll(): Big {
    return payrollPerMinute(this.state, this.content)
  }

  totalLevels(): number {
    return totalLevels(this.state)
  }

  // -- Territory -----------------------------------------------------------

  dealerCost(): Big {
    return secondsOfIncome(this.state, BALANCE.DEALER_COST_SECONDS)
  }

  retakeCost(): Big {
    return secondsOfIncome(this.state, BALANCE.RETAKE_COST_SECONDS)
  }

  /** Put another dealer on a corner. More throughput, and more muscle. */
  addDealer(blockId: string): boolean {
    const def = this.content.blocks.find((b) => b.id === blockId)
    const bs = this.state.run.blocks[blockId]
    if (!def || !bs || !bs.unlocked || bs.contested) return false
    if (bs.dealers >= def.dealerSlots) return false

    const cost = this.dealerCost()
    if (this.state.run.dirtyCash.lt(cost)) return false

    this.state.run.dirtyCash = this.state.run.dirtyCash.sub(cost)
    bs.dealers += 1
    this.save()
    this.notify()
    return true
  }

  /** Take a corner back. Expensive, and it does not stay taken by itself. */
  retakeBlock(blockId: string): boolean {
    const bs = this.state.run.blocks[blockId]
    if (!bs || !bs.contested) return false

    const cost = this.retakeCost()
    if (this.state.run.dirtyCash.lt(cost)) return false

    this.state.run.dirtyCash = this.state.run.dirtyCash.sub(cost)
    bs.contested = false
    // Taken back, but only just -- it is immediately under pressure again.
    bs.rivalPressure = BALANCE.RIVAL_PRESSURE_MAX * 0.5
    this.record([{ kind: 'blockHeld', tone: 'good', subject: blockId }])
    this.save()
    this.notify()
    return true
  }

  // -- Crates --------------------------------------------------------------

  /**
   * Open one crate.
   *
   * Rolls a rarity from the tier's table, then a piece of that rarity. A
   * duplicate feeds levels instead of being wasted, and an empty slot is
   * filled automatically so a new player sees the effect without having to
   * find the equip screen first.
   */
  openDuffel(tier: DuffelTier): OpenResult | null {
    if (this.state.meta.duffels[tier] <= 0) return null

    const item = this.rollItem(tier)
    if (!item) return null

    this.state.meta.duffels[tier] -= 1

    const existing = this.state.meta.loadout[item.id]
    let isNew = false
    let leveledUp = false

    if (!existing) {
      this.state.meta.loadout[item.id] = { defId: item.id, level: 1, shards: 0 }
      isNew = true
    } else {
      existing.shards += 1
      while (
        existing.level < BALANCE.MAX_ITEM_LEVEL &&
        existing.shards >= shardsForLevel(existing.level)
      ) {
        existing.shards -= shardsForLevel(existing.level)
        existing.level += 1
        leveledUp = true
      }
    }

    const owned = this.state.meta.loadout[item.id]

    let autoEquipped = false
    if (!this.state.meta.equipped[item.slot]) {
      this.state.meta.equipped[item.slot] = item.id
      autoEquipped = true
    }

    this.mods = computeModifiers(this.state, this.content)
    this.save()
    this.notify()

    return {
      tier,
      item,
      isNew,
      level: owned.level,
      leveledUp,
      shards: owned.shards,
      shardsForNext: owned.level >= BALANCE.MAX_ITEM_LEVEL ? 0 : shardsForLevel(owned.level),
      autoEquipped,
    }
  }

  /** Weighted rarity roll, then a uniform pick within that rarity. */
  private rollItem(tier: DuffelTier): ItemDef | null {
    const odds = DUFFEL_ODDS[tier]

    let roll = Math.random()
    let chosen: Rarity = 'street'
    for (const r of RARITY_ORDER) {
      const weight = odds[r]
      if (roll < weight) { chosen = r; break }
      roll -= weight
      chosen = r
    }

    // A content pack with no items at the rolled rarity should degrade, not
    // hand back nothing.
    for (let i = RARITY_ORDER.indexOf(chosen); i >= 0; i--) {
      const pool = this.content.items.filter((it) => it.rarity === RARITY_ORDER[i])
      if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)]
    }
    return this.content.items[0] ?? null
  }

  equip(slot: ItemSlot, defId: string | null): boolean {
    if (defId === null) {
      delete this.state.meta.equipped[slot]
      this.mods = computeModifiers(this.state, this.content)
      this.notify()
      return true
    }
    const def = this.content.items.find((i) => i.id === defId)
    if (!def || def.slot !== slot || !this.state.meta.loadout[defId]) return false
    this.state.meta.equipped[slot] = defId
    this.mods = computeModifiers(this.state, this.content)
    this.notify()
    return true
  }

  prestige(): boolean {
    if (!canPrestige(this.state)) return false
    const payout = prestigePayout(this.state.run.cleanEarnedThisRun)
    this.state = applyPrestige(this.state, this.content, payout)
    this.mods = computeModifiers(this.state, this.content)
    this.save()
    this.notify()
    return true
  }

  // -- Derived queries the UI needs ---------------------------------------

  nextStationCost(productId: string): Big {
    const def = this.content.products.find((p) => p.id === productId)
    const ps = this.state.run.products[productId]
    if (!def || !ps) return ZERO
    return stationCost(def, ps.level)
  }

  /** Cost of the next `count` levels. -1 means "as many as affordable". */
  bulkCost(productId: string, count: number): Big {
    const def = this.content.products.find((p) => p.id === productId)
    const ps = this.state.run.products[productId]
    if (!def || !ps) return ZERO
    const n = count === -1 ? affordableLevels(def, ps.level, this.state.run.dirtyCash) : count
    return stationCostBulk(def, ps.level, Math.max(1, n))
  }

  maxAffordableLevels(productId: string): number {
    const def = this.content.products.find((p) => p.id === productId)
    const ps = this.state.run.products[productId]
    if (!def || !ps) return 0
    return affordableLevels(def, ps.level, this.state.run.dirtyCash)
  }

  prestigeRequirement(): Big {
    return prestigeRequirement(this.state.meta.totalPrestiges)
  }

  prestigePayout(): Big {
    return prestigePayout(this.state.run.cleanEarnedThisRun)
  }

  canPrestige(): boolean {
    return canPrestige(this.state)
  }

  // -- Dev -----------------------------------------------------------------
  // DESIGN.md: balancing a six-tier curve without a time-skip button is not
  // possible in a week. This ships on day one, not at the end.

  devSkip(seconds: number): StepReport {
    this.mods = computeModifiers(this.state, this.content)
    const report = runFor(this.state, this.content, this.mods, seconds, false)
    this.lastReport = report
    this.record(report.events)
    this.save()
    this.notify()
    return report
  }

  devAddDirty(amount: Big | number): void {
    this.state.run.dirtyCash = this.state.run.dirtyCash.add(big(amount))
    this.notify()
  }

  devAddClean(amount: Big | number): void {
    this.state.run.cleanCash = this.state.run.cleanCash.add(big(amount))
    this.notify()
  }

  devSetHeat(heat: number): void {
    this.state.run.heat = Math.max(0, Math.min(BALANCE.HEAT_MAX, heat))
    this.notify()
  }

  devUnlockAll(): void {
    for (const loc of this.content.locations) {
      if (!this.state.run.ownedLocations.includes(loc.id)) {
        this.state.run.ownedLocations.push(loc.id)
      }
    }
    // Move into the biggest room too, or every line ends up crammed into a
    // two-slot shack and the slot readout reads "6/2".
    const roomiest = [...this.content.locations].sort((a, b) => b.stationSlots - a.stationSlots)[0]
    if (roomiest) this.state.run.currentLocation = roomiest.id
    for (const p of this.content.products) {
      const ps = this.state.run.products[p.id]
      ps.unlocked = true
      if (ps.level === 0) ps.level = 1
    }
    for (const f of this.content.fronts) {
      if (!this.state.run.ownedFronts.includes(f.id)) {
        this.state.run.ownedFronts.push(f.id)
      }
    }
    for (const item of this.content.items) {
      if (!this.state.meta.loadout[item.id]) {
        this.state.meta.loadout[item.id] = { defId: item.id, level: 1, shards: 0 }
      }
    }
    refreshBlockUnlocks(this.state, this.content)
    this.mods = computeModifiers(this.state, this.content)
    this.notify()
  }

  devHireAll(): void {
    for (const def of this.content.crew) {
      if (!this.state.meta.unlockedCrew.includes(def.id)) {
        this.state.meta.unlockedCrew.push(def.id)
      }
    }
    this.notify()
  }

  devUnlockAutoRun(): void {
    for (const p of this.content.products) {
      this.state.meta.minigamePlays[p.id] = BALANCE.AUTO_UNLOCK_PLAYS
    }
    this.notify()
  }

  devGrantDuffels(n: number): void {
    this.state.meta.duffels.street += n
    this.state.meta.duffels.safe += n
    this.state.meta.duffels.armored += n
    this.notify()
  }

  devReset(): void {
    clearStorage()
    this.state = createInitialState(this.content)
    this.mods = computeModifiers(this.state, this.content)
    this.offlineSummary = null
    this.notify()
  }

  devExport(): string {
    return exportSave(this.state)
  }

  devImport(encoded: string): boolean {
    try {
      this.state = importSave(encoded, this.content)
      this.mods = computeModifiers(this.state, this.content)
      this.save()
      this.notify()
      return true
    } catch (err) {
      console.error('[dev] import failed', err)
      return false
    }
  }
}
