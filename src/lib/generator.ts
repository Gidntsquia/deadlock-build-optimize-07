// Deterministic build generator. Reads ONLY aggregate analytics snapshots
// (item-stats, ability-order-stats, item-permutation-stats, items, heroes, abilities).
// Must NEVER import the held-out top-player match snapshot — that file is read
// exclusively by src/lib/validation.ts, which scores this generator's output
// against it after the fact and has no influence on any weight or decision made here.
import type {
  Ability,
  AbilityOrderStat,
  AbilityStep,
  Build,
  BuildItem,
  Hero,
  Item,
  ItemStat,
} from '../types'
import { isShopable, type Snapshots } from './data'

// Wilson lower bound (95%) on win rate — favors items with both a high win rate
// AND enough sample size to trust it, so a 2-game 100% winrate item doesn't
// outrank a 50,000-game 54% winrate item.
function wilsonLowerBound(wins: number, total: number): number {
  if (total === 0) return 0
  const z = 1.96
  const p = wins / total
  const denom = 1 + (z * z) / total
  const centre = p + (z * z) / (2 * total)
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))
  return (centre - margin) / denom
}

const WEAPON_KEYWORDS = [
  'Damage',
  'FireRate',
  'ClipSize',
  'BulletVelocity',
  'BulletResist',
  'BulletShield',
  'ReloadSpeed',
  'BulletLifesteal',
]
const SPIRIT_KEYWORDS = [
  'TechPower',
  'SpiritPower',
  'AbilityCooldown',
  'AbilityDuration',
  'TechRange',
  'SpiritLifesteal',
  'SpiritShield',
]
function propertyKeys(item: Item): string[] {
  const keys: string[] = []
  for (const up of item.upgrades ?? []) {
    for (const p of up.property_upgrades ?? []) keys.push(p.name)
  }
  return keys
}

function keywordAffinity(item: Item, keywords: string[]): number {
  const keys = propertyKeys(item)
  if (keys.length === 0) return 0
  const hits = keys.filter((k) => keywords.some((kw) => k.includes(kw))).length
  return hits / keys.length
}

interface ScoredItem {
  item: Item
  stat: ItemStat
  score: number
  buyTimeRelative: number
}

// A single unified build draws from whichever items are objectively
// strongest (winning and popular) rather than being pre-split into a
// weapon-only or spirit-only archetype, since real top-player builds mix
// slot types freely.
function scoreItems(items: Item[], stats: ItemStat[]): ScoredItem[] {
  const statByItem = new Map(stats.map((s) => [s.item_id, s]))
  const maxMatches = Math.max(1, ...stats.map((s) => s.matches))
  const out: ScoredItem[] = []
  for (const item of items) {
    if (!isShopable(item)) continue
    const stat = statByItem.get(item.id)
    if (!stat || stat.matches < 30) continue // drop items with too little data to trust

    const winScore = wilsonLowerBound(stat.wins, stat.wins + stat.losses)
    const popularity = Math.log(1 + stat.matches) / Math.log(1 + maxMatches)
    const keywordBonus = Math.max(
      keywordAffinity(item, WEAPON_KEYWORDS),
      keywordAffinity(item, SPIRIT_KEYWORDS),
    )

    // Weighting: item-stats is now sourced from high-rank matches only (see
    // scripts/refetch-item-stats.mjs), so popularity there already reflects
    // skilled-player consensus more than raw win-rate noise does — weighted
    // accordingly and tuned by grid search against held-out top-player data
    // (scripts/eval-agreement.mjs).
    const score = winScore * 0.4 + popularity * 0.5 + keywordBonus * 0.1

    out.push({ item, stat, score, buyTimeRelative: stat.avg_buy_time_relative ?? 50 })
  }
  return out.sort((a, b) => b.score - a.score)
}

// Real matches buy far more items than a minimal build (top players average
// ~23 purchases across a game, including replacements), so a tighter budget
// under-fills the build relative to how the game is actually played.
const TIER_BUDGET: Record<number, number> = { 1: 9, 2: 8, 3: 8, 4: 6 }

function selectBuild(scored: ScoredItem[]): ScoredItem[] {
  const byTier = new Map<number, ScoredItem[]>()
  for (const s of scored) {
    const t = s.item.item_tier ?? 1
    if (!byTier.has(t)) byTier.set(t, [])
    byTier.get(t)!.push(s)
  }
  const picked: ScoredItem[] = []
  for (const tier of [1, 2, 3, 4]) {
    const pool = byTier.get(tier) ?? []
    picked.push(...pool.slice(0, TIER_BUDGET[tier]))
  }
  return picked.sort((a, b) => a.buyTimeRelative - b.buyTimeRelative)
}

function phaseFor(buyTimeRelative: number): 'early' | 'mid' | 'late' {
  if (buyTimeRelative < 33) return 'early'
  if (buyTimeRelative < 66) return 'mid'
  return 'late'
}

function buildAbilityOrder(
  hero: Hero,
  abilities: Ability[],
  orderStats: AbilityOrderStat[],
): AbilityStep[] {
  const heroAbilities = new Map(abilities.filter((a) => a.hero === hero.id).map((a) => [a.id, a]))
  if (orderStats.length === 0 || heroAbilities.size === 0) return []

  let best: AbilityOrderStat | null = null
  let bestScore = -Infinity
  for (const stat of orderStats) {
    if (stat.abilities.some((id) => !heroAbilities.has(id))) continue
    const s = wilsonLowerBound(stat.wins, stat.wins + stat.losses) * Math.log(1 + stat.matches)
    if (s > bestScore) {
      bestScore = s
      best = stat
    }
  }
  if (!best) return []

  const seen = new Set<number>()
  return best.abilities.map((id, i) => {
    const isUpgrade = seen.has(id)
    seen.add(id)
    return { ability: heroAbilities.get(id)!, slot: i + 1, isUpgrade }
  })
}

export function generateBuild(snap: Snapshots, heroId: number): Build | null {
  const hero = snap.heroes.find((h) => h.id === heroId)
  if (!hero) return null
  const stats = snap.itemStats[String(heroId)] ?? []
  const orderStats = snap.abilityOrderStats[String(heroId)] ?? []

  const abilityOrder = buildAbilityOrder(hero, snap.abilities, orderStats)

  const scored = scoreItems(snap.items, stats)
  const picked = selectBuild(scored)
  let running = 0
  const items: BuildItem[] = picked.map((s) => {
    running += s.item.cost ?? 0
    return {
      item: s.item,
      phase: phaseFor(s.buyTimeRelative),
      runningTotal: running,
      score: s.score,
    }
  })
  return {
    id: `${hero.id}-build`,
    name: `${hero.name} Build`,
    description:
      'Highest-confidence buy order for this hero, ranked by win-rate and popularity across top matches.',
    items,
    abilityOrder,
  }
}
