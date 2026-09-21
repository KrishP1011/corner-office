# Corner Office — v1 Design Doc

**Genre:** Active idle / tycoon
**Platform:** Web (desktop + mobile browser), itch.io first
**Build target:** 7 days
**Status:** Design locked, not started

---

## 0. The pitch

You start selling loose cigarettes out of a trailer. You end up running a
continental supply chain from an offshore compound. Between those two points
you make one decision over and over, thousands of times, and it is always
interesting:

**How much do you cut it?**

More cut means more units means more money right now. It also means more
transactions, which means more heat, and it means customers who wanted better
walk away. Every batch, every district, every tier of the game re-asks that
question with different numbers.

Around that spine sits a tycoon layer (labs, locations, fronts, territory,
crew) and a persistent meta layer (the Loadout) that survives every reset.

### Design rules

1. **No real chemistry.** No recipes, no precursors, no procedures. Production
   is abstracted into timing and balance minigames. This is a policy
   requirement and a design improvement — Schedule I does exactly this.
2. **Never passive.** There is always a decision available. Idle is the floor,
   not the ceiling. Active play should be worth ~3x idle.
3. **Content is data.** The engine never knows what a "product" is. Theme
   lives in `/content/<theme>/*.json` so the whole game reskins from a folder.
4. **Everything visible in v1.** Locked content is shown greyed with its
   unlock condition. Seeing Meth sitting at the bottom of the tier list is
   itself motivation.

---

## 1. Core loop

```
PRODUCE  ->  CUT  ->  DISTRIBUTE  ->  LAUNDER  ->  REINVEST
   ^                      |                            |
   |                      v                            v
   +-------------------- HEAT <------------------ GEAR / CREW
```

- **Produce** — stations run cycles, each tier has its own minigame
- **Cut** — set purity, trade volume against heat and churn
- **Distribute** — assign product to districts with different demand profiles
- **Launder** — dirty cash to clean cash through front businesses
- **Reinvest** — stations, locations, fronts, crew, territory
- **Heat** — the pressure system that makes all of it risky

---

## 2. The Cut mechanic (core)

Every batch has a purity `P`, set by a slider, range 10%–100%.

```
units    = baseYield * (100 / P)
price    = basePrice * (P / 50)^0.6
revenue  = units * price          ->  proportional to P^-0.4
heat     = heatPerUnit * units * (1 - heatResist)
```

**What that means in play:**

| Cut to | Units | Price/unit | Revenue | Heat |
|---|---|---|---|---|
| 100% (pure) | 1.0x | 1.52x | 1.00x | 1.0x |
| 50% | 2.0x | 1.00x | 1.32x | 2.0x |
| 25% | 4.0x | 0.66x | 1.74x | 4.0x |
| 10% | 10.0x | 0.38x | 2.51x | 10.0x |

Cutting always makes more money. Cutting always makes proportionally more
heat. That is the whole tension and it never stops being true.

### The brake: customer tolerance

Every district has a `minPurity`. Sell below it and:
- That district's customer count decays 15%/min while you stay below
- Below `minPurity - 20`, bad-batch events fire: customer deaths, heat spike

### Purity Floor (gear stat)

Gear with `+X% Purity Floor` raises the **perceived** purity of a batch.
`effectiveP = P + purityFloor`. A batch cut to 25% with +20 floor reads as
45% to customers. This is why gear matters — it lets you cut harder than the
market should allow. It is the single most valuable stat in the game and the
progression is built around chasing it.

---

## 3. Products (6 tiers, all in v1)

| # | Product | Unlock | Base unit $ | Cycle | Minigame |
|---|---|---|---|---|---|
| 1 | Tobacco | start | $2 | 8s | none (tutorial) |
| 2 | Weed | $5K | $25 | 45s | 3-slider balance |
| 3 | Shrooms | $250K | $180 | 2m | contamination tap |
| 4 | Pills | $8M | $1,400 | 4m | press timing bar |
| 5 | Coke | $400M | $12,000 | 8m | smuggling route |
| 6 | Meth | $25B | $95,000 | 15m | stability bar |

### Minigames

Each is ~30-60 lines. Success grants a **quality bonus** (+10-40% yield or
+15 effective purity for that batch). Failing is never punishing, just
neutral — the minigame is upside for active play, not a tax on idle play.

1. **Weed** — three sliders (light / water / nutrients), each has a hidden
   green zone that shifts per strain. Land all three: +30% yield.
2. **Shrooms** — contamination spores appear over 10s, tap to clear before
   they spread. Miss three and the batch halves.
3. **Pills** — a bar sweeps, tap in the sweet spot three times. Perfect x3:
   +25 effective purity.
4. **Coke** — pick a route across a 5x5 grid, each tile shows a checkpoint
   risk. Cleaner route = less heat, longer route = slower delivery.
5. **Meth** — a needle drifts, tap to correct, keep it in the green band for
   15 seconds. Drift out and the batch quality drops per second outside.

### Stations

Each product runs on stations. Upgrade cost `base * 1.12^n`.
Output +1 unit/level, with **x2 milestone doublings at levels 25, 50, 100,
200, 400.** Milestones are the satisfying spikes — do not cut them.

---

## 4. Heat

Range 0–100. The pressure system and the reason to open the app.

| Band | Range | Effect |
|---|---|---|
| Cold | 0–30 | nothing |
| Warm | 30–60 | undercover buys, lose 2% of sales |
| Hot | 60–85 | 5%/min raid chance |
| Burned | 85–100 | 25%/min raid chance, rivals contest territory faster |

**Decay:** 0.5/min base. Lawyers, fronts, and bribes improve it.

**Raid outcome:** lose 30% inventory + 20% dirty cash. Lawyer crew and the
Jacket slot reduce both. **Surviving a raid at Hot or above grants a
guaranteed Duffel** — that is the risk/reward pull that makes running hot
tempting instead of purely bad.

### Offline heat — the retention hook

Heat decays at only **0.2/min while offline**, and **raids still fire.**
Logging off Burned means you may come back robbed. This inverts the usual
idle problem where being away is free money, and it is what makes people
open the app.

The Lieutenant (crew or IAP) manages heat while away. That is the honest
value of that purchase.

---

## 5. Dirty and clean cash

All sales pay in **dirty cash**. Fronts convert it to **clean cash** at a
capped rate.

- **Dirty buys:** stations, street upgrades, bribes, crew wages
- **Clean buys:** locations, fronts, lab equipment, legal defense, prestige
- **Hoarding penalty:** dirty cash above a cap generates passive heat. You
  cannot sit on a pile. This forces laundering and prevents the classic idle
  degenerate strategy of banking everything.

### Fronts (4 in v1)

| Front | Cost (clean) | Rate | Cap |
|---|---|---|---|
| Laundromat | $50K | 5%/min | $10K |
| Car Wash | $2M | 8%/min | $500K |
| Vape Shop | $150M | 12%/min | $50M |
| Crypto Mine | $10B | 20%/min | $5B |

---

## 6. Locations (6 in v1)

| # | Location | Cost (clean) | Stations | Heat mod | Unlocks |
|---|---|---|---|---|---|
| 1 | Trailer | start | 2 | +0% | Tobacco, Weed |
| 2 | Apartment | $25K | 3 | +5% | Shrooms |
| 3 | House Basement | $1.2M | 4 | +10% | Pills |
| 4 | Warehouse | $80M | 6 | +20% | Coke |
| 5 | Industrial Lab | $6B | 8 | +35% | Meth |
| 6 | Offshore Compound | $400B | 10 | **-20%** | endgame |

Bigger is not strictly better — heat modifiers mean a fat operation with weak
fronts is a flashing light. The Offshore Compound reversing the trend is the
reward for reaching the top.

---

## 7. Territory (12 blocks in v1)

A 4x3 city grid. Assign dealers to blocks; each block has a demand profile.

| District | Tiles | Wants | minPurity | Volume | Price |
|---|---|---|---|---|---|
| The Blocks | 3 | Weed, Pills | 15% | very high | low |
| Campus | 2 | Weed, Shrooms, Pills | 35% | high | medium |
| The Strip | 3 | Coke, Pills | 55% | medium | high |
| The Heights | 2 | Coke | 80% | low | extreme |
| Industrial | 2 | Meth | 25% | very high | medium |

This is where the cut slider stops being one decision and becomes a portfolio
problem. You want to run the Blocks at 15% and the Heights at 90%, which
means either separate batches or gear that raises your floor enough to serve
both from one.

**Rivals** contest blocks over time. Enforcer crew and the Piece slot defend.
Losing a block loses its income until retaken.

---

## 8. The Loadout (meta progression)

Eatventure-style gear. **This is the system that survives prestige**, and
therefore the reason to prestige at all.

### 8 slots

| Slot | Biased stats |
|---|---|
| Watch | Production speed, Offline cap |
| Chain | Price, street rep |
| Burner | Customer acquisition |
| Piece | Territory defense |
| Ride | Distribution speed |
| Briefcase | Launder rate |
| Jacket | Heat resist |
| Kicks | Dealer efficiency |

### 6 stats

Yield · **Purity Floor** · Price · Heat Resist · Launder Rate · Offline Cap

### 5 rarities, 48 items in v1

6 items per slot: 2 Street, 1 Solid, 1 Connected, 1 Made, 1 Untouchable.

| Rarity | Primary stat roll |
|---|---|
| Street | +2–4% |
| Solid | +5–9% |
| Connected | +10–16% |
| Made | +18–28% |
| Untouchable | +30–45% **+ unique effect** |

### Untouchables (8, one per slot)

These are what people chase. Uniques, not just bigger numbers.

- **Ghost Line** (Burner) — heat decays at 2x while offline
- **Dead Man's Watch** (Watch) — first raid each run takes nothing
- **Clean Hands** (Briefcase) — 10% of dirty cash launders itself passively
- **The Long Chain** (Chain) — price bonus scales with consecutive days played
- **Nothing Personal** (Piece) — rivals never contest your top-earning block
- **Company Car** (Ride) — distribution ignores the first checkpoint on every route
- **Nobody's Jacket** (Jacket) — below 40 heat, you generate none at all
- **Dead Stock** (Kicks) — dealers keep working for 2h after you close the app

### Levels

Duplicates feed levels. Lv1–10, each level **+12% of base stat.** Lv10 is
2.08x the drop value. Rarity is fixed at drop — a Street item never becomes
a Made item.

### Visual progression

The character is a **paper doll, 8 layers, visibly wearing the loadout.**
Hoodie on a corner at hour one. Tailored suit in an office at hour fifty.

This is not decoration. It is the game's best marketing asset and it is the
reason the name is Corner Office.

---

## 9. Duffels (chests)

| Tier | Street | Solid | Connected | Made | Untouchable |
|---|---|---|---|---|---|
| Street Duffel | 70% | 25% | 5% | — | — |
| Locked Safe | 30% | 40% | 22% | 7% | 1% |
| Armored Case | 5% | 25% | 40% | 25% | 5% |

**Sources:**
- Clearing a district — guaranteed Street Duffel
- Surviving a raid at Hot+ — guaranteed Locked Safe
- 0.5% chance per batch sold — Street Duffel
- First prestige of a run — Armored Case
- Purchase

### The opening animation matters more than anything else on this page

Slow reveal. Rarity color flash. Sound that escalates. Three seconds,
minimum. Do not let it be a toast notification.

That animation is what gets screenshotted, what gets posted, and what makes
someone buy the next one. Budget real polish time for it — it is the single
highest-ROI piece of art in the project.

---

## 10. Crew (12 in v1, 5 slots)

| Role | Effect |
|---|---|
| Chemist | +base purity on all batches |
| Enforcer | Territory defense, rival resistance |
| Mule | +distribution capacity, faster routes |
| Lawyer | -raid losses, faster heat decay |
| Accountant | +launder rate, +dirty cash cap |

Same 5 rarities. 12 named characters in v1, spread across roles and tiers.

### Loyalty — what makes crew different from gear

Gear is passive. Crew is a liability.

Each member has **Loyalty 0–100**, paid a wage in dirty cash per minute.
- Wage at or above market rate: loyalty holds
- Underpaid: loyalty decays
- **Below 25: daily snitch chance.** A snitch is a catastrophic heat event
  plus you lose that crew member and everything they were holding.

This is the deliberate structural difference from the Loadout so the two
systems never feel like the same system twice. **Gear is slots and buffs.
Crew is payroll and risk.**

---

## 11. Prestige — "Get Out"

**Requirement:** clean cash >= threshold. Starts at $100M, x12 each time.

**Gain:** `Connections = floor(sqrt(totalCleanEarned / 1e6))`

### Connections tree

- +% yield, all products
- +% base purity
- -% heat generation
- +% launder rate
- +offline hours
- +Duffel drop rate
- Start with location N unlocked
- Start with product tier N unlocked

### What persists vs. what wipes

| Persists | Wipes |
|---|---|
| Loadout + gear levels | Cash (dirty and clean) |
| Duffel inventory | Stations and upgrades |
| Connections + tree | Locations |
| Unlocked crew roster | Territory |
| Codex / discovery log | Heat |
| | Fronts |
| | Crew loyalty (roster stays) |

**Narrative framing:** each run is a different identity. You got out, the
money went offshore, and you came back as someone else with better contacts.
Prestige should feel like an ending, not a punishment.

---

## 12. Monetization

No ads — mainstream rewarded-video networks prohibit this content anyway, so
the business is direct sales.

| Item | Price | Notes |
|---|---|---|
| Permanent 2x Yield | $4.99 | Ship day one. Historically the largest revenue line in idle games. |
| The Lieutenant | $6.99 | Manages heat offline, auto-launders, offline cap to 24h |
| Armored Case x5 | $9.99 | The gacha line |
| Starter Kit | $1.99 | 48h window, triggers **after** the first survived raid |
| Duffel Pass | $4.99/mo | One Locked Safe daily |

**Explicitly not doing:** energy systems, timers you pay to skip,
pay-to-unlock-content. They convert, and they are why people hate this genre.
At your scale reputation is worth more than the delta.

**Note:** the Starter Kit fires after the first raid, not on launch. Sell
after the player has felt a wall, never before.

---

## 13. Active vs idle

The anti-passive checklist. At any moment at least three of these are
available:

- Set the cut on the next batch
- Play the production minigame for a quality bonus
- Watch heat, time a bribe
- Reassign dealers as districts shift
- Pay or dismiss crew before loyalty tips
- Open Duffels, re-optimize the loadout
- Respond to a raid event

**Target ratio: active play earns ~3x idle.** Idle is the floor that keeps
progress moving overnight, not the intended way to play.

---

## 14. Tech

- **Stack:** TypeScript, no framework. DOM + CSS for UI, small canvas for
  minigames and the character paper doll.
- **Numbers:** mantissa/exponent big-number implementation. Values pass 1e308
  in the Meth tier and native floats will break.
- **Save:** localStorage, JSON, with a `schemaVersion` field and migration
  functions from day one. Retrofitting migrations after players have saves is
  painful.
- **Tick:** fixed 100ms simulation tick, decoupled from render. Offline
  progress computed as elapsed-time integration on load, not by replaying
  ticks.
- **Backend:** none in v1. Leaderboards are v1.1 (Supabase).
- **Content:** `/content/<theme>/` holding `products.json`, `items.json`,
  `crew.json`, `blocks.json`, `fronts.json`, `locations.json`, `strings.json`.
  The engine loads a theme at boot and knows nothing about the subject matter.

---

## 15. Theme swap

Same engine, one folder swap. Unlocks every store and ad network that the
primary theme is blocked from.

| Corner Office | Moonshine Run |
|---|---|
| Tobacco | Cider |
| Weed | Homebrew Beer |
| Shrooms | Moonshine |
| Pills | Bathtub Gin |
| Coke | Smuggled Scotch |
| Meth | Everclear |
| Purity | **Proof** |
| Cutting | Watering down |
| Heat | Suspicion |
| DEA | Revenuers |
| Car Wash / Vape Shop | Pharmacy / Funeral Home |

**Proof maps to purity 1:1.** Watering down liquor to stretch a batch is
mechanically the identical decision. The reskin costs roughly a day and is
not a compromised version of the game — it is the same game.

---

## 16. Seven-day build plan

| Day | Deliverable |
|---|---|
| 1 | Engine core: tick loop, big numbers, save/load + migrations, content loader, economy sim |
| 2 | Production: 6 products, stations, upgrade curve, cut slider, 5 minigames |
| 3 | Heat, raids, dirty/clean split, 4 fronts, 6 locations |
| 4 | Loadout: 8 slots, 48 items, dupe leveling, Duffels, **opening animation** |
| 5 | Territory map, 12 blocks, dealer assignment, rivals, 12 crew + loyalty/snitch |
| 6 | Prestige, Connections tree, balance pass, paper-doll art |
| 7 | Juice, tutorial, sound, mobile layout, ship to itch.io |

**Day 6 balance is not optional.** An idle game with a bad curve is not a
game with a flaw, it is not a game. Reserve the full day.

---

## 17. Art

- **Character:** paper doll, 8 layers, ~48 item sprites
- **Style:** pixel, dark palette, neon accents
- **Sources:** Kenney, 0x72 DungeonTileset, CC0 itch packs — supplemented
  with custom sprites for the loadout items
- **UI:** grimy, high-contrast, big readable numbers. Numbers are the art in
  this genre.

---

## 18. Known risks

1. **Scope.** This is every system in seven days. The honest version: every
   system ships *functional* but at lower content depth than a mature build.
   If a day slips, cut **content count** (fewer items, fewer blocks), never
   cut a **system** — the point of v1 is that everything is visible.
2. **Balance.** The hardest part and the easiest to underestimate. Six product
   tiers spanning 1e0 to 1e12 need the curve to hold the whole way.
3. **Distribution.** itch.io works. Steam is the real home but costs $100 and
   carries a 30-day wait after payment. Mobile stores and ad networks are
   largely closed to the primary theme — the Moonshine skin exists to solve
   exactly that.
4. **Minigame fatigue.** Five minigames repeated thousands of times will
   grate. Mitigation: an auto-play toggle per product that takes the average
   result instead of the best, unlocked once you have cleared that minigame
   50 times. Active play stays better; grinding becomes optional.

---

## 19. Decisions

| Question | Decision |
|---|---|
| Name | **Corner Office** (project). First release ships as **Moonshine Run**. |
| Launch theme | **Moonshine first.** The hard theme is locked out of the App Store, Google Play, and every mainstream ad network, and "mobile and PC" is a requirement. Art deco is also far easier to make look expensive than grime, and the drug-tycoon space is crowded post-Schedule I. Corner Office follows as the uncut version on itch and Steam. |
| Steam | **Deferred.** The $100 and its 30-day clock wait until v1 proves fun. |
| Relationship to other projects | Standalone. Does not touch Dungeon Tavern. |

---

## 20. Build log

### Part 1 — engine core

Shipped: big-number layer, content pipeline with boot validation, the cut and
pricing math, customers and churn, heat with bands and raids, dirty/clean
split and laundering, locations and fronts, save with migrations and offline
catch-up, the snapshot bridge to React, the dev panel, a headless balance
harness, and the production / territory / fronts / places screens.

**Stack.** TypeScript, Vite, React 19, Tailwind v4, Zustand for UI-only
state, `break_infinity.js` for numbers. Capacitor for mobile later. React
was chosen because this game is overwhelmingly lists and panels, which is
what React is good at — and because Tailwind is the fastest route from
functional to expensive-looking. Unity and Godot were both rejected: a
UI-dense idle game fights their layout systems, and their web exports are
heavy enough to hurt itch conversion.

**Art direction changed from the original doc.** Section 17 called for pixel
art; that is now flat vector and CSS. Pixel art is easy to do badly and very
hard to make look premium without a dedicated artist. The paper-doll
character remains the one place real art effort is spent.

**Cycle times shortened.** Section 3 specified up to 15 minutes for the top
tier. Shipped values run 8s to 90s, with base yields raised to keep the
income curve. Fifteen minutes is fine for idle and miserable for active play,
and this game wants to be played actively.

### Part 2 — the minigames

Shipped: the quality-bonus system, five minigames, the auto-run valve, and
harness coverage for all of it.

**Bonuses, not batches.** Section 3 implied a minigame per production cycle,
but tier-one cycles are eight seconds long, so that would be constant
interruption. A run instead grants a timed bonus (five minutes) that applies
to everything the line produces. Idle play keeps running untouched; active
play layers a bonus on top. That is what makes active worth ~3x idle without
making idle feel punished.

**Each minigame buys something different**, so each is worth learning rather
than being five skins on one reward:

| Product | Game | Verb | Pays |
|---|---|---|---|
| Homebrew Beer | Mind the mash | precision dragging | +40% output |
| Moonshine | Wild yeast | reaction tapping | +40% output |
| Bathtub Gin | Cut the heads | rhythm | +15 proof |
| Smuggled Scotch | The run in | dodging | -35% suspicion |
| Everclear | Hold the column | sustained control | +15 proof, +20% output |

Proof bonuses interact directly with the cut: a good run on gin lifted
effective proof from 50 to 64, which took it from serving one district to
serving all four. The minigames feed the core decision rather than sitting
beside it.

**A failed run is never worse than skipping one.** Scores floor at 0.1, so
the worst outcome is a small bonus. The minigames are upside for attention,
never a tax on leaving the game running.

**Auto-run** unlocks per product after 50 completions and holds 50% of a
perfect result. Section 18.4 flagged minigame fatigue as the least certain
risk in the design; this is the valve. Active play stays strictly better,
and the grind becomes optional.

### Bugs found and fixed in Part 2

1. **Side effects inside `setState` updaters.** All five games mutated state
   from inside updater functions, calling other setters and spawning
   entities there. React invokes updaters twice under StrictMode and may
   call them again under concurrent rendering, so one completed game counted
   as two plays, and the balance game's completion fired a store update
   *during render* ("Cannot update a component while rendering a different
   component"). Rewritten so simulation state lives in a ref and React is
   only asked to paint -- see `useGameState` in `ui/minigames/shell.tsx`.
2. **The contamination game was unwinnable.** Every maturing spore seeded a
   replacement, so the population grew exponentially and the board was lost
   within six seconds. Capped live spores at 8 and slowed maturity. Pressure
   should build, not detonate.

### Part 8 — suspicion, prestige pacing, and the numbers

The three things Part 7 shipped knowing they were not finished.

**Suspicion is now a rate, not a toll on every unit.** Charged per unit,
generation scaled with the size of the operation while every means of
suppressing it was bounded, so from mid-game onward it pinned at maximum and
stopped being a dial at all. It is now a per-minute rate per line, driven by
**how thin you are cutting** and which tiers you run, with volume counted
logarithmically so a hundredfold operation is about three times as visible
rather than a hundred times.

This is the same lesson as the laundering bug in Part 6, in a different
costume: what draws the law is recklessness, not the size of a well-run
business, and anything that scales with the operation needs a suppressor
that scales too.

The first attempt at a fix was wrong in direction. Dividing the *per-unit*
cost by the number of dealers made suspicion worse, not better, because
dealers multiply throughput linearly while the divisor grows sub-linearly.
Dividing a *rate* works.

Severity is centred on the default cut rather than on perfect proof, so
selling honestly is a discount and watering down is a penalty. Before that,
everything was a penalty measured against an unreachable ideal, and honest
play at mid-game came out hotter than watering down — because cutting made
districts refuse, which reduced the number of lines actually selling.

`tools/heatcheck.ts` exists so this cannot drift again. It asserts the
properties that make suspicion a dial: cutting thinner always costs quiet,
investment always buys it back, an honest invested operation is not hunted,
recklessness is still punished, and suspicion is never simply absent.

**Prestige pacing.** The requirement rose faster than connections actually
compound. Node costs are exponential, so a node's value grows only
logarithmically in connections spent — which is why the tail kept stalling
however the requirement was tuned. Two changes: the uncapped node now
multiplies rather than adds, and the requirement grows 2.2x rather than 4x,
a figure arrived at by sweeping and measuring.

| Requirement growth | Run lengths |
|---|---|
| 12x (Part 5) | 1h49, 2h13, 4h04, 9h46, stall |
| 4x (Part 6) | 1h45, 2h17, 1h54, 3h46, 10h07, 14h04 |
| **2.2x** | 1h44, 1h35, 2h05, 2h03, 2h17, 2h38, 4h05, 5h54, 6h33 |

Nine runs inside three days, with the first six under 2h40m.

**The numbers.** Roughly three significant figures everywhere, trailing
zeros always trimmed: `$17` not `$16.8`, `$1.5M` not `$1.50M`, `2x` not
`2.00x`, `123M` not `123.00M`. A screen full of dead zeros reads as noise.
Added `fmtMult` and `fmtRate` so multipliers and per-minute figures are
formatted in one place rather than at each call site.

Also fixed: the money figure flinched red on every drop, including the
constant small drain of payroll and laundering, so it sat permanently red
and the signal meant nothing. It now reacts only to a drop worth noticing.

### Part 7 — the juice pass, and shipping

Shipped: sound, flowing counters, floaters, the figure, first-run
onboarding, contextual tips, mobile polish, and an itch.io build.

**Sound is synthesised, not downloaded.** Section 17 calls sound
underrated and cheap, which is right, but shipping audio files would add
megabytes to a game whose whole distribution advantage is starting
instantly. Every voice is generated with WebAudio at runtime: clicks,
coins, a refusal buzz, a siren for a raid, filtered noise for a crate
straining, and a reveal sting **pitched to the rarity** — so you hear what
is in a crate slightly before you read it. Zero download, works offline.
Browsers will not open an audio context outside a gesture, so the first tap
anywhere starts it and every call before that is a no-op.

**Counters flow rather than step.** The engine publishes four times a
second, which reads as a stutter on a number that should be moving. Money
now eases toward its target every frame with a time-normalised constant, in
Big throughout, and flinches red when it is spent. Floaters are reserved for
discrete events — a purchase, a find, a loss — because income arrives
continuously and a floater per tick would be a blizzard.

**The figure**, deferred from Part 6. Flat vector rather than pixel art per
the section 20 art-direction change: a dark silhouette with a warm rim light
reads as deliberate at any size, where a mediocre sprite reads as cheap.
Everything equipped changes something — the coat's length and colour, the
shoes, the hat, the case hanging from the hand, the chain, a strap across
the chest — and overall standing straightens the posture and upgrades the
hat from a flat cap to a homburg with a brass band.

The first version read as a scarecrow: the head was the same value as the
background so the hat floated over a void, the shoes sat detached below the
legs, and the arms were invisible. Rebuilt as one cohesive silhouette with
everything layered on top of it.

**Onboarding.** Four beats on first run, then tips that fire the first time
the thing they explain actually happens — suspicion climbing, a crate
arriving, a district refusing a batch, banked cash overtaking loose.
Contextual beats a manual: nobody reads about suspicion until it is rising
in front of them.

**Shipping.** `npm run package` produces a 118 KB zip. Relative asset paths,
because itch serves an uploaded build from a subdirectory inside an iframe
and absolute paths resolve to nothing there. See SHIPPING.md.

### Part 6 — prestige, the book, and the balance pass

Shipped: the Connections tree (9 nodes), the Get Out flow, and a real
balance pass driven by `tools/balance.ts` — a playthrough simulator that
runs the engine under a player policy and prints when each milestone lands.
Reading constants tells you nothing about where the walls are.

**The paper-doll art from section 17 is not in this part.** Three
mechanical systems plus a genuine balance pass was the honest scope; the
character art is deferred to the juice pass rather than done badly here.

### The balance pass

The first playthrough found a catastrophic wall: **income was flat from 5h
to 22h** — $13.6K/s to $17.7K/s over seventeen hours, with an 11h40m stretch
where nothing happened at all.

The cause was the worst bug in the project so far. Laundering was 5% of the
standing pile capped at **$120/min**, set in Part 1 when that was a sensible
number. By mid-game a player earning **$377,000 per minute** could still only
make $120 of it legitimate — so every clean-cash gate in the game was priced
in hundreds of hours. Moonshine at $250K was 34 hours of laundering. Bathtub
Gin was 1,111 hours.

Worse, a rate on the *pile* pays almost nothing to a player who reinvests,
which is every player.

Laundering is now a **share of income**: 8% base, plus each front's share, so
a full set moves about half of what you earn. The same playthrough now opens
Moonshine at 46 minutes instead of a day, and the dead stretches are 1-3
hours rather than twelve.

This is the fifth time the same bug class has appeared — flat constants in a
game spanning twelve orders of magnitude. Payoffs, crew wages, dealer costs
and the dirty-cash cap were all fixed the same way in earlier parts. **Any
number in this game that is not a ratio should be treated as a bug until
proven otherwise.**

### Other balance findings

1. **Heat had no teeth at scale.** A raid took a share of held cash and
   stock, both near zero for a player who reinvests, so heat 100 cost
   almost nothing and could simply be ignored. Raids now stop production
   for five minutes, which scales with the operation and cannot be dodged
   by spending.
2. **The Connections tree dead-ended.** The finite nodes cost about 1,700
   connections in total; past that, cashing out bought nothing. Added an
   uncapped node so connections always have somewhere to go.
3. **Prestige requirement outran its reward.** At 12x per run against
   payouts compounding at roughly 3x, run lengths doubled every time —
   1h49m, 2h13m, 4h04m, 9h46m, and stalling from there. Now 4x.

### Still open after this pass

Being straight about what a day of balancing did not finish:

- **Late runs still lengthen more than they should.** Six cash-outs land at
  1h45m, 2h17m, 1h54m, 3h46m, 10h07m, 14h04m. The first four are healthy;
  runs five and six are long. More uncapped tree depth or a gentler
  requirement curve is the likely answer.
- **Heat sits at maximum under maximally greedy play.** The simulated
  policy always cuts to the lowest proof the market will take and eats the
  raids. That is arguably the system working — greed has a price, and the
  price is now real — but it means one viable strategy never sees the
  middle of the heat dial.

### Part 5 — crew and rivals

Shipped: 13 crew across 5 roles with wages, pay levels, loyalty and snitch
risk; dealer assignment; rivals contesting districts; and the Crew screen.
Places folded into the Wash tab — both are what banked cash buys, and seven
tabs does not fit a phone.

**Crew are a liability, not a buff.** That is the whole point of section 10:
gear is slots and passive numbers, crew is payroll and risk, so the two
never feel like one system wearing two hats. Everyone has a pay level —
Short, Fair, Generous — and loyalty tracks it. Under 25 they work at reduced
effort and roll a chance each minute to talk, which costs the hire and 45
suspicion. Missing payroll entirely is far worse than paying short.

**Wages scale with income**, for exactly the reason payoffs do: a flat rate
is crushing at level 10 and free at level 300. Each hire costs a couple of
seconds of earnings per minute, scaled by rarity and pay level.

**Rivals** put every district under pressure proportional to its value.
Dealers both move more product and hold the ground, and muscle on the
payroll defends every corner at once. Lose a district and it sells nothing
until you buy it back.

**13 crew, not 12.** The lawyer slot's cheapest hire sat at 150 total
levels, which left a whole role empty for hours. Added an early one rather
than leave a hole in the design.

### Bugs found and fixed in Part 5

1. **The rival system was completely inert.** A single dealer supplied 6
   defence against a maximum of 5.72 pressure per minute across every
   district in the content — so nothing was ever contested, anywhere. Tuned
   against the actual numbers rather than in the abstract: pressure to 3.0
   per unit value, defence to 3 per dealer.
2. **Four hours offline lost all twelve districts** once rivals worked. A
   corner can no longer be taken while you are away: pressure still builds,
   so you return to a crisis you can act on instead of an empty map. Same
   reasoning as the offline cap.
3. **And that was a soft-lock.** With every district contested there are no
   sales, with no sales no loose cash, and retaking costs loose cash — an
   unrecoverable state reachable by closing the app overnight. The last
   district standing can never be taken.
4. **Effective proof rendered as "86.3904".** Crew contribute fractional
   points where gear contributed whole ones. Proof is a whole-number scale,
   so it rounds in the engine.
5. **A flaky test.** The snitch check failed once and passed on re-run — a
   one-hour trial misses by chance about once in 150. It now runs six
   independent hours, which is the difference between a test and a coin.

### Part 4 — the Loadout

Shipped: 48 items, duplicate levelling, crates with the tiered odds from
section 9, all eight Untouchable effects, the Kit screen, and the crate
opening.

**The reason this system exists** is that it survives prestige. Everything
else in a run is wiped; the kit is not. It is why cashing out is something
you want to do rather than something you endure, and it is the monetisation
surface. Both jobs depend on the opening moment landing.

**The opening.** The rarity is rolled *before* the animation starts, so the
glow building behind the crate can be the colour of the answer rather than a
guess at it. Roughly 1.5s of strain with the seam lighting up, a 0.5s burst
with a rotating ray sweep, then the card. Sound is a day-7 item.

**Untouchable effects**, all eight implemented. Four in DESIGN.md depended
on systems that do not exist yet and were reinterpreted rather than stubbed:

| Item | Shipped as |
|---|---|
| Dead Man's Watch | The first raid of a run finds nothing |
| Ghost Line | Suspicion cools twice as fast while away |
| Clean Hands | A tenth of the pile washes itself, uncapped |
| Nobody's Jacket | Below 40 suspicion you generate none |
| The Long Chain | Prices climb with the age of the run, to +25% |
| Nothing Personal | Your best district never walks away (rivals are Part 5) |
| Company Car | Every district holds 25% more buyers (routes are a minigame) |
| Dead Stock | No suspicion generated at all while away |

**Duplicates level a piece** rather than being wasted: level equals the
duplicates needed for the next one, so 45 copies to max at +12% of base per
level. Common gear gets there; an Untouchable effectively never does, which
is correct — those are bought for the effect, not the number.

### Bugs found and fixed in Part 4

1. **The reveal never fired.** The phase effect depended on `phase`, so when
   it advanced to the burst at 1500ms the cleanup cancelled *both* pending
   timers — including the reveal scheduled for 1960ms. The crate blew apart
   and nothing came out. Each phase now schedules only the next one.
2. **The totals panel lied.** It re-added the equipped items' stats, which is
   not what the simulation applies: suspicion resistance is clamped at 90% so
   the pressure system can never be switched off. It read +99% while the
   engine used 90%. It now reads the engine's computed modifiers and marks
   the clamp.

### Part 3 — the pressure systems made legible

Heat, raids and laundering all worked after Part 1, but almost none of it
was visible: a raid silently took a third of the stock and nothing said so.
Part 3 is about making the pressure readable and giving the player something
to do about it.

**An event log.** The simulation now emits events -- raids, bad batches,
band crossings, crates, payoffs -- which the Engine turns into plain
sentences. Raids and band crossings also fire a toast, because losing a
third of your stock while looking at another screen is the difference
between a pressure system and an inexplicable loss. Events are session-only
and deliberately kept out of the save schema.

**Heat is attributed.** Every step records heat per product, so the Law
screen shows exactly which line is burning you and what share each one
carries. Without this, "suspicion is rising" is not information the player
can act on.

**Payoffs.** Section 4 called for bribes, lawyers and fronts. Lawyers are
crew (Part 5) and fronts existed, but there was no active way to spend
against heat at all. A payoff now takes 25 off the top for dirty cash,
costs more the more they have on you, and gets more expensive every time
you use it -- so it relieves pressure without being the answer to it.

**The wash.** The Fronts screen shows the full pipeline: the pile, the rate,
the ceiling, how long the pile takes to come out clean, and which fronts are
maxed out.

### Bugs found and fixed in Part 3

1. **Payoffs were priced off upgrade cost** (3x the priciest next station),
   which put them at roughly 80 minutes of income by level 80 -- unusable.
   Station costs grow exponentially while income grows linearly, so anything
   priced against upgrades drifts out of reach by design. Repriced against a
   smoothed income rate: 240 seconds of current earnings.
2. **That opened an exploit**: crash your own sales by cutting below every
   district's tolerance, wait for the income rate to fall, buy a cheap
   payoff, resume. Fixed by making the smoothing asymmetric and
   time-normalised -- it tracks a rise with a 30s constant and a fall with a
   600s one, so the basis cannot be dropped on demand. Time-normalising also
   removed a real correctness bug: the old per-step smoothing gave different
   results depending on how the caller chunked `dt`.
3. **The heat breakdown showed raw tick units** ("1.2 moved" from a 100ms
   step), which reads as nonsense. Shown as a per-minute rate now.

### Balance problems found and fixed in Part 1

Four of these only surfaced by running the engine headlessly, which is the
argument for having built `tools/simcheck.ts` on day one.

1. **The game was unwinnable.** Clean cash came only from laundering,
   laundering required a front, and every front cost clean cash. Fixed with a
   small innate launder rate, which also makes fronts an upgrade rather than
   a gate.
2. **The hoarding penalty punished normal play.** The dirty-cash cap was a
   flat $25K, so once one upgrade cost more than that, saving up for it
   generated heat faster than decay could clear it. The cap now scales with
   the priciest upgrade available.
3. **Raids fired ~35 times in a four-hour absence.** Added a 45-minute
   cooldown after each raid.
4. **Heat arrived far too early**, saturating in the first session before the
   player had any tools to manage it. Heat per unit cut by 5x across all
   tiers and base decay raised to 0.8/min. Heat now arrives when you scale
   volume or cut hard, which is the intent.
5. **A near-fix that would have broken the core mechanic:** demand was
   briefly re-tuned to track production closely, so inventory would
   accumulate. That is wrong — if demand binds, cutting produces units that
   cannot be sold, so cutting stops earning more *and* stops costing heat,
   and the central decision of the game evaporates. Demand is deliberately
   generous; production is the bottleneck; inventory is the buffer that only
   matters when customers churn. This is recorded because it is an easy
   mistake to make twice.
