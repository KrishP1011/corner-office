/**
 * Sound, synthesised.
 *
 * DESIGN.md section 17 lists sound as wildly underrated and cheap, and it is
 * right -- but shipping audio files would add megabytes to a web game whose
 * whole distribution advantage is loading instantly. Everything here is
 * generated with WebAudio at runtime: no files, no download, works offline.
 *
 * Browsers refuse to start an AudioContext outside a user gesture, so it is
 * created lazily on the first one and every call before that is a no-op.
 */

type Voice = 'click' | 'buy' | 'coin' | 'deny' | 'strain' | 'burst'
  | 'reveal' | 'raid' | 'good' | 'bad' | 'tick'

const MUTE_KEY = 'moonshine-run:muted'

class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private muted = false
  /** Rate-limits identical voices so held buttons do not machine-gun. */
  private lastAt: Partial<Record<Voice, number>> = {}

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1'
    } catch { /* private mode; default to on */ }
  }

  get isMuted(): boolean {
    return this.muted
  }

  /** Dev only: is the context open and running. */
  get state(): string {
    return this.ctx ? this.ctx.state : 'none'
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0') } catch { /* ignore */ }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02)
    }
  }

  /** Call from any user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    try {
      const Ctor = window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return

      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.5

      // A gentle ceiling so stacked sounds never clip.
      const limiter = this.ctx.createDynamicsCompressor()
      limiter.threshold.value = -10
      limiter.ratio.value = 12
      this.master.connect(limiter)
      limiter.connect(this.ctx.destination)
    } catch { /* audio is optional, never fatal */ }
  }

  play(voice: Voice): void {
    if (this.muted || !this.ctx || !this.master) return
    if (this.ctx.state === 'suspended') void this.ctx.resume()

    const now = this.ctx.currentTime
    const gap = voice === 'tick' ? 0.03 : 0.05
    if (this.lastAt[voice] !== undefined && now - this.lastAt[voice]! < gap) return
    this.lastAt[voice] = now

    switch (voice) {
      case 'click':  return this.blip(620, 0.05, 'triangle', 0.16)
      case 'tick':   return this.blip(1400, 0.02, 'square', 0.05)
      case 'buy':    return this.arp([440, 660], 0.09, 'triangle', 0.2)
      case 'coin':   return this.arp([880, 1320, 1760], 0.07, 'triangle', 0.16)
      case 'good':   return this.arp([523, 659, 784], 0.1, 'sine', 0.2)
      case 'deny':   return this.blip(150, 0.14, 'sawtooth', 0.14)
      case 'bad':    return this.arp([330, 247], 0.16, 'sawtooth', 0.16)
      case 'raid':   return this.siren()
      case 'strain': return this.rumble()
      case 'burst':  return this.burst()
      case 'reveal': return this.arp([523, 784, 1047, 1319], 0.11, 'triangle', 0.22)
    }
  }

  /** A crate that knows what is in it: pitch and brightness ride the rarity. */
  sting(rarityIndex: number): void {
    if (this.muted || !this.ctx) return
    const root = 392 * Math.pow(2, rarityIndex / 6)
    const chord = rarityIndex >= 3
      ? [root, root * 1.25, root * 1.5, root * 2]
      : [root, root * 1.25, root * 1.5]
    this.arp(chord, 0.1 + rarityIndex * 0.02, 'triangle', 0.18 + rarityIndex * 0.03)
  }

  // -- Primitives ----------------------------------------------------------

  private env(gain: GainNode, at: number, peak: number, attack: number, decay: number): void {
    // Ramps rather than steps: a square change in gain is an audible click.
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak, at + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  }

  private blip(freq: number, len: number, type: OscillatorType, peak: number, at?: number): void {
    const ctx = this.ctx!
    const t = at ?? ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    this.env(gain, t, peak, 0.005, len)

    osc.connect(gain)
    gain.connect(this.master!)
    osc.start(t)
    osc.stop(t + len + 0.05)
  }

  private arp(freqs: number[], step: number, type: OscillatorType, peak: number): void {
    const t = this.ctx!.currentTime
    freqs.forEach((f, i) => this.blip(f, step * 1.6, type, peak, t + i * step * 0.55))
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  /** The lid straining: filtered noise swelling upward. */
  private rumble(): void {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer(1.5)

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(110, t)
    filter.frequency.exponentialRampToValueAtTime(900, t + 1.45)
    filter.Q.value = 5

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.22, t + 1.4)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5)

    src.connect(filter); filter.connect(gain); gain.connect(this.master!)
    src.start(t); src.stop(t + 1.55)
  }

  /** The lid giving: a wide noise sweep under a low thump. */
  private burst(): void {
    const ctx = this.ctx!
    const t = ctx.currentTime

    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer(0.6)
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(400, t)
    filter.frequency.exponentialRampToValueAtTime(5000, t + 0.5)

    const gain = ctx.createGain()
    this.env(gain, t, 0.3, 0.01, 0.5)
    src.connect(filter); filter.connect(gain); gain.connect(this.master!)
    src.start(t); src.stop(t + 0.62)

    const thump = ctx.createOscillator()
    const tg = ctx.createGain()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(140, t)
    thump.frequency.exponentialRampToValueAtTime(45, t + 0.3)
    this.env(tg, t, 0.4, 0.005, 0.3)
    thump.connect(tg); tg.connect(this.master!)
    thump.start(t); thump.stop(t + 0.4)
  }

  /** Two tones wobbling against each other. Unpleasant on purpose. */
  private siren(): void {
    const ctx = this.ctx!
    const t = ctx.currentTime
    for (const [freq, delay] of [[740, 0], [560, 0.22], [740, 0.44]] as const) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(freq, t + delay)
      this.env(gain, t + delay, 0.18, 0.02, 0.2)
      osc.connect(gain); gain.connect(this.master!)
      osc.start(t + delay); osc.stop(t + delay + 0.28)
    }
  }
}

export const sfx = new Sfx()

// Reachable from the console during development, for checking that the
// context actually opened and that each voice sounds like something.
if (import.meta.env.DEV) {
  ;(globalThis as unknown as Record<string, unknown>).__sfx = sfx
}

/** Wire the first gesture anywhere in the app to unlocking audio. */
export function installAudioUnlock(): () => void {
  const go = () => sfx.unlock()
  const opts = { passive: true } as const

  window.addEventListener('pointerdown', go, opts)
  window.addEventListener('keydown', go, opts)

  return () => {
    window.removeEventListener('pointerdown', go)
    window.removeEventListener('keydown', go)
  }
}
