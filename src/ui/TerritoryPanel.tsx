import { useGame } from '../store/gameStore'
import { SectionTitle, Meter, Empty } from './bits'

export function TerritoryPanel() {
  const g = useGame()
  const open = g.blocks.filter((b) => b.unlocked)
  const closed = g.blocks.filter((b) => !b.unlocked)

  const byDistrict = new Map<string, typeof open>()
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

      {[...byDistrict.entries()].map(([district, list]) => (
        <div key={district} className="panel p-4">
          <div className="display text-brass-400 mb-3 text-xs uppercase tracking-[0.16em]">
            {district}
          </div>
          <div className="space-y-3">
            {list.map((b) => (
              <div key={b.def.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-cream text-sm">{b.def.name}</span>
                  <span
                    className="tnum text-[11px]"
                    style={{ color: b.accepting ? 'var(--color-ok)' : 'var(--color-danger)' }}
                  >
                    {b.accepting
                      ? `${Math.round(b.customers)} buyers`
                      : `walking away · wants ${b.def.minPurity}+`}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Meter
                    pct={b.ceiling > 0 ? (b.customers / b.ceiling) * 100 : 0}
                    tone={b.accepting ? 'brass' : 'danger'}
                  />
                </div>
                <div className="text-cream-dim mt-1 flex justify-between text-[10px]">
                  <span>takes {b.def.wants.join(', ')}</span>
                  <span className="tnum">
                    {g.strings.purityShort} {b.def.minPurity}+ · {b.def.priceMod.toFixed(2)}x price
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {closed.length > 0 && (
        <div className="panel p-4">
          <div className="text-cream-dim mb-2 text-[10px] uppercase tracking-[0.14em]">
            Not yet
          </div>
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
