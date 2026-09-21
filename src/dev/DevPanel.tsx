import { useEffect, useState } from 'react'
import { engine, useGame, useUi } from '../store/gameStore'
import { fmtDuration, fmtMoney } from '../engine/bignum'

/**
 * Dev panel.
 *
 * DESIGN.md calls this out as day-one work, not a nice-to-have: balancing a
 * curve that spans 1e0 to 1e12 is not possible without being able to skip
 * time. Toggle with the backtick key.
 */
export function DevPanel() {
  const { devOpen, toggleDev } = useUi()
  const g = useGame()
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~') {
        e.preventDefault()
        toggleDev()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleDev])

  const say = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(null), 1800)
  }

  if (!devOpen) {
    return (
      <button
        onClick={toggleDev}
        className="btn btn-ghost fixed bottom-20 right-3 z-40 px-2 py-1 text-[10px] opacity-40 hover:opacity-100"
        title="Dev panel (`)"
      >
        DEV
      </button>
    )
  }

  const skip = (seconds: number) => {
    const r = engine.devSkip(seconds)
    say(`+${fmtMoney(r.revenue)}${r.raided ? ' · RAIDED' : ''}`)
  }

  return (
    <div className="panel fixed bottom-20 right-3 z-40 w-64 p-3 text-[11px]">
      <div className="mb-2 flex items-center justify-between">
        <span className="display text-brass-400 text-[11px] uppercase tracking-[0.16em]">Dev</span>
        <button onClick={toggleDev} className="text-cream-dim hover:text-cream px-1">✕</button>
      </div>

      <Group label="Skip time">
        {([['1m', 60], ['10m', 600], ['1h', 3600], ['6h', 21600], ['1d', 86400]] as const).map(
          ([label, secs]) => (
            <button key={label} className="btn px-2 py-1 text-[10px]" onClick={() => skip(secs)}>
              {label}
            </button>
          ),
        )}
      </Group>

      <Group label="Cash">
        <button className="btn px-2 py-1 text-[10px]" onClick={() => { engine.devAddDirty(1e6); say('+$1M loose') }}>
          +1M loose
        </button>
        <button className="btn px-2 py-1 text-[10px]" onClick={() => { engine.devAddClean(1e6); say('+$1M banked') }}>
          +1M banked
        </button>
        <button className="btn px-2 py-1 text-[10px]" onClick={() => { engine.devAddClean(1e12); say('+$1T banked') }}>
          +1T banked
        </button>
      </Group>

      <Group label={g.strings.heatLabel}>
        {[0, 45, 70, 95].map((h) => (
          <button key={h} className="btn px-2 py-1 text-[10px]" onClick={() => engine.devSetHeat(h)}>
            {h}
          </button>
        ))}
      </Group>

      <Group label="Unlock">
        <button className="btn px-2 py-1 text-[10px]" onClick={() => { engine.devUnlockAll(); say('all unlocked') }}>
          everything
        </button>
        <button className="btn px-2 py-1 text-[10px]" onClick={() => { engine.devGrantDuffels(5); say('+5 of each crate') }}>
          +5 crates
        </button>
        <button className="btn px-2 py-1 text-[10px]" onClick={() => { engine.devUnlockAutoRun(); say('auto-run unlocked') }}>
          auto-run
        </button>
      </Group>

      <Group label="Save">
        <button
          className="btn px-2 py-1 text-[10px]"
          onClick={() => { navigator.clipboard?.writeText(engine.devExport()); say('copied to clipboard') }}
        >
          export
        </button>
        <button
          className="btn px-2 py-1 text-[10px]"
          onClick={async () => {
            const text = await navigator.clipboard?.readText()
            say(text && engine.devImport(text) ? 'imported' : 'import failed')
          }}
        >
          import
        </button>
        <button
          className="btn px-2 py-1 text-[10px] text-[var(--color-danger)]"
          onClick={() => { if (confirm('Wipe the save?')) { engine.devReset(); say('wiped') } }}
        >
          wipe
        </button>
      </Group>

      <div className="text-cream-dim mt-2 border-t border-[var(--color-ink-600)] pt-2 leading-relaxed">
        <div className="tnum">played {fmtDuration(g.playSeconds)}</div>
        <div className="tnum">cap {fmtMoney(g.dirtyCap)}</div>
        <div className="tnum">crates {g.duffels.street}/{g.duffels.safe}/{g.duffels.armored}</div>
      </div>

      {flash && <div className="text-brass-400 mt-2 tnum">{flash}</div>}
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="text-cream-dim mb-1 text-[9px] uppercase tracking-[0.14em]">{label}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  )
}
