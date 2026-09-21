/**
 * A vessel per tier.
 *
 * Six product names in a column all read the same at a glance. Six different
 * silhouettes do not -- you learn the jug from the mason jar from the drum
 * without reading anything, which is most of what an icon is for.
 */
export function ProductIcon({
  id, size = 34, active = false,
}: { id: string; size?: number; active?: boolean }) {
  // Inactive vessels still need to be legible -- at low contrast the six
  // silhouettes blur into one another, which defeats the point of them.
  const body = active ? '#e0b94a' : '#93a3ba'
  const fill = active ? 'rgba(224,185,74,0.24)' : 'rgba(147,163,186,0.16)'
  const shine = active ? 'rgba(255,240,200,0.6)' : 'rgba(255,255,255,0.22)'

  return (
    <svg viewBox="0 0 40 40" style={{ width: size, height: size, display: 'block' }}>
      <g stroke={body} strokeWidth="2" fill={fill} strokeLinejoin="round">
        {id === 'cider' && (
          <>
            {/* Jug with a thumb handle */}
            <path d="M15 11 h10 v4 q7 4 7 12 v6 q0 4 -4 4 h-16 q-4 0 -4 -4 v-6 q0 -8 7 -12 Z" />
            <path d="M32 21 q5 1 5 5 q0 4 -5 4" fill="none" />
            <rect x="15" y="7" width="10" height="4" rx="1.5" />
          </>
        )}
        {id === 'beer' && (
          <>
            {/* Stoneware crock */}
            <path d="M12 13 h16 q2 0 2 3 v16 q0 5 -5 5 h-10 q-5 0 -5 -5 v-16 q0 -3 2 -3 Z" />
            <rect x="14" y="8" width="12" height="5" rx="1.5" />
            <path d="M11 20 h18" fill="none" strokeWidth="1.4" />
          </>
        )}
        {id === 'shine' && (
          <>
            {/* Mason jar, threaded neck */}
            <path d="M12 14 h16 v18 q0 5 -5 5 h-6 q-5 0 -5 -5 Z" />
            <rect x="13" y="8" width="14" height="6" rx="1.5" />
            <path d="M13 10 h14 M13 12 h14" fill="none" strokeWidth="1.1" />
          </>
        )}
        {id === 'gin' && (
          <>
            {/* Tall bottle, long neck */}
            <path d="M17 6 h6 v9 q6 4 6 12 v6 q0 4 -4 4 h-10 q-4 0 -4 -4 v-6 q0 -8 6 -12 Z" />
            <path d="M14 26 h12" fill="none" strokeWidth="1.3" />
          </>
        )}
        {id === 'scotch' && (
          <>
            {/* Squat bottle with a label */}
            <path d="M16 6 h8 v8 q6 3 6 10 v8 q0 5 -5 5 h-10 q-5 0 -5 -5 v-8 q0 -7 6 -10 Z" />
            <rect x="13" y="23" width="14" height="8" rx="1" strokeWidth="1.4" />
          </>
        )}
        {id === 'everclear' && (
          <>
            {/* Industrial carboy in a cradle */}
            <path d="M14 12 q6 -5 12 0 q4 5 4 12 v6 q0 6 -6 6 h-8 q-6 0 -6 -6 v-6 q0 -7 4 -12 Z" />
            <rect x="17" y="5" width="6" height="7" rx="1.5" />
            <path d="M11 28 h18" fill="none" strokeWidth="1.4" />
          </>
        )}
      </g>
      {/* A glint, so it reads as glass rather than outline */}
      <path
        d={id === 'cider' ? 'M14 20 v9' : 'M15 18 v11'}
        stroke={shine}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
