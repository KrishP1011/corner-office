# Corner Office

An active idle tycoon game. You start selling cider out of a backwoods shack
and end up running a continental supply chain from an island three miles
offshore. Between those two points you make one decision over and over, and
it is always interesting: **how much do you water it down?**

More cut means more units means more money right now. It also means more
transactions, which means more heat, and customers who wanted better walk
away. Every batch, every district, every tier re-asks that question with
different numbers.

The first release ships as **Moonshine Run**, a Prohibition bootlegging
theme. See [DESIGN.md](DESIGN.md) for the full design and
[section 15](DESIGN.md#15-theme-swap) for how the theme is swapped.

---

## Running it

```bash
npm install
npm run dev
```

Opens on http://localhost:5183.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run typecheck` | Types only |
| `npx tsx tools/simcheck.ts` | Headless balance harness (see below) |

**Dev panel:** press `` ` `` in a dev build. Skip time, add cash, set heat,
unlock everything, export/import saves. It is excluded from production
builds. Balancing a curve that spans 1e0 to 1e12 is not possible without a
time-skip button, so this shipped on day one rather than at the end.

---

## Architecture

The one decision that matters: **the simulation does not live in React.**

```
src/
  engine/        pure TypeScript, no React, no DOM
    bignum.ts      mantissa/exponent wrapper -- values pass 1e308
    balance.ts     every tunable number in the game, in one file
    content.ts     theme loader + validation
    economy.ts     the cut math, pricing, heat, laundering, prestige
    tick.ts        the simulation step
    state.ts       initial state and the prestige reset
    save.ts        serialization, migrations, localStorage
    engine.ts      owns the world; exposes commands and a subscribe()
  content/
    moonshine/     products, districts, fronts, locations, items, crew, strings
  store/           snapshot bridge to React (useSyncExternalStore)
  ui/              components; they read a snapshot and never mutate state
  dev/             dev panel
tools/
  simcheck.ts      headless balance harness
```

The engine mutates its own state and publishes an immutable snapshot at
4Hz. React renders from the snapshot, so a 10Hz simulation does not become a
10Hz render of every panel.

**Time is never trusted to the timer.** Every step derives `dt` from the wall
clock, so a throttled background tab produces fewer, larger steps rather than
lost progress — and offline catch-up runs through the exact same code path,
because two code paths would drift apart and players would find the gap.

---

## Balance

All tuning lives in [`src/engine/balance.ts`](src/engine/balance.ts) and the
content JSON. Nothing else should contain a magic number.

To see the effect of a change without clicking through six tiers:

```bash
npx tsx tools/simcheck.ts
```

It runs the real engine headlessly and asserts the properties the design
depends on — that cutting harder always earns more and always runs hotter,
that clean cash can flow without owning a front, that the second product is
reachable in a first session, and that saves survive a round trip past 1e40.

---

## Content and themes

The engine never hardcodes a product, district, or front. Everything is data
under `src/content/<theme>/`, so the whole game reskins by pointing the
loader at a different folder. `content.ts` validates a pack at boot and
throws with a list of problems rather than failing quietly at runtime.

---

## Minigames

Each product above cider has its own minigame, and each buys something
different -- output, proof, or quiet -- so each is worth learning. A run
grants a five-minute bonus that applies to everything the line produces,
which is what makes active play worth roughly 3x idle without making idle
feel punished. A failed run still leaves a sliver, so attempting one is
never worse than skipping it.

After 50 completions a product's **auto-run** toggle unlocks and holds half
a perfect result indefinitely. Active play stays better; the grind is
optional.

Simulation state inside a minigame lives in a ref (`useGameState`), not in
`useState`. React invokes state updaters more than once under StrictMode and
concurrent rendering, so anything with a side effect in an updater
double-counts.

## Status

Parts 1-2 of a seven-part build. Engine, economy, save system, content
pipeline, dev tooling, the five minigames, and the production / territory /
fronts / locations screens are in. Still to come: the Loadout and crates,
crew, the territory map proper, prestige UI, and the juice pass.
