import { engine, useGame, type BlockView } from '../store/gameStore'
import { fmtMoney } from '../engine/bignum'
import { SectionTitle, Meter, Empty } from './bits'

export function TerritoryPanel() {
  const g = useGame()
  const open = g.blocks.filter((b) => b.unlocked)
  const closed = g.blocks.filter((b) => !b.unlocked)

  const byDistrict = new Map<string, BlockView[]>()
  for (const b of open) {
    const list = byDistrict.get(b.def.district) ?? []
    list.push(b)
    byDistrict.set(b.def.district, list)
  }

  if (open.length === 0) {
    return <Empty>No routes open yet. Get a line running first.</Empty>
  }

  return (
    <div className="space-y-4">
      <SectionTitle hint={`${open.length} of ${g.blocks.length} open`}>Territory</SectionTitle>

      {g.contestedCount > 0 && (
        <div className="panel border-[var(--color-danger)] p-3 text-[11px] leading-relaxed" style={{ color: 'var(--color-danger)' }}>
          {g.contestedCount === 1 ? 'A corner has' : `${g.contestedCount} corners have`} been taken.
          Nothing sells there until you take {g.contestedCount === 1 ? 'it' : 'them'} back.
        </div>
      )}

      <div className="panel text-cream-dim p-4 text-xs leading-relaxed">
        Every corner is under pressure from somebody. Dealers move more
        product <span className="text-cream">and</span> hold the ground —
        muscle on the payroll defends all of them at once.
      </div>

      {[...byDistrict.entries()].map(([district, list]) => (
        <div key={district} className="panel p-4">
          <div className="display text-brass-400 mb-3 text-xs uppercase tracking-[0.16em]">
            {district}
          </div>
          <div className="space-y-4">
            {list.map((b) => <BlockRow key={b.def.id} b={b} />)}
          </div>
        </div>
      ))}

      {closed.length > 0 && (
        <div className="panel p-4">
          <div className="text-cream-dim mb-2 text-[10px] uppercase tracking-[0.14em]">Not yet</div>
          <div className="space-y-1">
            {closed.map((b) => (
              <div key={b.def.id} className="flex items-baseline justify-between text-sm">
                <span className="text-cream-dim">{b.def.district} · {b.def.name}</span>
                <span className="text-cream-dim text-[11px]">wants {b.def.wants.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BlockRow({ b }: { b: BlockView }) {
  const g = useGame()
  const holding = b.pressurePerMin <= 0

  return (
    <div className={b.contested ? 'opacity-90' : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-cream text-sm">{b.def.name}</span>
        {b.contested ? (
          <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--color-danger)' }}>
            taken
          </span>
        ) : (
          <span
            className="tnum text-[11px]"
            style={{ color: b.accepting ? 'var(--color-ok)' : 'var(--color-danger)' }}
          >
            {b.accepting
              ? `${Math.round(b.customers)} buyers`
              : `walking away · wants ${b.def.minPurity}+`}
          </span>
        )}
      </div>

      {!b.contested && (
        <div className="mt-1.5">
          <Meter
            pct={b.ceiling > 0 ? (b.customers / b.ceiling) * 100 : 0}
            tone={b.accepting ? 'brass' : 'danger'}
          />
        </div>
      )}

      {/* Who is leaning on this corner ----------------------------------- */}
      <div className="mt-2">
        <div className="mb-1 flex justify-between text-[10px]">
          <span className="text-cream-dim uppercase tracking-[0.14em]">Pressure</span>
          <span
            className="tnum"
            style={{ color: b.contested ? 'var(--color-danger)' : holding ? 'var(--color-ok)' : 'var(--color-warn)' }}
          >
            {b.contested
              ? 'lost'
              : holding
                ? 'holding'
                : `+${b.pressurePerMin.toFixed(1)}/min`}
          </span>
        </div>
        <Meter
          pct={b.rivalPressure}
          tone={b.contested ? 'danger' : b.rivalPressure > 60 ? 'warn' : 'ok'}
        />
      </div>

      <div className="text-cream-dim mt-1.5 flex items-center justify-between text-[10px]">
        <span>
          {b.dealers}/{b.def.dealerSlots} dealers · {b.defense.toFixed(0)} muscle
        </span>
        <span className="tnum">
          {g.strings.purityShort} {b.def.minPurity}+ · {b.def.priceMod.toFixed(2)}x
        </span>
      </div>

      <div className="mt-2">
        {b.contested ? (
          <button
            className="btn btn-brass w-full py-1.5 text-[11px]"
            disabled={g.dirty.lt(g.retakeCost)}
            onClick={() => engine.retakeBlock(b.def.id)}
          >
            Take it back · {fmtMoney(g.retakeCost)}
          </button>
        ) : b.canAddDealer ? (
          <button
            className="btn w-full py-1.5 text-[11px]"
            disabled={g.dirty.lt(g.dealerCost)}
            onClick={() => engine.addDealer(b.def.id)}
          >
            Put another dealer on · {fmtMoney(g.dealerCost)}
          </button>
        ) : (
          <div className="text-cream-dim text-center text-[10px]">
            {b.dealers >= b.def.dealerSlots ? 'fully staffed' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
