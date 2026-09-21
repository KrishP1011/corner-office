import { useState } from 'react'
import { engine, useGame, type NodeView } from '../store/gameStore'
import { fmt, fmtMoney, fmtDuration } from '../engine/bignum'
import { Meter } from './bits'
import { sfx } from '../audio/sfx'
import { emitFloat } from './juice'

/**
 * The permanent half of the game: Connections, and the decision to cash out.
 *
 * Lives at the top of the Kit tab because it belongs with the other thing
 * that survives a run.
 */
export function LegacyCard() {
  const g = useGame()
  const [showTree, setShowTree] = useState(false)
  const [showOut, setShowOut] = useState(false)

  const spendable = g.connectionNodes.filter((n) => n.affordable).length
  const progress = g.prestigeNeed.gt(g.clean)
    ? g.clean.div(g.prestigeNeed).toNumber() * 100
    : 100

  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-cream-dim text-[10px] uppercase tracking-[0.14em]">
          {g.strings.prestigeCurrency}
        </span>
        <span className="tnum text-brass-400 text-lg font-semibold">
          {fmt(g.connections)}
        </span>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[10px]">
          <span className="text-cream-dim uppercase tracking-[0.14em]">
            {g.strings.prestigeLabel}
          </span>
          <span className="tnum text-cream-dim">
            {fmtMoney(g.clean)} / {fmtMoney(g.prestigeNeed)}
          </span>
        </div>
        <Meter pct={progress} tone={g.canPrestige ? 'ok' : 'brass'} />
      </div>

      <div className="mt-3 flex gap-2">
        <button className="btn flex-1" onClick={() => setShowTree(true)}>
          The book
          {spendable > 0 && (
            <span
              className="ml-1 h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--color-brass-400)' }}
            />
          )}
        </button>
        <button
          className={`btn flex-1 ${g.canPrestige ? 'btn-brass' : ''}`}
          disabled={!g.canPrestige}
          onClick={() => setShowOut(true)}
        >
          {g.strings.prestigeLabel}
        </button>
      </div>

      {showTree && <ConnectionsModal onClose={() => setShowTree(false)} />}
      {showOut && <GetOutModal onClose={() => setShowOut(false)} />}
    </div>
  )
}

function ConnectionsModal({ onClose }: { onClose: () => void }) {
  const g = useGame()

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm sm:items-center">
      <div className="panel max-h-[85vh] w-full max-w-sm overflow-y-auto p-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="display text-brass-400 text-sm uppercase tracking-[0.16em]">
            The book
          </span>
          <button onClick={onClose} className="text-cream-dim hover:text-cream px-1">✕</button>
        </div>
        <p className="text-cream-dim mb-4 text-[11px] leading-relaxed">
          Names and favours owed, carried from one identity to the next.
          You have <span className="text-brass-400 tnum">{fmt(g.connections)}</span>{' '}
          to spend.
        </p>

        <div className="space-y-2">
          {g.connectionNodes.map((n) => <NodeRow key={n.node.id} n={n} />)}
        </div>
      </div>
    </div>
  )
}

function NodeRow({ n }: { n: NodeView }) {
  const pct = (n.level / n.node.maxLevel) * 100

  return (
    <div className="panel-raised p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-cream text-xs">{n.node.name}</div>
          <p className="text-cream-dim mt-0.5 text-[10px] leading-relaxed">{n.node.what}</p>
        </div>
        <button
          className={`btn shrink-0 px-2.5 py-1 text-[11px] ${n.affordable ? 'btn-brass' : ''}`}
          disabled={!n.affordable}
          onClick={() => { if (engine.spendConnection(n.node.id)) sfx.play('buy') }}
        >
          {n.maxed ? 'done' : n.cost}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="tnum text-cream-dim shrink-0 text-[10px]">
          {n.level}/{n.node.maxLevel}
        </span>
        <div className="flex-1">
          <Meter pct={pct} tone={n.maxed ? 'ok' : 'brass'} />
        </div>
      </div>
    </div>
  )
}

function GetOutModal({ onClose }: { onClose: () => void }) {
  const g = useGame()
  const [confirmed, setConfirmed] = useState(false)

  const done = () => {
    const payout = g.prestigePayout
    if (engine.prestige()) {
      sfx.play('reveal')
      emitFloat(`+${fmt(payout)} ${g.strings.prestigeCurrency.toLowerCase()}`, 'brass')
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-sm p-5">
        <div className="display text-brass-400 text-center text-lg tracking-wide">
          {g.strings.prestigeLabel}
        </div>
        <div className="rule-brass my-4 h-px w-full opacity-60" />

        <p className="text-cream-dim text-center text-xs leading-relaxed">
          The money goes offshore and you come back as somebody else, with
          better contacts and no history.
        </p>

        <div className="mt-5 space-y-2.5">
          <Row label="This identity ran" value={fmtDuration(g.runAgeSeconds)} />
          <Row label="Banked in total" value={fmtMoney(g.cleanEarnedThisRun)} />
          <Row
            label={g.strings.prestigeCurrency}
            value={`+${fmt(g.prestigePayout)}`}
            tone="var(--color-brass-400)"
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--color-ink-600)] pt-4 text-[11px]">
          <div>
            <div className="text-ok mb-1.5 text-[10px] uppercase tracking-[0.14em]">You keep</div>
            <ul className="text-cream-dim space-y-0.5 leading-relaxed">
              <li>the kit, at its levels</li>
              <li>unopened crates</li>
              <li>{g.strings.prestigeCurrency.toLowerCase()} and the book</li>
              <li>everyone you have met</li>
            </ul>
          </div>
          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--color-danger)' }}>
              You lose
            </div>
            <ul className="text-cream-dim space-y-0.5 leading-relaxed">
              <li>every dollar, both kinds</li>
              <li>the stills and their levels</li>
              <li>rooms, fronts, corners</li>
              <li>the payroll</li>
            </ul>
          </div>
        </div>

        {!confirmed ? (
          <div className="mt-6 flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={onClose}>Not yet</button>
            <button className="btn btn-brass flex-1" onClick={() => setConfirmed(true)}>
              Get out
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <p className="mb-3 text-center text-[11px]" style={{ color: 'var(--color-warn)' }}>
              This ends the run. There is no going back to it.
            </p>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => setConfirmed(false)}>
                Wait
              </button>
              <button className="btn btn-brass flex-1" onClick={done}>
                Walk away
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-cream-dim text-xs uppercase tracking-[0.12em]">{label}</span>
      <span className="tnum text-sm font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </span>
    </div>
  )
}
