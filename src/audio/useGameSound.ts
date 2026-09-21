import { useEffect, useRef } from 'react'
import { sfx } from './sfx'
import { useGame } from '../store/gameStore'
import { emitFloat } from '../ui/juice'
import type { EventKind } from '../engine/types'

/** What each simulation event sounds like, and whether it floats. */
const VOICES: Partial<Record<EventKind, 'raid' | 'bad' | 'good' | 'coin'>> = {
  raid: 'raid',
  raidShielded: 'good',
  snitch: 'bad',
  badBatch: 'bad',
  blockLost: 'bad',
  blockHeld: 'good',
  bandUp: 'bad',
  crate: 'coin',
  crewAvailable: 'good',
}

const FLOATS: Partial<Record<EventKind, { text: string; tone: 'good' | 'bad' | 'brass' }>> = {
  raid: { text: 'RAIDED', tone: 'bad' },
  raidShielded: { text: 'they found nothing', tone: 'good' },
  snitch: { text: 'somebody talked', tone: 'bad' },
  blockLost: { text: 'corner lost', tone: 'bad' },
  blockHeld: { text: 'corner taken back', tone: 'good' },
  crate: { text: 'crate found', tone: 'brass' },
}

/**
 * Turns simulation events into sound and floaters.
 *
 * Keyed on the newest event id rather than the array, which is rebuilt on
 * every publish. Only fires for events that arrived after mount, so opening
 * the game does not replay an hour of offline history at you.
 */
export function useGameSound(): void {
  const g = useGame()
  const lastSeen = useRef<number | null>(null)
  const newestId = g.events[0]?.id ?? 0

  useEffect(() => {
    if (lastSeen.current === null) {
      lastSeen.current = newestId
      return
    }
    if (newestId <= lastSeen.current) return

    const fresh = g.events.filter((e) => e.id > lastSeen.current!)
    lastSeen.current = newestId

    // Newest last, so the most recent thing is the one you hear.
    for (const e of fresh.slice().reverse()) {
      const voice = VOICES[e.kind]
      if (voice) sfx.play(voice)
      const float = FLOATS[e.kind]
      if (float) emitFloat(float.text, float.tone)
    }
  }, [newestId, g.events])
}

/**
 * A click on anything button-shaped makes a sound, so every control feels
 * connected without threading a handler through each one. Disabled controls
 * get the refusal instead, which is its own useful feedback.
 */
export function useClickSounds(): void {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest('button, input[type=range]')
      if (!el) return
      if (el instanceof HTMLButtonElement && el.disabled) { sfx.play('deny'); return }
      sfx.play(el.tagName === 'INPUT' ? 'tick' : 'click')
    }

    window.addEventListener('pointerdown', onDown, { passive: true })
    return () => window.removeEventListener('pointerdown', onDown)
  }, [])
}
