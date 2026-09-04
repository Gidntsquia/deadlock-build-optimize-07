// Offline tuning harness. NOT part of the shipped app — reimplements the
// generator's scoring in plain JS so weight variations can be measured
// against the held-out Zergggy match data without importing that data into
// src/lib/generator.ts (which must stay held-out-blind).
import { readFileSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const load = (name) => JSON.parse(readFileSync(new URL(name, dataDir), 'utf8'))

const items = load('items.json')
const heroes = load('heroes.json')
const itemStatsAll = load('item-stats.json')
const zergMatches = load('zergggy-infernus-matches.json')

const HERO_ID = 1 // Infernus
const stats = itemStatsAll[String(HERO_ID)] ?? []

function isShopable(item) {
  return (
    !!item.cost &&
    item.cost > 0 &&
    !!item.item_tier &&
    item.item_tier >= 1 &&
    item.item_tier <= 4 &&
    ['weapon', 'vitality', 'spirit'].includes(item.item_slot_type)
  )
}

function wilsonLowerBound(wins, total) {
  if (total === 0) return 0
  const z = 1.96
  const p = wins / total
  const denom = 1 + (z * z) / total
  const centre = p + (z * z) / (2 * total)
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))
  return (centre - margin) / denom
}

const WEAPON_KEYWORDS = ['Damage', 'FireRate', 'ClipSize', 'BulletVelocity', 'BulletResist', 'BulletShield', 'ReloadSpeed', 'BulletLifesteal']
const SPIRIT_KEYWORDS = ['TechPower', 'SpiritPower', 'AbilityCooldown', 'AbilityDuration', 'TechRange', 'SpiritLifesteal', 'SpiritShield']
const VITALITY_KEYWORDS = ['MaxHealth', 'HealthRegen', 'Stamina', 'MoveSpeed', 'BulletResist']

function propertyKeys(item) {
  const keys = []
  for (const up of item.upgrades ?? []) for (const p of up.property_upgrades ?? []) keys.push(p.name)
  return keys
}
function keywordAffinity(item, keywords) {
  const keys = propertyKeys(item)
  if (keys.length === 0) return 0
  const hits = keys.filter((k) => keywords.some((kw) => k.includes(kw))).length
  return hits / keys.length
}

function scoreItems(archetype, weights) {
  const statByItem = new Map(stats.map((s) => [s.item_id, s]))
  const maxMatches = Math.max(1, ...stats.map((s) => s.matches))
  const out = []
  for (const item of items) {
    if (!isShopable(item)) continue
    const stat = statByItem.get(item.id)
    if (!stat || stat.matches < 30) continue

    const winScore = wilsonLowerBound(stat.wins, stat.wins + stat.losses)
    const popularity = Math.log(1 + stat.matches) / Math.log(1 + maxMatches)
    const slotBonus =
      archetype === 'gun'
        ? item.item_slot_type === 'weapon' ? 1 : item.item_slot_type === 'vitality' ? 0.4 : 0.15
        : item.item_slot_type === 'spirit' ? 1 : item.item_slot_type === 'vitality' ? 0.4 : 0.15
    const keywordBonus = archetype === 'gun' ? keywordAffinity(item, WEAPON_KEYWORDS) : keywordAffinity(item, SPIRIT_KEYWORDS)
    const vitalityBonus = keywordAffinity(item, VITALITY_KEYWORDS) * 0.3

    const score =
      winScore * weights.win + popularity * weights.pop + slotBonus * weights.slot +
      keywordBonus * weights.keyword + vitalityBonus * weights.vitality

    out.push({ item, stat, score, buyTimeRelative: stat.avg_buy_time_relative ?? 50 })
  }
  return out.sort((a, b) => b.score - a.score)
}

const TIER_BUDGET = { 1: 4, 2: 4, 3: 3, 4: 2 }
function selectBuild(scored, tierBudget) {
  const byTier = new Map()
  for (const s of scored) {
    const t = s.item.item_tier ?? 1
    if (!byTier.has(t)) byTier.set(t, [])
    byTier.get(t).push(s)
  }
  const picked = []
  for (const tier of [1, 2, 3, 4]) picked.push(...(byTier.get(tier) ?? []).slice(0, tierBudget[tier]))
  return picked.sort((a, b) => a.buyTimeRelative - b.buyTimeRelative)
}

// --- held-out Zergggy scoring (mirrors src/lib/validation.ts) ---
const CORE_THRESHOLD = 0.3
function computeZergCoreSet() {
  const n = zergMatches.length
  const perItemWeight = new Map()
  for (const m of zergMatches) {
    const purchased = new Set(m.items.map((i) => i.item_id))
    const weight = m.match_result === m.player_team ? 2 : 1
    for (const id of purchased) perItemWeight.set(id, (perItemWeight.get(id) ?? 0) + weight)
  }
  const maxWeight = n * 2
  const entries = new Map()
  for (const [id, w] of perItemWeight) entries.set(id, { itemId: id, presenceRate: w / maxWeight, isCore: w / maxWeight >= CORE_THRESHOLD })
  return entries
}

function averageZergBuyOrder() {
  const rankSums = new Map()
  for (const m of zergMatches) {
    const sorted = [...m.items].sort((a, b) => a.game_time_s - b.game_time_s)
    sorted.forEach((it, idx) => {
      const cur = rankSums.get(it.item_id) ?? { sum: 0, count: 0 }
      cur.sum += idx
      cur.count += 1
      rankSums.set(it.item_id, cur)
    })
  }
  const out = new Map()
  for (const [id, { sum, count }] of rankSums) out.set(id, sum / count)
  return out
}

function orderAgreement(buildItems, zergOrderByItem) {
  const shared = buildItems
    .map((it, idx) => ({ buildRank: idx, zergRank: zergOrderByItem.get(it.item.id) }))
    .filter((x) => x.zergRank !== undefined)
  if (shared.length < 2) return shared.length === 1 ? 100 : 0
  let concordant = 0, total = 0
  for (let i = 0; i < shared.length; i++) {
    for (let j = i + 1; j < shared.length; j++) {
      total++
      if (Math.sign(shared[i].buildRank - shared[j].buildRank) === Math.sign(shared[i].zergRank - shared[j].zergRank)) concordant++
    }
  }
  return total === 0 ? 0 : (concordant / total) * 100
}

function validateBuild(buildItems, coreEntries) {
  const coreIds = [...coreEntries.values()].filter((e) => e.isCore).map((e) => e.itemId)
  const buildIds = new Set(buildItems.map((it) => it.item.id))
  const overlapCount = coreIds.filter((id) => buildIds.has(id)).length
  const overlapPct = coreIds.length === 0 ? 0 : (overlapCount / coreIds.length) * 100
  const orderPct = orderAgreement(buildItems, averageZergBuyOrder())
  const overallAgreementPct = overlapPct * 0.6 + orderPct * 0.4
  return { overlapCount, coreSetSize: coreIds.length, overlapPct, orderPct, overallAgreementPct }
}

export function evaluate(weights, tierBudget = TIER_BUDGET) {
  const core = computeZergCoreSet()
  const results = {}
  for (const archetype of ['gun', 'spirit']) {
    const scored = scoreItems(archetype, weights)
    const picked = selectBuild(scored, tierBudget)
    results[archetype] = validateBuild(picked, core)
  }
  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const weights = { win: 0.35, pop: 0.35, slot: 0.05, keyword: 0.15, vitality: 0.1 }
  const r = evaluate(weights, { 1: 8, 2: 8, 3: 7, 4: 5 })
  console.log('CURRENT weights:', weights)
  for (const [archetype, res] of Object.entries(r)) {
    console.log(archetype, JSON.stringify(res))
  }
}
