import Decimal from 'break_infinity.js'

/**
 * Thin wrapper over break_infinity.js.
 *
 * Everything in the engine that can exceed ~1e15 uses Big. Top-tier products
 * push past 1e308, so native floats are not an option. Nothing outside this
 * file should import break_infinity directly -- keeping it behind this
 * boundary means the implementation stays swappable.
 */
export type Big = Decimal

export const ZERO: Big = new Decimal(0)
export const ONE: Big = new Decimal(1)

/** Create a Big from a number, string, or another Big. */
export function big(v: number | string | Big): Big {
  return new Decimal(v)
}

export function bigMax(a: Big, b: Big): Big {
  return a.gt(b) ? a : b
}

export function bigMin(a: Big, b: Big): Big {
  return a.lt(b) ? a : b
}

/** Clamp into [lo, hi]. */
export function bigClamp(v: Big, lo: Big, hi: Big): Big {
  return bigMin(bigMax(v, lo), hi)
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function bigToJSON(v: Big): string {
  return v.toString()
}

export function bigFromJSON(s: unknown): Big {
  if (typeof s === 'string' || typeof s === 'number') {
    const d = new Decimal(s)
    // A malformed save should not poison the run with NaN.
    return Number.isNaN(d.mantissa) ? ZERO : d
  }
  return ZERO
}

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

/** "5.00" -> "5", "0.60" -> "0.6". Keeps columns from looking padded. */
function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

const SUFFIXES = [
  '', 'K', 'M', 'B', 'T',
  'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
  'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc',
  'Vg', 'UVg', 'DVg', 'TVg', 'QaVg', 'QiVg', 'SxVg', 'SpVg', 'OcVg', 'NoVg',
  'Tg',
]

/**
 * Idle-game number formatting: 1.23K, 45.6M, 789M, then scientific once we
 * run out of suffixes.
 *
 * Roughly three significant figures throughout, and trailing zeros are
 * always trimmed. A screen full of "2.00x" and "$1.50M" reads as noise;
 * "2x" and "$1.5M" say the same thing and are easier to scan.
 */
export function fmt(v: Big | number, decimals = 2): string {
  const d = typeof v === 'number' ? new Decimal(v) : v

  if (d.lt(0)) return '-' + fmt(d.neg(), decimals)
  if (d.lt(1000)) {
    const n = d.toNumber()
    if (n < 0.01) return '0'
    if (n < 10) return trimZeros(n.toFixed(2))
    return Math.round(n).toString()
  }

  const exp = Math.floor(d.log10())
  const tier = Math.floor(exp / 3)

  if (tier >= SUFFIXES.length) {
    const mantissa = d.div(Decimal.pow(10, exp))
    return `${trimZeros(mantissa.toNumber().toFixed(decimals))}e${exp}`
  }

  const scaled = d.div(Decimal.pow(10, tier * 3)).toNumber()
  return `${sigFigs(scaled)}${SUFFIXES[tier]}`
}

/** Three significant figures inside a suffix band: 1.23K, 12.3K, 123K. */
function sigFigs(n: number): string {
  if (n < 10) return trimZeros(n.toFixed(2))
  if (n < 100) return trimZeros(n.toFixed(1))
  return Math.round(n).toString()
}

/** Money. Same as fmt but with a leading $. */
export function fmtMoney(v: Big | number, decimals = 2): string {
  return '$' + fmt(v, decimals)
}

/** Whole-number display for counts that should never show decimals. */
export function fmtInt(v: Big | number): string {
  const d = typeof v === 'number' ? new Decimal(v) : v
  if (d.lt(1000)) return Math.floor(d.toNumber()).toString()
  return fmt(d, 2)
}

/** Seconds -> "1h 12m", "45s", "3d 4h". */
export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0s'
  const s = Math.floor(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const days = Math.floor(h / 24)
  return `${days}d ${h % 24}h`
}

/** Percentage with a sign, for buff display. */
export function fmtPct(v: number, decimals = 0): string {
  const sign = v > 0 ? '+' : ''
  return `${sign}${trimZeros((v * 100).toFixed(decimals))}%`
}

/** A multiplier, without the dead zeros: 2x, 1.33x, 10x. */
export function fmtMult(v: number): string {
  if (!Number.isFinite(v)) return '-'
  if (v >= 100) return `${Math.round(v)}x`
  if (v >= 10) return `${trimZeros(v.toFixed(1))}x`
  return `${trimZeros(v.toFixed(2))}x`
}

/** A rate per minute or second, kept to one decimal at most. */
export function fmtRate(v: number, decimals = 1): string {
  if (!Number.isFinite(v)) return '0'
  if (Math.abs(v) >= 100) return Math.round(v).toString()
  return trimZeros(v.toFixed(decimals))
}
