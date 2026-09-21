import type { GameState, StatKey } from './types'

/**
 * The Connections tree: what a cashed-out identity leaves behind.
 *
 * DESIGN.md section 11. These are the permanent half of progression, so
 * every node has to be worth wanting on its own -- a tree of flat +2%s is
 * just a longer wait for the same game.
 */
export interface ConnectionNode {
  id: string
  name: string
  what: string
  maxLevel: number
  baseCost: number
  costGrowth: number
  /** Modifier this node feeds, if any. Head starts are handled separately. */
  stat?: StatKey | 'duffelDropRate'
  perLevel?: number
  /**
   * Multiplies rather than adds. An additive bonus grows linearly in levels
   * while levels cost exponentially, so its value grows logarithmically in
   * connections -- which is why later runs stopped keeping pace.
   */
  multiplicative?: boolean
}

export const CONNECTION_NODES: ConnectionNode[] = [
  {
    /**
     * Deliberately uncapped. Every other node tops out, and the finite tree
     * costs about 1,660 connections in total -- past that, cashing out would
     * buy nothing at all and the whole meta layer would dead-end. This is
     * where connections always have somewhere to go.
     */
    id: 'name',
    name: 'The name',
    what: 'People know it. Everything you run is worth more.',
    maxLevel: 999, baseCost: 5, costGrowth: 1.22,
    stat: 'yield', perLevel: 0.11, multiplicative: true,
  },
  {
    id: 'craft',
    name: 'The old recipes',
    what: 'Everything you run comes out of the still faster.',
    maxLevel: 10, baseCost: 2, costGrowth: 1.55,
    stat: 'yield', perLevel: 0.05,
  },
  {
    id: 'proof',
    name: 'A steadier hand',
    what: 'Every batch reads higher than it is.',
    maxLevel: 8, baseCost: 3, costGrowth: 1.7,
    stat: 'purityFloor', perLevel: 2,
  },
  {
    id: 'quiet',
    name: 'People who forget',
    what: 'Less of what you move comes back to you.',
    maxLevel: 8, baseCost: 3, costGrowth: 1.7,
    stat: 'heatResist', perLevel: 0.05,
  },
  {
    id: 'wash',
    name: 'A friend at the bank',
    what: 'More of the pile comes out clean, every minute.',
    maxLevel: 8, baseCost: 2, costGrowth: 1.6,
    stat: 'launderRate', perLevel: 0.10,
  },
  {
    id: 'patience',
    name: 'People who keep working',
    what: 'The operation runs longer without you watching it.',
    maxLevel: 6, baseCost: 4, costGrowth: 1.8,
    stat: 'offlineCap', perLevel: 1,
  },
  {
    id: 'luck',
    name: 'Knowing where to look',
    what: 'More crates turn up in the stock.',
    maxLevel: 5, baseCost: 5, costGrowth: 2.0,
    stat: 'duffelDropRate', perLevel: 0.3,
  },
  {
    id: 'rooms',
    name: 'Rooms already paid for',
    what: 'Start each identity somewhere better than a backwoods shack.',
    maxLevel: 4, baseCost: 8, costGrowth: 2.2,
  },
  {
    id: 'lines',
    name: 'Lines already running',
    what: 'Start each identity with the early trades already open.',
    maxLevel: 4, baseCost: 10, costGrowth: 2.2,
  },
]

export function nodeLevel(state: GameState, id: string): number {
  return state.meta.connectionsSpent[id] ?? 0
}

/** Connections to take a node from its current level to the next. */
export function nodeCost(node: ConnectionNode, level: number): number {
  return Math.ceil(node.baseCost * Math.pow(node.costGrowth, level))
}

/** How many locations a run starts already holding. */
export function headStartLocations(state: GameState): number {
  return nodeLevel(state, 'rooms')
}

/** How many product lines beyond the first a run starts with open. */
export function headStartProducts(state: GameState): number {
  return nodeLevel(state, 'lines')
}
