import { useState } from 'react'
import { sfx } from '../audio/sfx'

/** Sound is on by default and one tap from off. The choice persists. */
export function MuteButton() {
  const [muted, setMuted] = useState(sfx.isMuted)

  const toggle = () => {
    sfx.unlock()
    const next = !muted
    sfx.setMuted(next)
    setMuted(next)
    if (!next) sfx.play('click')
  }

  return (
    <button
      onClick={toggle}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      className="text-cream-dim hover:text-cream px-1 transition-colors"
      style={{ lineHeight: 0 }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        {muted ? (
          <>
            <line x1="22" y1="9" x2="16" y2="15" />
            <line x1="16" y1="9" x2="22" y2="15" />
          </>
        ) : (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </>
        )}
      </svg>
    </button>
  )
}
