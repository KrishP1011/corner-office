import { useMemo } from 'react'
import type { ProductView } from '../../store/gameStore'

/**
 * The still.
 *
 * The game was a list of cards with sliders -- accurate, and not a game.
 * This is the thing you are actually doing, drawn: a pot over a fire, a
 * condenser, and a jar that fills as the batch runs and empties when it
 * comes off. Everything on screen is driven by real state, so watching it is
 * reading the game.
 */
export function Still({ p, running }: { p: ProductView; running: boolean }) {
  const t = p.cyclePct / 100

  // The rig grows with the line. Visible progress you did not have to read.
  const tier = useMemo(() => {
    if (p.level >= 200) return 3
    if (p.level >= 50) return 2
    if (p.level >= 10) return 1
    return 0
  }, [p.level])

  const copper = ['#8a5a2b', '#a9682f', '#c07f3a', '#d99a5b'][tier]

  /**
   * Crates of finished stock along the back wall, one per two levels.
   *
   * The tiers above only change the rig at 10, 50 and 200, which leaves the
   * opening stretch -- the part every player sees and most players judge the
   * game on -- looking identical no matter how much they spend. These give
   * every single purchase something to show for itself.
   */
  const crates = Math.min(14, Math.floor(p.level / 2))

  // The fire answers the throughput too, so a bigger line visibly burns harder.
  const heatScale = 1 + Math.min(0.45, p.level / 120)
  const glow = running ? Math.min(1, 0.85 * heatScale) : 0.25

  return (
    <svg viewBox="0 0 260 150" className="w-full" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="pot" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3a2413" />
          <stop offset="32%" stopColor={copper} />
          <stop offset="62%" stopColor="#f0c98a" />
          <stop offset="100%" stopColor="#4a2f18" />
        </linearGradient>
        <linearGradient id="jarFill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#e8a13a" />
          <stop offset="100%" stopColor="#f5d894" />
        </linearGradient>
        <radialGradient id="fire">
          <stop offset="0%" stopColor="#ffd88a" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#e2701f" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#e2701f" stopOpacity="0" />
        </radialGradient>
        <clipPath id="jarClip">
          <rect x="196" y="96" width="34" height="40" rx="3" />
        </clipPath>
      </defs>

      {/* Stacked stock, behind everything: the count is the level. */}
      <g opacity="0.55">
        {Array.from({ length: crates }).map((_, i) => {
          const col = i % 7
          const row = Math.floor(i / 7)
          const x = 12 + col * 17
          const y = 104 - row * 15
          return (
            <g key={i}>
              <rect x={x} y={y} width="15" height="13" rx="1.5" fill="#3a2a17" />
              <rect x={x} y={y} width="15" height="13" rx="1.5" fill="none" stroke="#5c422339" strokeWidth="1" />
              <rect x={x} y={y + 5.5} width="15" height="2" fill="#241a0e" opacity="0.7" />
            </g>
          )
        })}
      </g>

      {/* Floor shadow */}
      <ellipse cx="130" cy="142" rx="104" ry="7" fill="#000" opacity="0.45" />

      {/* --- Firebox ------------------------------------------------------ */}
      <rect x="44" y="112" width="74" height="22" rx="3" fill="#161d29" />
      <rect x="44" y="112" width="74" height="22" rx="3" fill="none" stroke="#243247" strokeWidth="1" />
      <ellipse cx="81" cy="120" rx={34 * heatScale} ry={13 * heatScale} fill="url(#fire)" opacity={glow} />
      {running && (
        <g style={{ animation: 'flame 900ms ease-in-out infinite alternate' }}>
          <path d="M66 126 q5 -13 11 -6 q3 -9 8 0 q6 -7 10 6 Z" fill="#ffb648" opacity="0.9" />
          <path d="M72 126 q4 -8 8 -4 q3 -6 6 0 q4 -4 7 4 Z" fill="#ffe9b0" opacity="0.85" />
        </g>
      )}

      {/* --- Pot ---------------------------------------------------------- */}
      <path d="M48 112 L54 66 q0 -8 10 -8 L98 58 q10 0 10 8 L114 112 Z" fill="url(#pot)" />
      <ellipse cx="81" cy="58" rx="27" ry="6" fill={copper} />
      <ellipse cx="81" cy="57" rx="22" ry="4" fill="#2a1a0d" opacity="0.6" />
      {/* Bands */}
      <rect x="50" y="86" width="62" height="4" fill="#2a1a0d" opacity="0.45" />
      <rect x="52" y="98" width="58" height="3" fill="#2a1a0d" opacity="0.35" />

      {/* --- Swan neck ----------------------------------------------------- */}
      <path
        d="M81 52 L81 34 q0 -10 14 -10 L148 24 q14 0 14 14 L162 62"
        fill="none"
        stroke={copper}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M81 52 L81 34 q0 -10 14 -10 L148 24 q14 0 14 14 L162 62"
        fill="none"
        stroke="#f0c98a"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.5"
      />

      {/* --- Condenser barrel ---------------------------------------------- */}
      <rect x="146" y="62" width="34" height="52" rx="4" fill="#2d2115" />
      <rect x="146" y="62" width="34" height="52" rx="4" fill="none" stroke="#4a3722" strokeWidth="1.5" />
      {[70, 82, 94, 106].map((y) => (
        <rect key={y} x="146" y={y} width="34" height="3" fill="#0f1826" opacity="0.5" />
      ))}
      {/* Worm coil, more turns on a better rig */}
      {Array.from({ length: 3 + tier }).map((_, i) => (
        <path
          key={i}
          d={`M150 ${70 + i * (40 / (3 + tier))} q13 -6 26 0`}
          fill="none"
          stroke={copper}
          strokeWidth="2.6"
          opacity="0.85"
        />
      ))}

      {/* --- Spout and jar -------------------------------------------------- */}
      <path d="M180 108 L196 108" stroke={copper} strokeWidth="5" strokeLinecap="round" />
      {running && (
        <circle cx="198" cy="112" r="2" fill="#f5d894" style={{ animation: 'drip 1.1s linear infinite' }} />
      )}

      <rect x="196" y="96" width="34" height="40" rx="3" fill="#17202e" opacity="0.85" />
      <g clipPath="url(#jarClip)">
        <rect x="196" y={136 - t * 38} width="34" height={t * 38 + 2} fill="url(#jarFill)" opacity="0.9" />
        <rect x="196" y={136 - t * 38} width="34" height="2.5" fill="#fff3d0" opacity="0.7" />
      </g>
      <rect x="196" y="96" width="34" height="40" rx="3" fill="none" stroke="#3d5273" strokeWidth="1.5" />
      <rect x="199" y="92" width="28" height="5" rx="2" fill="#243247" />
      {/* Glass highlight */}
      <rect x="201" y="100" width="4" height="30" rx="2" fill="#fff" opacity="0.10" />

      {/* --- A second rig once the line is serious -------------------------- */}
      {tier >= 2 && (
        <g opacity="0.5" transform="translate(-30 26) scale(0.44)">
          <path d="M48 112 L54 66 q0 -8 10 -8 L98 58 q10 0 10 8 L114 112 Z" fill="url(#pot)" />
          <ellipse cx="81" cy="58" rx="27" ry="6" fill={copper} />
          <rect x="44" y="112" width="74" height="16" rx="3" fill="#161d29" />
          {running && <ellipse cx="81" cy="118" rx="30" ry="9" fill="url(#fire)" opacity="0.7" />}
        </g>
      )}
      {tier >= 3 && (
        <g opacity="0.38" transform="translate(206 30) scale(0.4)">
          <path d="M48 112 L54 66 q0 -8 10 -8 L98 58 q10 0 10 8 L114 112 Z" fill="url(#pot)" />
          <ellipse cx="81" cy="58" rx="27" ry="6" fill={copper} />
          <rect x="44" y="112" width="74" height="16" rx="3" fill="#161d29" />
        </g>
      )}

      {/* Steam, only while it is actually running */}
      {running && (
        <g opacity="0.3">
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx={81 + i * 5}
              cy={46}
              r={3 + i}
              fill="#cfe0f0"
              style={{ animation: `steam 2.6s ease-out ${i * 0.6}s infinite` }}
            />
          ))}
        </g>
      )}
    </svg>
  )
}
