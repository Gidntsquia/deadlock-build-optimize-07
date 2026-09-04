// Held-out validation. This is the ONLY module allowed to read the
// top-player match snapshot files below. Its output is a report on how well
// the generator (which never sees these files) matches a real top player's
// habits — never a source the generator consumes.
import type { Build, ZergMatch } from '../types'

const CORE_THRESHOLD = 0.3
const base = (import.meta.env?.BASE_URL ?? '/') + 'data/'

// One held-out top-player match snapshot per hero we can validate against.
export const HELD_OUT_PLAYERS: Record<number, { name: string; file: string }> = {
  1: { name: 'Zergggy', file: 'zergggy-infernus-matches.json' },
  31: { name: 'Deathy', file: 'deathy-lash-matches.json' },
  63: { name: 'Zergggy', file: 'zergggy-mina-matches.json' },
}

export interface CoreItemEntry {
  itemId: number
  presenceRate: number // fraction of sampled matches purchased in, win-weighted
  isCore: boolean
}

export interface ZergCoreSet {
  matchesSampled: number
  entries: Map<number, CoreItemEntry>
}

const matchCache = new Map<string, ZergMatch[]>()
async function loadMatches(file: string): Promise<ZergMatch[]> {
  const cached = matchCache.get(file)
  if (cached) return cached
  const res = await fetch(base + file)
  const matches = (await res.json()) as ZergMatch[]
  matchCache.set(file, matches)
  return matches
}

export async function computeCoreSet(heroId: number): Promise<ZergCoreSet | null> {
  const player = HELD_OUT_PLAYERS[heroId]
  if (!player) return null
  const matches = await loadMatches(player.file)
  const n = matches.length
  const perItemWeight = new Map<number, number>()

  for (const m of matches) {
    const purchased = new Set(m.items.map((i) => i.item_id))
    // A win counts double toward "core" status vs a loss — a build that shows
    // up in wins is stronger evidence of a deliberate core choice.
    const weight = m.match_result === m.player_team ? 2 : 1
    for (const itemId of purchased) {
      perItemWeight.set(itemId, (perItemWeight.get(itemId) ?? 0) + weight)
    }
  }

  const maxPossibleWeight = n * 2
  const entries = new Map<number, CoreItemEntry>()
  for (const [itemId, weight] of perItemWeight) {
    const presenceRate = weight / maxPossibleWeight
    entries.set(itemId, { itemId, presenceRate, isCore: presenceRate >= CORE_THRESHOLD })
  }
  return { matchesSampled: n, entries }
}

export interface BuildAgreement {
  buildId: string
  overlapCount: number
  coreSetSize: number
  overlapPct: number
  orderAgreementPct: number
  overallAgreementPct: number
}

// Buy-order agreement: for the items shared between the build and Zergggy's core
// set, compare relative purchase order via a normalized Kendall-tau-style
// concordance on rank positions.
function orderAgreement(build: Build, zergOrderByItem: Map<number, number>): number {
  const shared = build.items
    .map((bi, idx) => ({ id: bi.item.id, buildRank: idx, zergRank: zergOrderByItem.get(bi.item.id) }))
    .filter((x) => x.zergRank !== undefined) as { id: number; buildRank: number; zergRank: number }[]

  if (shared.length < 2) return shared.length === 1 ? 100 : 0

  let concordant = 0
  let total = 0
  for (let i = 0; i < shared.length; i++) {
    for (let j = i + 1; j < shared.length; j++) {
      total++
      const buildOrder = shared[i].buildRank - shared[j].buildRank
      const zergOrder = shared[i].zergRank - shared[j].zergRank
      if (Math.sign(buildOrder) === Math.sign(zergOrder)) concordant++
    }
  }
  return total === 0 ? 0 : (concordant / total) * 100
}

async function averageBuyOrder(file: string): Promise<Map<number, number>> {
  const matches = await loadMatches(file)
  const rankSums = new Map<number, { sum: number; count: number }>()
  for (const m of matches) {
    const sorted = [...m.items].sort((a, b) => a.game_time_s - b.game_time_s)
    sorted.forEach((it, idx) => {
      const cur = rankSums.get(it.item_id) ?? { sum: 0, count: 0 }
      cur.sum += idx
      cur.count += 1
      rankSums.set(it.item_id, cur)
    })
  }
  const out = new Map<number, number>()
  for (const [id, { sum, count }] of rankSums) out.set(id, sum / count)
  return out
}

export async function validateBuild(build: Build, heroId: number, core: ZergCoreSet): Promise<BuildAgreement> {
  const player = HELD_OUT_PLAYERS[heroId]
  const coreIds = [...core.entries.values()].filter((e) => e.isCore).map((e) => e.itemId)
  const buildIds = new Set(build.items.map((bi) => bi.item.id))
  const overlapCount = coreIds.filter((id) => buildIds.has(id)).length
  const overlapPct = coreIds.length === 0 ? 0 : (overlapCount / coreIds.length) * 100

  const order = player ? await averageBuyOrder(player.file) : new Map<number, number>()
  const orderPct = orderAgreement(build, order)

  const overallAgreementPct = overlapPct * 0.6 + orderPct * 0.4

  return {
    buildId: build.id,
    overlapCount,
    coreSetSize: coreIds.length,
    overlapPct,
    orderAgreementPct: orderPct,
    overallAgreementPct,
  }
}
