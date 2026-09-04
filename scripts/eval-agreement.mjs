// Offline tuning harness. NOT part of the shipped app — reimplements the
// generator's scoring in plain JS so weight variations can be measured
// against held-out top-player match data without importing that data into
// src/lib/generator.ts (which must stay held-out-blind).
import { readFileSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const load = (name) => JSON.parse(readFileSync(new URL(name, dataDir), 'utf8'))

const items = load('items.json')
const itemStatsAll = load('item-stats.json')

// Mirrors src/lib/validation.ts's HELD_OUT_PLAYERS.
const HELD_OUT_PLAYERS = {
  1: { name: 'Zergggy', hero: 'Infernus', file: 'zergggy-infernus-matches.json' },
  31: { name: 'Deathy', hero: 'Lash', file: 'deathy-lash-matches.json' },
  63: { name: 'Zergggy', hero: 'Mina', file: 'zergggy-mina-matches.json' },
}

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

function scoreItems(heroId, weights) {
  const stats = itemStatsAll[String(heroId)] ?? []
  const statByItem = new Map(stats.map((s) => [s.item_id, s]))
  const maxMatches = Math.max(1, ...stats.map((s) => s.matches))
  const out = []
  for (const item of items) {
    if (!isShopable(item)) continue
    const stat = statByItem.get(item.id)
    if (!stat || stat.matches < 30) continue

    const winScore = wilsonLowerBound(stat.wins, stat.wins + stat.losses)
    const popularity = Math.log(1 + stat.matches) / Math.log(1 + maxMatches)
    const keywordBonus = Math.max(keywordAffinity(item, WEAPON_KEYWORDS), keywordAffinity(item, SPIRIT_KEYWORDS))
    const vitalityBonus = keywordAffinity(item, VITALITY_KEYWORDS) * 0.3

    const score =
      winScore * weights.win + popularity * weights.pop + keywordBonus * weights.keyword + vitalityBonus * weights.vitality

    out.push({ item, stat, score, buyTimeRelative: stat.avg_buy_time_relative ?? 50 })
  }
  return out.sort((a, b) => b.score - a.score)
}

const DEFAULT_TIER_BUDGET = { 1: 8, 2: 8, 3: 7, 4: 5 }
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

// --- held-out top-player scoring (mirrors src/lib/validation.ts) ---
const CORE_THRESHOLD = 0.3
function computeCoreSet(matches) {
  const n = matches.length
  const perItemWeight = new Map()
  for (const m of matches) {
    const purchased = new Set(m.items.map((i) => i.item_id))
    const weight = m.match_result === m.player_team ? 2 : 1
    for (const id of purchased) perItemWeight.set(id, (perItemWeight.get(id) ?? 0) + weight)
  }
  const maxWeight = n * 2
  const entries = new Map()
  for (const [id, w] of perItemWeight) entries.set(id, { itemId: id, presenceRate: w / maxWeight, isCore: w / maxWeight >= CORE_THRESHOLD })
  return entries
}

function averageBuyOrder(matches) {
  const rankSums = new Map()
  for (const m of matches) {
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

function orderAgreement(buildItems, orderByItem) {
  const shared = buildItems
    .map((it, idx) => ({ buildRank: idx, playerRank: orderByItem.get(it.item.id) }))
    .filter((x) => x.playerRank !== undefined)
  if (shared.length < 2) return shared.length === 1 ? 100 : 0
  let concordant = 0, total = 0
  for (let i = 0; i < shared.length; i++) {
    for (let j = i + 1; j < shared.length; j++) {
      total++
      if (Math.sign(shared[i].buildRank - shared[j].buildRank) === Math.sign(shared[i].playerRank - shared[j].playerRank)) concordant++
    }
  }
  return total === 0 ? 0 : (concordant / total) * 100
}

function validateBuild(buildItems, coreEntries, orderByItem) {
  const coreIds = [...coreEntries.values()].filter((e) => e.isCore).map((e) => e.itemId)
  const buildIds = new Set(buildItems.map((it) => it.item.id))
  const overlapCount = coreIds.filter((id) => buildIds.has(id)).length
  const overlapPct = coreIds.length === 0 ? 0 : (overlapCount / coreIds.length) * 100
  const orderPct = orderAgreement(buildItems, orderByItem)
  const overallAgreementPct = overlapPct * 0.6 + orderPct * 0.4
  return { overlapCount, coreSetSize: coreIds.length, overlapPct, orderPct, overallAgreementPct }
}

export function evaluate(heroId, weights, tierBudget = DEFAULT_TIER_BUDGET) {
  const player = HELD_OUT_PLAYERS[heroId]
  const matches = load(player.file)
  const core = computeCoreSet(matches)
  const order = averageBuyOrder(matches)
  const scored = scoreItems(heroId, weights)
  const picked = selectBuild(scored, tierBudget)
  return validateBuild(picked, core, order)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const weights = { win: 0.4, pop: 0.4, keyword: 0.15, vitality: 0.1 }
  console.log('weights:', weights)
  for (const [heroId, player] of Object.entries(HELD_OUT_PLAYERS)) {
    const r = evaluate(Number(heroId), weights)
    console.log(`${player.name} / ${player.hero}:`, JSON.stringify(r))
  }
}
