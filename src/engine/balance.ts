/**
 * Every tunable number in the game lives here.
 *
 * DESIGN.md reserves a full day for balancing a curve that spans 1e0 to 1e12.
 * That day is only affordable if tuning means editing one file, so nothing
 * else in the engine should contain a magic number.
 */
export const BALANCE = {
  // -- Production ----------------------------------------------------------
  /** Station levels that grant a x2 output doubling. These are the spikes. */
  MILESTONE_LEVELS: [25, 50, 100, 200, 400] as const,
  MILESTONE_MULT: 2,

  // -- Cut / purity --------------------------------------------------------
  PURITY_MIN: 10,
  PURITY_MAX: 100,
  PURITY_DEFAULT: 50,
  /** Price = basePrice * (P/50)^PRICE_EXP. Below 1 so volume beats purity. */
  PRICE_EXP: 0.6,
  /** Purity at which the price multiplier is exactly 1. */
  PRICE_PIVOT: 50,

  // -- Customers -----------------------------------------------------------
  /** Units one customer buys per second. */
  DEMAND_PER_CUSTOMER: 0.05,
  /** Customer ceiling = volume * (BASE + PER_LEVEL * levels of wanted goods). */
  CUSTOMER_CEIL_BASE: 30,
  /**
   * Deliberately generous: demand must NOT be the binding constraint in the
   * normal case. If it is, cutting produces units that cannot be sold, so
   * cutting stops earning more and stops costing more heat -- and the core
   * decision of the game evaporates. Production is the bottleneck; inventory
   * is a buffer that only matters when customers churn away from bad product.
   */
  CUSTOMER_CEIL_PER_LEVEL: 25,
  /** Fraction of the ceiling gained per minute when product is acceptable. */
  CUSTOMER_GROWTH_PER_MIN: 0.08,
  /** Fraction of current customers lost per minute when product is too weak. */
  CUSTOMER_DECAY_PER_MIN: 0.15,
  /** Effective purity this far under minPurity triggers bad-batch events. */
  BAD_BATCH_MARGIN: 20,
  /** Heat multiplier while a district is being sold poison. */
  BAD_BATCH_HEAT_MULT: 3,

  // -- Minigames -----------------------------------------------------------
  /** How long a earned bonus lasts. Long enough that one run covers a session. */
  BUFF_DURATION_SECONDS: 300,
  /** Completions before a product's auto-run toggle unlocks. */
  AUTO_UNLOCK_PLAYS: 50,
  /**
   * Auto-run holds this fraction of a perfect result. Below 1 on purpose:
   * grinding the minigames becomes optional without making playing them
   * pointless.
   */
  AUTO_STRENGTH: 0.5,
  MAX_YIELD_BONUS: 0.40,
  MAX_PURITY_BONUS: 15,
  MAX_HEAT_REDUCTION: 0.35,
  /** Even a failed run leaves something, so trying is never worse than not. */
  MIN_SCORE_FLOOR: 0.1,

  // -- Crates --------------------------------------------------------------
  MAX_ITEM_LEVEL: 10,
  /**
   * Duplicates needed for the next level equals the current level, so a
   * piece takes 45 copies to max. Common gear gets there; an Untouchable
   * effectively never does, which is correct -- those are about the effect.
   */
  ITEM_SHARDS_PER_LEVEL: 1,

  // -- Heat ----------------------------------------------------------------
  HEAT_MAX: 100,
  HEAT_DECAY_PER_MIN: 0.8,
  HEAT_DECAY_PER_MIN_OFFLINE: 0.2,
  HEAT_BANDS: {
    warm: 30,
    hot: 60,
    burned: 85,
  },
  /** Raid probability per minute inside each band. */
  RAID_CHANCE_HOT: 0.05,
  RAID_CHANCE_BURNED: 0.25,
  /** Fraction of sales skimmed by undercover buys while Warm or above. */
  WARM_SALES_PENALTY: 0.02,
  RAID_INVENTORY_LOSS: 0.30,
  RAID_DIRTY_LOSS: 0.20,
  /**
   * Minutes of quiet after a raid. Without this, a long stretch at high heat
   * rolls a fresh raid every minute and a four-hour absence returns dozens.
   * They just turned the place over; they are not coming straight back.
   */
  RAID_COOLDOWN_MINUTES: 45,
  /** Heat removed by surviving a raid -- the law thinks it got you. */
  RAID_HEAT_RELIEF: 35,

  // -- Laundering ----------------------------------------------------------
  /**
   * Fronts are an upgrade, not a gate. Without a base rate the game
   * deadlocks: clean cash needs a front, and every front costs clean cash.
   * This is the money you wash through your own pockets.
   */
  BASE_LAUNDER_RATE_PER_MIN: 0.05,
  BASE_LAUNDER_CAP: 120,

  // -- Bribes --------------------------------------------------------------
  /**
   * A payoff costs this many seconds of current income, so it stays a real
   * expense at every tier without drifting out of reach. Priced against
   * upgrade costs instead, it would: those grow exponentially while income
   * grows linearly, which put it at 80 minutes of trade by level 80.
   */
  BRIBE_SECONDS_OF_INCOME: 240,
  /** Seconds for the smoothed income rate to track a rise, and a fall. */
  INCOME_RISE_TAU: 30,
  INCOME_FALL_TAU: 600,
  BRIBE_MIN_COST: 200,
  BRIBE_HEAT_RELIEF: 25,
  /** Each payoff this run raises the price of the next by this fraction. */
  BRIBE_ESCALATION: 0.25,

  // -- Dirty cash hoarding -------------------------------------------------
  /** Floor on how much dirty cash can sit around before it draws attention. */
  DIRTY_CAP_BASE: 25000,
  /**
   * The cap also scales with the next upgrade you could buy, so saving up is
   * never itself the thing that burns you. A flat cap means that by the time
   * one upgrade costs more than the cap, normal play is permanently over it.
   */
  DIRTY_CAP_UPGRADE_MULT: 25,
  /** Each owned front raises the cap by this multiple of its capacity. */
  DIRTY_CAP_PER_FRONT: 20,
  /** Heat per minute per full multiple of the cap you are over by. */
  HOARD_HEAT_PER_MIN: 0.8,

  // -- Offline -------------------------------------------------------------
  OFFLINE_CAP_HOURS_BASE: 4,
  /** Offline is simulated in chunks of this many seconds. */
  OFFLINE_CHUNK_SECONDS: 60,
  /** Hard ceiling on chunks so a month away cannot lock the tab. */
  OFFLINE_MAX_CHUNKS: 4000,

  // -- Prestige ------------------------------------------------------------
  PRESTIGE_BASE_REQUIREMENT: 100_000_000,
  PRESTIGE_REQUIREMENT_GROWTH: 12,
  /** Connections = floor(sqrt(lifetimeCleanThisRun / DIVISOR)). */
  PRESTIGE_DIVISOR: 1_000_000,

  // -- Duffels -------------------------------------------------------------
  /** Chance that any single completed production cycle drops a sack. */
  DUFFEL_CHANCE_PER_CYCLE: 0.0015,

  // -- Simulation ----------------------------------------------------------
  TICK_MS: 100,
  /** UI store pushes per second. Sim runs faster; numbers tween between. */
  UI_HZ: 4,
  SAVE_INTERVAL_SECONDS: 10,
  /** A single step is never longer than this, so integration stays stable. */
  MAX_STEP_SECONDS: 60,
} as const

/** Rarity odds per crate tier. DESIGN.md section 9. */
export const DUFFEL_ODDS = {
  street:  { street: 0.70, solid: 0.25, connected: 0.05, made: 0.00, untouchable: 0.00 },
  safe:    { street: 0.30, solid: 0.40, connected: 0.22, made: 0.07, untouchable: 0.01 },
  armored: { street: 0.05, solid: 0.25, connected: 0.40, made: 0.25, untouchable: 0.05 },
} as const

/** Duplicates required to go from `level` to the next. */
export function shardsForLevel(level: number): number {
  return level * BALANCE.ITEM_SHARDS_PER_LEVEL
}

/**
 * What each minigame pays out, as a fraction of the MAX_* ceilings above.
 * Different games buy different things so that each one is worth learning:
 * a clean smuggling route quiets the law, a steady still sharpens the proof.
 */
export const MINIGAME_REWARDS = {
  none:          { yield: 0,   purity: 0,   heat: 0 },
  balance:       { yield: 1,   purity: 0,   heat: 0 },
  contamination: { yield: 1,   purity: 0,   heat: 0 },
  timing:        { yield: 0,   purity: 1,   heat: 0 },
  route:         { yield: 0,   purity: 0,   heat: 1 },
  stability:     { yield: 0.5, purity: 1,   heat: 0 },
} as const

/** Output multiplier from milestone doublings at or below `level`. */
export function milestoneMultiplier(level: number): number {
  let m = 1
  for (const ms of BALANCE.MILESTONE_LEVELS) {
    if (level >= ms) m *= BALANCE.MILESTONE_MULT
  }
  return m
}

/** The next milestone above `level`, or null past the last one. */
export function nextMilestone(level: number): number | null {
  for (const ms of BALANCE.MILESTONE_LEVELS) {
    if (level < ms) return ms
  }
  return null
}
