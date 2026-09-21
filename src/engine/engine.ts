import { big, type Big, ZERO } from './bignum'
import { BALANCE } from './balance'
import { loadContent, DEFAULT_THEME } from './content'
import {
  computeModifiers, stationCost, stationCostBulk, affordableLevels,
  canPrestige, prestigePayout, prestigeRequirement,
} from './economy'
import { createInitialState, applyPrestige, refreshBlockUnlocks } from './state'
import { runFor, cappedOfflineSeconds } from './tick'
import { loadFromStorage, saveToStorage, clearStorage, exportSave, importSave } from './save'
import type { ContentPack, GameState, Modifiers, StepReport, ItemSlot } from './types'

/** Any elapsed gap longer than this is treated as time away, not a hitch. */
const OFFLINE_THRESHOLD_SECONDS = 10

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
