# Shipping

```bash
npm run package
```

Produces `moonshine-run-web.zip` — about 118 KB, four files, no external
assets beyond two Google fonts (which have local fallbacks declared, so the
game still reads correctly if they fail).

## itch.io

1. **Create a new project** → Kind of project: **HTML**.
2. Upload `moonshine-run-web.zip` and tick **"This file will be played in
   the browser"**.
3. Viewport: **640 × 960**, with **"Mobile friendly"** and **"Automatically
   start on page load"** both on. The layout is a centred column that works
   from 320px up, so a taller frame simply shows more of it.
4. Leave "Fullscreen button" on. The bottom navigation sits inside
   `env(safe-area-inset-bottom)`, so it stays clear of a phone's home bar.

The build uses relative asset paths (`base: './'` in `vite.config.ts`),
which is what itch's iframe requires — absolute paths resolve to nothing
there.

## What a first-time player sees

A four-beat introduction, then contextual tips that fire the first time
suspicion climbs, a crate turns up, a district refuses a batch, or banked
cash overtakes loose. Each is shown once and remembered through cashing out.

Sound is on by default, synthesised at runtime rather than downloaded, and
one tap from off in the header. Browsers will not open an audio context
before a gesture, so the first tap anywhere starts it.

## Before a public launch

Not blockers for putting it up, but worth knowing:

- **No analytics.** There is no funnel data, so retention has to be read
  from comments and playtime.
- **Local saves only.** A save lives in that browser's `localStorage`.
  Clearing site data loses it; there is no cloud sync and no account.
  The dev panel has export/import, which is the manual workaround.
- **Monetisation is not wired.** `meta.purchased2x` exists and the engine
  honours it, but nothing sells it. DESIGN.md section 12 has the intended
  price list.
- **One theme.** The Corner Office content pack is not written yet; the
  engine takes it as a folder whenever it is.
