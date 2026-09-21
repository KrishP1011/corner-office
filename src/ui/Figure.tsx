import { useMemo } from 'react'
import { useGame, RARITY_COLOR } from '../store/gameStore'
import type { Rarity, ItemSlot } from '../engine/types'

const RANK: Record<Rarity, number> = {
  street: 0, solid: 1, connected: 2, made: 3, untouchable: 4,
}

/**
 * The figure.
 *
 * DESIGN.md section 8: the visual arc from a hoodie on a corner to a suit in
 * an office is the game's best marketing asset, and the reason for the
 * project's name. Built as flat vector rather than pixel art (section 20's
 * art-direction change) -- a dark silhouette with a warm rim light reads as
 * deliberate at any size, where a mediocre sprite reads as cheap.
 *
 * Everything equipped changes something: the coat's length and colour, the
 * shoes, the hat, the case in hand, the chain, and the posture.
 */
export function Figure({ height = 240 }: { height?: number }) {
  const g = useGame()

  const look = useMemo(() => {
    const worn: Partial<Record<ItemSlot, Rarity>> = {}
    let sum = 0
    let count = 0

    for (const slot of g.loadout) {
      if (!slot.equipped) continue
      worn[slot.slot] = slot.equipped.def.rarity
      sum += RANK[slot.equipped.def.rarity]
      count++
    }

    // Standing: how well turned out you are overall, 0-1. Drives posture,
    // hat and coat, so progress is legible from the silhouette alone.
    const standing = count === 0 ? 0 : (sum / count) / 4
    return { worn, standing, count }
  }, [g.loadout])

  const { worn, standing } = look
  const coat = worn.jacket ? RARITY_COLOR[worn.jacket] : '#2a3a54'
  const shoes = worn.kicks ? RARITY_COLOR[worn.kicks] : '#1d2a40'
  const chain = worn.chain ? RARITY_COLOR[worn.chain] : null
  const bag = worn.briefcase ? RARITY_COLOR[worn.briefcase] : null
  const watch = worn.watch ? RARITY_COLOR[worn.watch] : null
  const piece = worn.piece ? RARITY_COLOR[worn.piece] : null

  // Straighter as you come up in the world.
  const lean = 4 - standing * 4
  const brim = 20 + standing * 9

  const HEM = 150 + standing * 22
  const HAND = HEM - 18

  return (
    <svg
      viewBox="0 0 140 250"
      style={{ height, width: 'auto', display: 'block' }}
      aria-label="Your figure"
    >
      <defs>
        <linearGradient id="fig-rim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f0d478" stopOpacity="0.85" />
          <stop offset="18%" stopColor="#e0b94a" stopOpacity="0.28" />
          <stop offset="46%" stopColor="#e0b94a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="fig-coat" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor={coat} stopOpacity="0.62" />
          <stop offset="55%" stopColor={coat} stopOpacity="0.22" />
          <stop offset="100%" stopColor="#070b12" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="fig-floor">
          <stop offset="0%" stopColor="#e0b94a" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#e0b94a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Pool of light underfoot */}
      <ellipse cx="70" cy="240" rx="54" ry="12" fill="url(#fig-floor)" />
      <ellipse cx="70" cy="239" rx="28" ry="5" fill="#000" opacity="0.55" />

      <g style={{ animation: 'fig-breathe 5.5s ease-in-out infinite', transformOrigin: '70px 240px' }}>
        <g transform={`rotate(${-lean * 0.3} 70 240)`}>

          {/* One silhouette, so the figure reads as a person and not as
              parts. Everything else layers on top of this. */}
          <path
            d={`M57 ${HEM} L57 226 L73 226 L73 ${HEM} Z M75 ${HEM} L75 226 L91 226 L91 ${HEM} Z`}
            fill="#16203180"
          />
          <rect x="51" y="222" width="20" height="11" rx="3.5" fill="#0f1826" />
          <rect x="73" y="222" width="20" height="11" rx="3.5" fill="#0f1826" />
          <rect x="51" y="222" width="20" height="11" rx="3.5" fill={shoes} opacity="0.4" />
          <rect x="73" y="222" width="20" height="11" rx="3.5" fill={shoes} opacity="0.28" />

          {/* Legs */}
          <path d={`M58 ${HEM - 4} L57 226 L69 226 L70 ${HEM - 4} Z`} fill="#141d2c" />
          <path d={`M72 ${HEM - 4} L74 226 L86 226 L84 ${HEM - 4} Z`} fill="#101825" />

          {/* Head and neck, lifted clear of the background */}
          <rect x="65" y="56" width="10" height="16" fill="#131c2b" />
          <ellipse cx="70" cy="45" rx="12.5" ry="14.5" fill="#1a2536" />
          <ellipse cx="66" cy="43" rx="9" ry="12" fill="#22304a" opacity="0.7" />

          {/* Coat */}
          <path
            d={`M48 74 Q45 68 53 65 L70 60 L87 65 Q95 68 92 74 L96 ${HEM} L44 ${HEM} Z`}
            fill="url(#fig-coat)"
            stroke={coat}
            strokeOpacity="0.5"
            strokeWidth="1.1"
          />
          {/* Lapels */}
          <path d={`M70 61 L59 84 L70 ${92 + standing * 5} L81 84 Z`} fill="#070b12" opacity="0.9" />
          <path d={`M59 84 L70 61 L81 84`} fill="none" stroke={coat} strokeOpacity="0.55" strokeWidth="0.9" />

          {/* Near arm, light enough to separate from the coat */}
          <path
            d={`M50 76 L43 ${HAND} L54 ${HAND + 2} L59 78 Z`}
            fill="#1a2536"
            stroke={coat}
            strokeOpacity="0.28"
            strokeWidth="0.8"
          />
          {/* Far arm, only a suggestion */}
          <path d={`M90 76 L96 ${HAND + 4} L88 ${HAND + 4} L84 78 Z`} fill="#0d1420" />

          {watch && <rect x="44" y={HAND - 8} width="9" height="3.5" rx="1.5" fill={watch} opacity="0.95" />}

          {chain && (
            <path d="M63 70 Q70 81 77 70" fill="none" stroke={chain} strokeWidth="2" strokeLinecap="round" opacity="0.95" />
          )}

          {/* A strap across the chest. Reads as intent rather than as a
              sticker pasted on the coat, which is what a shape at the hip
              looked like. */}
          {piece && (
            <path d="M60 80 L84 112" stroke={piece} strokeWidth="2.2" strokeOpacity="0.4" strokeLinecap="round" fill="none" />
          )}

          {/* Case, hanging from the hand rather than beside it */}
          {bag && (
            <>
              <path d={`M48 ${HAND + 1} L44 ${HAND + 7}`} stroke={bag} strokeWidth="1.6" strokeOpacity="0.8" fill="none" />
              <rect x="27" y={HAND + 7} width="27" height="20" rx="2.5" fill="#0d1420" stroke={bag} strokeOpacity="0.85" strokeWidth="1.2" />
              <path d={`M36 ${HAND + 7} q4.5 -6 9 0`} fill="none" stroke={bag} strokeOpacity="0.85" strokeWidth="1.3" />
              <rect x="27" y={HAND + 15} width="27" height="1.4" fill={bag} opacity="0.35" />
            </>
          )}

          {/* Hat: flat cap, then a brim, then a proper homburg */}
          {standing < 0.34 ? (
            <>
              <path d="M56 36 q14 -13 28 0 q4 3 -2 4 l-24 0 q-6 -1 -2 -4 Z" fill="#1a2536" />
              <path d="M56 36 q-6 1 -8 4 l14 0 Z" fill="#131c2b" />
            </>
          ) : (
            <>
              <ellipse cx="70" cy="31" rx={brim} ry="4.8" fill="#131c2b" />
              <ellipse cx="70" cy="30" rx={brim} ry="4.2" fill="#1a2536" />
              <path d={`M58 31 L60 ${17 - standing * 3} q10 -5 20 0 L82 31 Z`} fill="#1e293d" />
              <rect x="58" y="26.5" width="24" height="3.6" rx="0.6" fill="#070b12" />
              {standing > 0.7 && <rect x="58" y="26.5" width="24" height="3.6" rx="0.6" fill="#e0b94a" opacity="0.45" />}
            </>
          )}

          {/* Rim light down the near edge, last so it sits over everything */}
          <path
            d={`M48 74 Q45 68 53 65 L70 60 L70 ${HEM} L44 ${HEM} Z`}
            fill="url(#fig-rim)"
            opacity="0.8"
          />
          <path d={`M53 65 L48 74 L44 ${HEM}`} fill="none" stroke="#f0d478" strokeOpacity="0.32" strokeWidth="1.1" />
          <path d="M58 33 Q62 20 70 18" fill="none" stroke="#f0d478" strokeOpacity="0.22" strokeWidth="1" />
        </g>
      </g>
    </svg>
  )
}

/** The figure, framed, with a line about how you are carrying yourself. */
export function FigureCard() {
  const g = useGame()

  let sum = 0
  let count = 0
  for (const slot of g.loadout) {
    if (!slot.equipped) continue
    sum += RANK[slot.equipped.def.rarity]
    count++
  }
  const standing = count === 0 ? 0 : (sum / count) / 4

  return (
    <div className="panel relative overflow-hidden p-4">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-32"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(224,185,74,0.10), transparent 70%)' }}
      />
      <div className="relative flex items-center gap-4">
        <Figure height={190} />
        <div className="min-w-0 flex-1">
          <div className="text-cream-dim text-[10px] uppercase tracking-[0.16em]">
            {g.totalPrestiges > 0 ? `Identity ${g.totalPrestiges + 1}` : 'Season one'}
          </div>
          <p className="display text-cream mt-1.5 text-sm leading-snug">
            {figureCaption(standing, count)}
          </p>
          <div className="text-cream-dim mt-3 text-[11px] leading-relaxed">
            {count} of {g.loadout.length} slots filled
          </div>
        </div>
      </div>
    </div>
  )
}

/** One line summing up how you look right now. */
export function figureCaption(standing: number, worn: number): string {
  if (worn === 0) return 'Nothing but the clothes you came in'
  if (standing < 0.2) return 'You look like what you are'
  if (standing < 0.45) return 'Nobody looks twice'
  if (standing < 0.7) return 'You get served first now'
  if (standing < 0.9) return 'Doors open before you reach them'
  return 'They keep a table for you'
}
