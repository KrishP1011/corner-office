import { engine, useGame, RARITY_COLOR, RARITY_LABEL, STAT_LABEL, type CrewView, type RoleView } from '../store/gameStore'
import { fmtMoney } from '../engine/bignum'
import { BALANCE } from '../engine/balance'
import { formatStat } from './CrateOpen'
import { Meter, SectionTitle } from './bits'
import type { PayLevel, StatKey } from '../engine/types'

const PAY: { level: PayLevel; label: string }[] = [
  { level: 'short', label: 'Short' },
  { level: 'fair', label: 'Fair' },
  { level: 'generous', label: 'Generous' },
]

export function CrewPanel() {
  const g = useGame()
  const hiredCount = g.crew.filter((r) => r.hired).length
  const atRisk = g.crew.filter((r) => r.hired?.atRisk).length

  return (
    <div className="space-y-3">
      <SectionTitle hint={`${hiredCount} of ${g.crew.length} roles filled`}>
        The payroll
      </SectionTitle>

      <div className="panel p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-cream-dim text-[10px] uppercase tracking-[0.14em]">
            Going out every minute
          </span>
          <span className="tnum text-lg font-semibold" style={{ color: 'var(--color-money)' }}>
            {fmtMoney(g.payroll)}
          </span>
        </div>
        <p className="text-cream-dim mt-2 text-[11px] leading-relaxed">
          Wages come out of loose cash. Pay short and people remember it; let
          loyalty fall under {BALANCE.SNITCH_THRESHOLD} and they start weighing
          what your operation is worth to somebody else.
        </p>
        {atRisk > 0 && (
          <div className="mt-3 rounded border border-[var(--color-danger)] bg-[rgba(209,72,60,0.08)] p-2.5 text-[11px]" style={{ color: 'var(--color-danger)' }}>
            {atRisk === 1 ? 'Someone on the payroll is' : `${atRisk} people are`} close to talking.
          </div>
        )}
      </div>

      {g.crew.map((role) => <RoleCard key={role.role} role={role} />)}
    </div>
  )
}

function RoleCard({ role }: { role: RoleView }) {
  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="display text-brass-400 text-xs uppercase tracking-[0.16em]">
          {role.label}
        </span>
        {!role.hired && (
          <span className="text-cream-dim text-[10px] uppercase tracking-[0.14em]">empty</span>
        )}
      </div>
      <p className="text-cream-dim mt-1 text-[11px] leading-relaxed">{role.what}</p>

      {role.hired ? (
        <HiredCard c={role.hired} />
      ) : (
        <div className="mt-3 space-y-2">
          {role.candidates.map((c) => <CandidateRow key={c.def.id} c={c} />)}
        </div>
      )}
    </div>
  )
}

function HiredCard({ c }: { c: CrewView }) {
  const color = RARITY_COLOR[c.def.rarity]

  return (
    <div className="panel-raised mt-3 p-3" style={{ borderColor: `${color}77` }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-cream text-sm">{c.def.name}</span>
        <span className="shrink-0 text-[9px] uppercase tracking-[0.14em]" style={{ color }}>
          {RARITY_LABEL[c.def.rarity]}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-3">
        {(Object.entries(c.def.stats) as [StatKey, number][]).map(([key, base]) => (
          <span key={key} className="tnum text-[10px]" style={{ color }}>
            {formatStat(key, base * c.effort)} {STAT_LABEL[key]}
          </span>
        ))}
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-baseline justify-between text-[10px]">
          <span className="text-cream-dim uppercase tracking-[0.14em]">Loyalty</span>
          <span
            className="tnum"
            style={{ color: c.atRisk ? 'var(--color-danger)' : c.loyalty > 60 ? 'var(--color-ok)' : 'var(--color-warn)' }}
          >
            {Math.round(c.loyalty)}
            {c.effort < 1 && <span className="text-cream-dim"> · working at {Math.round(c.effort * 100)}%</span>}
          </span>
        </div>
        <Meter
          pct={c.loyalty}
          tone={c.atRisk ? 'danger' : c.loyalty > 60 ? 'ok' : 'warn'}
        />
      </div>

      <div className="mt-3 flex items-center gap-1">
        {PAY.map((p) => (
          <button
            key={p.level}
            onClick={() => engine.setPayLevel(c.def.role, p.level)}
            className={`btn flex-1 py-1.5 text-[10px] ${c.payLevel === p.level ? 'btn-brass' : 'btn-ghost'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-baseline justify-between text-[11px]">
        <span className="tnum text-cream-dim">{fmtMoney(c.wage)}/min</span>
        <button
          className="text-cream-dim hover:text-[var(--color-danger)] text-[10px] uppercase tracking-[0.14em]"
          onClick={() => engine.fireCrew(c.def.role)}
        >
          Let go
        </button>
      </div>
    </div>
  )
}

function CandidateRow({ c }: { c: CrewView }) {
  const color = RARITY_COLOR[c.def.rarity]

  if (!c.known) {
    return (
      <div className="panel-raised p-3 opacity-45">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-cream-dim text-xs">{c.def.name}</span>
          <span className="tnum text-cream-dim shrink-0 text-[10px]">
            at {c.def.requiresLevels} levels
          </span>
        </div>
        <p className="text-cream-dim mt-1 text-[10px]">
          Will not take your call yet.
        </p>
      </div>
    )
  }

  return (
    <div className="panel-raised p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-cream truncate text-xs">{c.def.name}</span>
            <span className="shrink-0 text-[9px] uppercase tracking-[0.14em]" style={{ color }}>
              {RARITY_LABEL[c.def.rarity]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3">
            {(Object.entries(c.def.stats) as [StatKey, number][]).map(([key, base]) => (
              <span key={key} className="tnum text-[10px]" style={{ color }}>
                {formatStat(key, base)} {STAT_LABEL[key]}
              </span>
            ))}
          </div>
          <p className="text-cream-dim mt-1.5 text-[10px] italic leading-relaxed">{c.def.flavor}</p>
        </div>

        <button
          className="btn btn-brass shrink-0 text-[11px]"
          disabled={!c.canAfford}
          onClick={() => engine.hireCrew(c.def.id)}
        >
          {fmtMoney(c.hireCost)}
        </button>
      </div>
      <div className="tnum text-cream-dim mt-2 text-[10px]">
        then about {fmtMoney(c.wage)}/min
      </div>
    </div>
  )
}
