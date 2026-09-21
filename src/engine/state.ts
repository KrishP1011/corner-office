import { big, ZERO } from './bignum'
import { BALANCE } from './balance'
import type {
  ContentPack, GameState, RunState, MetaState,
  ProductState, BlockState,
} from './types'

export const SCHEMA_VERSION = 1

function freshProducts(content: ContentPack): Record<string, ProductState> {
  const out: Record<string, ProductState> = {}
  content.products.forEach((p, i) => {
    out[p.id] = {
      // The first product starts unlocked and running. An idle game that
      // opens on a static screen with nothing happening has already lost.
      level: i === 0 ? 1 : 0,
      cycleProgress: 0,
      purity: BALANCE.PURITY_DEFAULT,
      inventory: ZERO,
      unlocked: i === 0,
      buff: null,
    }
  })
  return out
}

function freshBlocks(content: ContentPack, products: Record<string, ProductState>): Record<string, BlockState> {
  const out: Record<string, BlockState> = {}
  for (const b of content.blocks) {
    out[b.id] = {
      unlocked: b.wants.some((w) => products[w]?.unlocked),
      customers: 0,
      dealers: 1,
      rivalPressure: 0,
      contested: false,
    }
  }
  return out
}

export function freshRun(content: ContentPack): RunState {
  const products = freshProducts(content)
  const firstLocation = content.locations[0].id
  return {
    dirtyCash: ZERO,
    cleanCash: ZERO,
    heat: 0,
    products,
    blocks: freshBlocks(content, products),
    ownedLocations: [firstLocation],
    currentLocation: firstLocation,
    ownedFronts: [],
    raidCooldownSeconds: 0,
    recentRevenuePerSec: ZERO,
    bribesThisRun: 0,
    lastBand: 'cold',
    raidShieldUsed: false,
    crew: {},
    cleanEarnedThisRun: ZERO,
    startedAt: Date.now(),
  }
}

export function freshMeta(): MetaState {
  return {
    connections: ZERO,
    connectionsSpent: {},
    loadout: {},
    equipped: {},
    duffels: { street: 0, safe: 0, armored: 0 },
    unlockedCrew: [],
    totalPrestiges: 0,
    minigamePlays: {},
    autoRun: {},
    lifetimeCleanEarned: ZERO,
    purchased2x: false,
  }
}

export function createInitialState(content: ContentPack): GameState {
  return {
    schemaVersion: SCHEMA_VERSION,
    themeId: content.themeId,
    run: freshRun(content),
    meta: freshMeta(),
    lastTickAt: Date.now(),
    totalPlaySeconds: 0,
  }
}

/**
 * Wipe the run, keep the meta. DESIGN.md section 11: gear, gear levels,
 * connections, duffels and the crew roster survive; everything else goes.
 */
export function applyPrestige(state: GameState, content: ContentPack, payout: ReturnType<typeof big>): GameState {
  return {
    ...state,
    run: freshRun(content),
    meta: {
      ...state.meta,
      connections: state.meta.connections.add(payout),
      totalPrestiges: state.meta.totalPrestiges + 1,
      lifetimeCleanEarned: state.meta.lifetimeCleanEarned.add(state.run.cleanEarnedThisRun),
      // Cashing out always pays for itself at least once.
      duffels: { ...state.meta.duffels, armored: state.meta.duffels.armored + 1 },
    },
    lastTickAt: Date.now(),
  }
}

/** Re-evaluate which districts are open. Called after any unlock. */
export function refreshBlockUnlocks(state: GameState, content: ContentPack): void {
  for (const b of content.blocks) {
    const bs = state.run.blocks[b.id]
    if (!bs || bs.unlocked) continue
    if (b.wants.some((w) => state.run.products[w]?.unlocked)) {
      bs.unlocked = true
    }
  }
}
