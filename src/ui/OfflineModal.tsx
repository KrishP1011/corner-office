import { useState } from 'react'
import { engine } from '../store/gameStore'
import { fmtMoney, fmt, fmtDuration } from '../engine/bignum'

/**
 * Welcome-back summary. Deliberately also reports the bad news -- if the
 * revenuers came through while you were gone, that is the most important
 * thing on the screen.
 */
export function OfflineModal() {
  const summary = engine.offlineSummary
  const [dismissed, setDismissed] = useState(false)
  if (!summary || dismissed) return null

  const { seconds, cappedAt, report } = summary
  const wasCapped = seconds > cappedAt

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-sm p-6">
        <div className="display text-brass-400 text-center text-lg tracking-wide">
          While you were out
        </div>
        <div className="rule-brass my-4 h-px w-full opacity-60" />

        <div className="text-cream-dim text-center text-xs">
          {fmtDuration(seconds)} away
          {wasCapped && (
            <span className="text-warn"> · only {fmtDuration(cappedAt)} of it counted</span>
          )}
        </div>

        <div className="mt-5 space-y-3">
          <Row label="Took in" value={fmtMoney(report.revenue)} tone="var(--color-money)" />
          <Row label="Moved" value={`${fmt(report.unitsSold)} units`} />
          {report.duffelsEarned > 0 && (
            <Row label="Crates found" value={String(report.duffelsEarned)} tone="var(--color-brass-400)" />
          )}
          {report.raided && (
            <Row
              label="Raided"
              value={`-${fmtMoney(report.raidLoss)} and a third of the stock`}
              tone="var(--color-danger)"
            />
          )}
        </div>

        {wasCapped && (
          <p className="text-cream-dim mt-5 text-center text-[11px] leading-relaxed">
            A still only runs so long unattended. Better gear buys you more hours.
          </p>
        )}

        <button className="btn btn-brass mt-6 w-full" onClick={() => setDismissed(true)}>
          Back to work
        </button>
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
