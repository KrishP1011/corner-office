import { useEffect } from 'react'
import { engine, useGame, useUi, type Tab } from './store/gameStore'
import { TopBar } from './ui/TopBar'
import { ProductionPanel } from './ui/ProductionPanel'
import { TerritoryPanel } from './ui/TerritoryPanel'
import { FrontsPanel } from './ui/FrontsPanel'
import { LawPanel } from './ui/LawPanel'
import { EventToast } from './ui/EventToast'
import { PlacesPanel } from './ui/PlacesPanel'
import { OfflineModal } from './ui/OfflineModal'
import { DevPanel } from './dev/DevPanel'

const TABS: { id: Tab; label: string }[] = [
  { id: 'production', label: 'Still' },
  { id: 'territory', label: 'Routes' },
  { id: 'law', label: 'Law' },
  { id: 'fronts', label: 'Wash' },
  { id: 'places', label: 'Places' },
]

export default function App() {
  const { tab, setTab } = useUi()
  const g = useGame()

  useEffect(() => {
    engine.start()
    return () => engine.stop()
  }, [])

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col">
      <TopBar />

      <main className="flex-1 px-3 pb-24 pt-4">
        {tab === 'production' && <ProductionPanel />}
        {tab === 'territory' && <TerritoryPanel />}
        {tab === 'law' && <LawPanel />}
        {tab === 'fronts' && <FrontsPanel />}
        {tab === 'places' && <PlacesPanel />}
      </main>

      {/* Bottom nav: thumb reach on a phone, which is where this gets played. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-ink-600)]
                   bg-[var(--color-ink-900)]/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-lg">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="relative flex-1 py-3 text-[10px] uppercase tracking-[0.1em] transition-colors"
                style={{ color: active ? 'var(--color-brass-400)' : 'var(--color-cream-dim)' }}
              >
                {t.label}
                {active && (
                  <span className="rule-brass absolute inset-x-4 top-0 h-px" />
                )}
                {t.id === 'fronts' && g.overCap && (
                  <span className="absolute right-1/4 top-2 h-1.5 w-1.5 rounded-full bg-[var(--color-danger)]" />
                )}
                {t.id === 'law' && (g.band.band === 'hot' || g.band.band === 'burned') && (
                  <span
                    className="pulse-warn absolute right-1/4 top-2 h-1.5 w-1.5 rounded-full"
                    style={{ background: 'var(--color-danger)' }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </nav>

      <EventToast />
      <OfflineModal />
      {import.meta.env.DEV && <DevPanel />}
    </div>
  )
}
