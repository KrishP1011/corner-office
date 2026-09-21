import type { ReactNode } from 'react'

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="display text-brass-400 text-sm uppercase tracking-[0.18em]">{children}</h2>
      {hint && <span className="text-cream-dim text-xs">{hint}</span>}
    </div>
  )
}

export function Rule() {
  return <div className="rule-brass my-3 h-px w-full opacity-50" />
}

export function Meter({ pct, tone = 'brass' }: { pct: number; tone?: 'brass' | 'ok' | 'warn' | 'danger' }) {
  const colors: Record<string, string> = {
    brass: 'var(--color-brass-400)',
    ok: 'var(--color-ok)',
    warn: 'var(--color-warn)',
    danger: 'var(--color-danger)',
  }
  return (
    <div className="meter">
      <span style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: colors[tone] }} />
    </div>
  )
}

export function Stat({
  label, value, sub, tone,
}: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-cream-dim text-[10px] uppercase tracking-[0.14em]">{label}</div>
      <div className="tnum truncate text-lg font-semibold leading-tight" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="tnum text-cream-dim truncate text-[11px]">{sub}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="panel text-cream-dim p-8 text-center text-sm">
      {children}
    </div>
  )
}
