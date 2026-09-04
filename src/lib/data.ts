import type {
  AbilityOrderStat,
  Ability,
  AppUserMatch,
  Hero,
  Item,
  ItemPermutationStat,
  ItemStat,
} from '../types'

const base = (import.meta.env?.BASE_URL ?? '/') + 'data/'

async function loadJSON<T>(name: string): Promise<T> {
  const res = await fetch(base + name)
  if (!res.ok) throw new Error(`failed to load ${name}: ${res.status}`)
  return res.json() as Promise<T>
}

export interface Snapshots {
  items: Item[]
  heroes: Hero[]
  abilities: Ability[]
  itemStats: Record<string, ItemStat[]>
  abilityOrderStats: Record<string, AbilityOrderStat[]>
  itemPermutationStats: Record<string, ItemPermutationStat[]>
  appUserMatches: AppUserMatch[]
}

let cached: Snapshots | null = null

export async function loadSnapshots(): Promise<Snapshots> {
  if (cached) return cached
  const [items, heroes, abilities, itemStats, abilityOrderStats, itemPermutationStats, appUserMatches] =
    await Promise.all([
      loadJSON<Item[]>('items.json'),
      loadJSON<Hero[]>('heroes.json'),
      loadJSON<Ability[]>('abilities.json'),
      loadJSON<Record<string, ItemStat[]>>('item-stats.json'),
      loadJSON<Record<string, AbilityOrderStat[]>>('ability-order-stats.json'),
      loadJSON<Record<string, ItemPermutationStat[]>>('item-permutation-stats.json'),
      loadJSON<AppUserMatch[]>('app-user-matches.json'),
    ])
  cached = { items, heroes, abilities, itemStats, abilityOrderStats, itemPermutationStats, appUserMatches }
  return cached
}

export function isShopable(item: Item): boolean {
  return (
    !!item.cost &&
    item.cost > 0 &&
    !!item.item_tier &&
    item.item_tier >= 1 &&
    item.item_tier <= 4 &&
    (item.item_slot_type === 'weapon' ||
      item.item_slot_type === 'vitality' ||
      item.item_slot_type === 'spirit')
  )
}

export function activeHeroes(heroes: Hero[]): Hero[] {
  return heroes.filter((h) => h.player_selectable && !h.disabled && !h.in_development)
}
