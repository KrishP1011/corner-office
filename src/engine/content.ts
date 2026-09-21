import type {
  ContentPack, ProductDef, LocationDef, FrontDef,
  BlockDef, ItemDef, CrewDef, ThemeStrings,
} from './types'

import mProducts from '../content/moonshine/products.json'
import mLocations from '../content/moonshine/locations.json'
import mFronts from '../content/moonshine/fronts.json'
import mBlocks from '../content/moonshine/blocks.json'
import mItems from '../content/moonshine/items.json'
import mCrew from '../content/moonshine/crew.json'
import mStrings from '../content/moonshine/strings.json'

/**
 * Theme registry. Adding the Corner Office pack is a folder of JSON plus one
 * entry here -- the engine never learns what the goods actually are.
 */
const THEMES: Record<string, ContentPack> = {
  moonshine: {
    themeId: 'moonshine',
    strings: mStrings as ThemeStrings,
    products: mProducts as ProductDef[],
    locations: mLocations as LocationDef[],
    fronts: mFronts as FrontDef[],
    blocks: mBlocks as BlockDef[],
    items: mItems as ItemDef[],
    crew: mCrew as CrewDef[],
  },
}

export const DEFAULT_THEME = 'moonshine'

export function loadContent(themeId: string = DEFAULT_THEME): ContentPack {
  const pack = THEMES[themeId]
  if (!pack) throw new Error(`Unknown theme "${themeId}"`)
  validate(pack)
  return pack
}

export function availableThemes(): string[] {
  return Object.keys(THEMES)
}

/**
 * Fail loudly at boot rather than subtly at runtime. A district that wants a
 * product id that does not exist would otherwise just silently never sell.
 */
function validate(pack: ContentPack): void {
  const productIds = new Set(pack.products.map((p) => p.id))
  const locationIds = new Set(pack.locations.map((l) => l.id))
  const errors: string[] = []

  for (const p of pack.products) {
    if (!locationIds.has(p.requiresLocation)) {
      errors.push(`product "${p.id}" requires unknown location "${p.requiresLocation}"`)
    }
    if (p.cycleSeconds <= 0) errors.push(`product "${p.id}" has a non-positive cycle`)
    if (!(p.heatPerMinute >= 0)) errors.push(`product "${p.id}" has no heatPerMinute`)
    if (p.costGrowth <= 1) errors.push(`product "${p.id}" has costGrowth <= 1`)
  }

  for (const b of pack.blocks) {
    for (const want of b.wants) {
      if (!productIds.has(want)) {
        errors.push(`block "${b.id}" wants unknown product "${want}"`)
      }
    }
  }

  const itemIds = new Set<string>()
  for (const it of pack.items) {
    if (itemIds.has(it.id)) errors.push(`duplicate item id "${it.id}"`)
    itemIds.add(it.id)
  }

  if (pack.locations.length === 0) errors.push('no locations defined')
  if (pack.products.length === 0) errors.push('no products defined')

  if (errors.length) {
    throw new Error(`Content pack "${pack.themeId}" is invalid:\n  - ${errors.join('\n  - ')}`)
  }
}
