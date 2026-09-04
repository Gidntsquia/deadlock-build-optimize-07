// Downloads all data the app needs into /data as static JSON snapshots.
// App reads only these snapshots afterward — fully offline after this script runs.
import { writeFileSync, mkdirSync } from 'node:fs'

const API = 'https://api.deadlock-api.com'
const ASSETS = 'https://assets.deadlock-api.com'
const ZERGGGY = 35187362
const APP_USER = 267836488

const OUT = new URL('../public/data/', import.meta.url)
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { redirect: 'follow' })
    if (res.ok) return res.json()
    if (res.status === 429) {
      await sleep(2000 * (i + 1))
      continue
    }
    if (i === tries - 1) throw new Error(`${res.status} ${url}`)
    await sleep(1000)
  }
}

function save(name, data) {
  writeFileSync(new URL(name, OUT), JSON.stringify(data))
  console.log(`saved ${name} (${JSON.stringify(data).length} bytes)`)
}

async function main() {
  console.log('fetching item catalog...')
  const items = await getJSON(`${ASSETS}/v2/items/by-type/upgrade`)
  const shopable = items.filter((i) => i.item_slot_type && i.item_tier)
  console.log(`items: ${items.length} total, ${shopable.length} shopable`)
  save('items.json', items)

  console.log('fetching abilities...')
  const abilities = await getJSON(`${ASSETS}/v2/items/by-type/ability`)
  const abilitiesSlim = abilities.map((a) => ({
    id: a.id,
    class_name: a.class_name,
    name: a.name,
    hero: a.hero,
    image: a.image_webp || a.image,
  }))
  save('abilities.json', abilitiesSlim)

  console.log('fetching heroes...')
  const heroes = await getJSON(`${ASSETS}/v2/heroes`)
  const activeHeroes = heroes.filter(
    (h) => h.player_selectable && !h.disabled && !h.in_development,
  )
  console.log(`heroes: ${heroes.length} total, ${activeHeroes.length} active`)
  save('heroes.json', heroes)

  console.log('fetching per-hero analytics for active heroes...')
  const itemStats = {}
  const abilityOrderStats = {}
  const itemPermutationStats = {}
  const topByMatches = (arr, n) =>
    [...arr].sort((a, b) => b.matches - a.matches).slice(0, n)

  for (const h of activeHeroes) {
    // min_average_badge filters to high-rank (~Ascendant+) matches only, since
    // scoring should reflect what skilled players buy, not the full matchmaking
    // pool where many builds are suboptimal.
    itemStats[h.id] = await getJSON(
      `${API}/v1/analytics/item-stats?hero_id=${h.id}&min_average_badge=80`,
    )
    await sleep(150)
    const abilityOrder = await getJSON(
      `${API}/v1/analytics/ability-order-stats?hero_id=${h.id}`,
    )
    abilityOrderStats[h.id] = topByMatches(abilityOrder, 25)
    await sleep(150)
    const perm = await getJSON(`${API}/v1/analytics/item-permutation-stats?hero_id=${h.id}`)
    itemPermutationStats[h.id] = topByMatches(perm, 100)
    await sleep(150)
    console.log(`  hero ${h.id} ${h.name} done`)
  }
  save('item-stats.json', itemStats)
  save('ability-order-stats.json', abilityOrderStats)
  save('item-permutation-stats.json', itemPermutationStats)

  console.log("fetching Zergggy's match history...")
  const history = await getJSON(`${API}/v1/players/${ZERGGGY}/match-history`)
  // Infernus = hero_id 1. Standard matchmaking only: game_mode 1 (Normal), match_mode 2 (Ranked/Unranked
  // matchmaking) per observed API values — excludes private lobbies / bot / event modes.
  const infernusMatches = history
    .filter((m) => m.hero_id === 1 && m.game_mode === 1 && (m.match_mode === 1 || m.match_mode === 2))
    .sort((a, b) => b.start_time - a.start_time)
  console.log(`Zergggy Infernus standard matches: ${infernusMatches.length}`)
  const recent = infernusMatches.slice(0, 30)

  console.log('fetching match metadata for purchase histories...')
  const matchDetails = []
  for (const m of recent) {
    try {
      const meta = await getJSON(`${API}/v1/matches/${m.match_id}/metadata`)
      const player = meta.match_info.players.find((p) => p.account_id === ZERGGGY)
      if (player) {
        matchDetails.push({
          match_id: m.match_id,
          start_time: m.start_time,
          match_result: m.match_result,
          player_team: m.player_team,
          game_mode: m.game_mode,
          match_mode: m.match_mode,
          items: player.items,
        })
      }
    } catch (e) {
      console.warn(`  match ${m.match_id} failed: ${e.message}`)
    }
    await sleep(200)
  }
  console.log(`Zergggy match purchase snapshots: ${matchDetails.length}`)
  save('zergggy-infernus-matches.json', matchDetails)

  console.log("fetching app-user match history for personalization insight...")
  const userHistory = await getJSON(`${API}/v1/players/${APP_USER}/match-history`)
  const standardUserMatches = userHistory.filter(
    (m) => m.game_mode === 1 && (m.match_mode === 1 || m.match_mode === 2),
  )
  save('app-user-matches.json', standardUserMatches)

  console.log('done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
