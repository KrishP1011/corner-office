import { bigToJSON, bigFromJSON } from './bignum'
import { BALANCE } from './balance'
import { SCHEMA_VERSION, createInitialState } from './state'
import type { ContentPack, GameState } from './types'

export const SAVE_KEY = 'moonshine-run:save:v1'

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** Big values are stored as strings; everything else is already JSON-safe. */
export function serialize(state: GameState): string {
  const products: Record<string, unknown> = {}
  for (const [id, p] of Object.entries(state.run.products)) {
    products[id] = { ...p, inventory: bigToJSON(p.inventory) }
  }

  return JSON.stringify({
    schemaVersion: state.schemaVersion,
    themeId: state.themeId,
    lastTickAt: state.lastTickAt,
    totalPlaySeconds: state.totalPlaySeconds,
    run: {
      ...state.run,
      dirtyCash: bigToJSON(state.run.dirtyCash),
      cleanCash: bigToJSON(state.run.cleanCash),
      cleanEarnedThisRun: bigToJSON(state.run.cleanEarnedThisRun),
      recentRevenuePerSec: bigToJSON(state.run.recentRevenuePerSec),
      products,
    },
    meta: {
      ...state.meta,
      connections: bigToJSON(state.meta.connections),
      lifetimeCleanEarned: bigToJSON(state.meta.lifetimeCleanEarned),
    },
  })
}

// ---------------------------------------------------------------------------
// Migrations
//
// Each entry takes a save at version N and returns one at N+1. The chain runs
// in order on load, so a save from any shipped version can reach the present.
// Empty today; the machinery exists so the first real migration is a
// three-line addition rather than a rescue operation.
// ---------------------------------------------------------------------------

type RawSave = Record<string, any>

const MIGRATIONS: Record<number, (s: RawSave) => RawSave> = {
  // 1: (s) => { ...; s.schemaVersion = 2; return s },
}

function migrate(raw: RawSave): RawSave {
  let version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0
  let out = raw

  while (version < SCHEMA_VERSION) {
    const fn = MIGRATIONS[version]
    if (!fn) {
      throw new Error(`No migration from save version ${version} to ${version + 1}`)
    }
    out = fn(out)
    version = out.schemaVersion
  }

  return out
}

// ---------------------------------------------------------------------------
// Deserialization
// ---------------------------------------------------------------------------

/**
 * Rebuild state from a raw save, then reconcile it against the live content
 * pack: anything the pack has gained since the save was written is added at
 * its default. That is how a content update reaches an existing player
 * without wiping them.
 */
export function deserialize(json: string, content: ContentPack): GameState {
  const raw = migrate(JSON.parse(json) as RawSave)
  const base = createInitialState(content)

  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    themeId: typeof raw.themeId === 'string' ? raw.themeId : content.themeId,
    lastTickAt: typeof raw.lastTickAt === 'number' ? raw.lastTickAt : Date.now(),
    totalPlaySeconds: typeof raw.totalPlaySeconds === 'number' ? raw.totalPlaySeconds : 0,
    run: { ...base.run },
    meta: { ...base.meta },
  }

  const r = raw.run ?? {}
  state.run.dirtyCash = bigFromJSON(r.dirtyCash)
  state.run.cleanCash = bigFromJSON(r.cleanCash)
  state.run.cleanEarnedThisRun = bigFromJSON(r.cleanEarnedThisRun)
  state.run.heat = clampNumber(r.heat, 0, BALANCE.HEAT_MAX, 0)
  state.run.startedAt = typeof r.startedAt === 'number' ? r.startedAt : Date.now()

  state.run.ownedLocations = Array.isArray(r.ownedLocations) && r.ownedLocations.length
    ? r.ownedLocations.filter((id: unknown) => content.locations.some((l) => l.id === id))
    : [content.locations[0].id]

  state.run.currentLocation =
    typeof r.currentLocation === 'string' && state.run.ownedLocations.includes(r.currentLocation)
      ? r.currentLocation
      : state.run.ownedLocations[0]

  state.run.raidCooldownSeconds = clampNumber(r.raidCooldownSeconds, 0, 86400, 0)
  state.run.shutdownSeconds = clampNumber(r.shutdownSeconds, 0, 86400, 0)
  state.run.bribesThisRun = clampNumber(r.bribesThisRun, 0, Number.MAX_SAFE_INTEGER, 0)
  state.run.recentRevenuePerSec = bigFromJSON(r.recentRevenuePerSec)
  state.run.lastBand = ['cold', 'warm', 'hot', 'burned'].includes(r.lastBand)
    ? r.lastBand
    : 'cold'
  state.run.raidShieldUsed = r.raidShieldUsed === true

  // Crew whose definition has gone are dropped rather than trusted.
  state.run.crew = {}
  if (isObject(r.crew)) {
    for (const [role, hired] of Object.entries(r.crew as Record<string, any>)) {
      const def = content.crew.find((c) => c.id === hired?.defId)
      if (!def || def.role !== role) continue
      ;(state.run.crew as Record<string, unknown>)[role] = {
        defId: def.id,
        loyalty: clampNumber(hired.loyalty, 0, 100, BALANCE.CREW_START_LOYALTY),
        payLevel: ['short', 'fair', 'generous'].includes(hired.payLevel) ? hired.payLevel : 'fair',
      }
    }
  }

  state.run.ownedFronts = Array.isArray(r.ownedFronts)
    ? r.ownedFronts.filter((id: unknown) => content.fronts.some((f) => f.id === id))
    : []

  // Products: keep saved progress, default anything new.
  for (const def of content.products) {
    const saved = r.products?.[def.id]
    const target = state.run.products[def.id]
    if (!saved || !target) continue
    target.level = clampNumber(saved.level, 0, Number.MAX_SAFE_INTEGER, target.level)
    target.cycleProgress = clampNumber(saved.cycleProgress, 0, def.cycleSeconds, 0)
    target.purity = clampNumber(saved.purity, BALANCE.PURITY_MIN, BALANCE.PURITY_MAX, BALANCE.PURITY_DEFAULT)
    target.inventory = bigFromJSON(saved.inventory)
    target.unlocked = saved.unlocked === true || target.unlocked

    // A bonus that outlived its definition is dropped rather than trusted.
    const b = saved.buff
    if (isObject(b) && typeof b.remaining === 'number' && b.remaining > 0) {
      target.buff = {
        yieldMult: clampNumber(b.yieldMult, 1, 10, 1),
        purityBonus: clampNumber(b.purityBonus, 0, BALANCE.MAX_PURITY_BONUS, 0),
        heatMult: clampNumber(b.heatMult, 0.1, 1, 1),
        remaining: clampNumber(b.remaining, 0, BALANCE.BUFF_DURATION_SECONDS, 0),
      }
    }
  }

  // Districts: same treatment.
  for (const def of content.blocks) {
    const saved = r.blocks?.[def.id]
    const target = state.run.blocks[def.id]
    if (!saved || !target) continue
    target.unlocked = saved.unlocked === true || target.unlocked
    target.customers = clampNumber(saved.customers, 0, Number.MAX_SAFE_INTEGER, 0)
    target.dealers = clampNumber(saved.dealers, 1, def.dealerSlots, 1)
    target.rivalPressure = clampNumber(saved.rivalPressure, 0, BALANCE.RIVAL_PRESSURE_MAX, 0)
    target.contested = saved.contested === true
  }

  const m = raw.meta ?? {}
  state.meta.connections = bigFromJSON(m.connections)
  state.meta.lifetimeCleanEarned = bigFromJSON(m.lifetimeCleanEarned)
  state.meta.totalPrestiges = clampNumber(m.totalPrestiges, 0, Number.MAX_SAFE_INTEGER, 0)
  state.meta.purchased2x = m.purchased2x === true
  state.meta.hintsSeen = Array.isArray(m.hintsSeen)
    ? m.hintsSeen.filter((h: unknown) => typeof h === 'string')
    : []
  state.meta.tabsUnlocked = Array.isArray(m.tabsUnlocked) && m.tabsUnlocked.length
    ? m.tabsUnlocked.filter((t: unknown) => typeof t === 'string')
    : ['production']
  state.meta.connectionsSpent = isObject(m.connectionsSpent) ? m.connectionsSpent : {}
  state.meta.duffels = {
    street: clampNumber(m.duffels?.street, 0, Number.MAX_SAFE_INTEGER, 0),
    safe: clampNumber(m.duffels?.safe, 0, Number.MAX_SAFE_INTEGER, 0),
    armored: clampNumber(m.duffels?.armored, 0, Number.MAX_SAFE_INTEGER, 0),
  }
  state.meta.minigamePlays = {}
  if (isObject(m.minigamePlays)) {
    for (const def of content.products) {
      const n = clampNumber((m.minigamePlays as Record<string, unknown>)[def.id], 0, Number.MAX_SAFE_INTEGER, 0)
      if (n > 0) state.meta.minigamePlays[def.id] = n
    }
  }
  state.meta.autoRun = {}
  if (isObject(m.autoRun)) {
    for (const def of content.products) {
      if ((m.autoRun as Record<string, unknown>)[def.id] === true) {
        state.meta.autoRun[def.id] = true
      }
    }
  }

  state.meta.unlockedCrew = Array.isArray(m.unlockedCrew)
    ? m.unlockedCrew.filter((id: unknown) => content.crew.some((c) => c.id === id))
    : []

  // Gear: drop anything whose definition no longer exists, so a removed item
  // cannot wedge the loadout.
  const itemIds = new Set(content.items.map((i) => i.id))
  state.meta.loadout = {}
  if (isObject(m.loadout)) {
    for (const [defId, owned] of Object.entries(m.loadout as Record<string, any>)) {
      if (!itemIds.has(defId)) continue
      state.meta.loadout[defId] = {
        defId,
        level: clampNumber(owned?.level, 1, BALANCE.MAX_ITEM_LEVEL, 1),
        shards: clampNumber(owned?.shards, 0, Number.MAX_SAFE_INTEGER, 0),
      }
    }
  }
  state.meta.equipped = {}
  if (isObject(m.equipped)) {
    for (const [slot, defId] of Object.entries(m.equipped as Record<string, any>)) {
      if (typeof defId === 'string' && state.meta.loadout[defId]) {
        ;(state.meta.equipped as Record<string, string>)[slot] = defId
      }
    }
  }

  return state
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function clampNumber(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, n))
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export function saveToStorage(state: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, serialize(state))
    return true
  } catch (err) {
    // Private mode, quota, disabled storage. Losing a save is bad; crashing
    // the running game on top of it is worse.
    console.warn('[save] write failed', err)
    return false
  }
}

export function loadFromStorage(content: ContentPack): GameState | null {
  let json: string | null = null
  try {
    json = localStorage.getItem(SAVE_KEY)
  } catch (err) {
    console.warn('[save] read failed', err)
    return null
  }
  if (!json) return null

  try {
    return deserialize(json, content)
  } catch (err) {
    console.error('[save] corrupt, keeping a copy at ' + SAVE_KEY + ':broken', err)
    try {
      localStorage.setItem(SAVE_KEY + ':broken', json)
    } catch { /* nothing else to try */ }
    return null
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch (err) {
    console.warn('[save] clear failed', err)
  }
}

export function exportSave(state: GameState): string {
  const bytes = new TextEncoder().encode(serialize(state))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function importSave(encoded: string, content: ContentPack): GameState {
  const binary = atob(encoded.trim())
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return deserialize(new TextDecoder().decode(bytes), content)
}
