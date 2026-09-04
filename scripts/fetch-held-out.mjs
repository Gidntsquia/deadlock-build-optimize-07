// Fetches top-player match purchase histories used as held-out validation
// sets (src/lib/validation.ts). Run standalone — doesn't touch the bulk
// analytics snapshots fetch-data.mjs pulls.
import { writeFileSync } from 'node:fs'

const API = 'https://api.deadlock-api.com'
const OUT = new URL('../public/data/', import.meta.url)

const PLAYERS = [
  { accountId: 35187362, heroId: 1, label: 'Zergggy', file: 'zergggy-infernus-matches.json' },
  { accountId: 87624911, heroId: 31, label: 'Deathy', file: 'deathy-lash-matches.json' },
  { accountId: 35187362, heroId: 63, label: 'Zergggy', file: 'zergggy-mina-matches.json' },
]

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

async function fetchHeldOut({ accountId, heroId, label, file }) {
  console.log(`fetching ${label}'s hero ${heroId} match history...`)
  const history = await getJSON(`${API}/v1/players/${accountId}/match-history`)
  const matches = history
    .filter((m) => m.hero_id === heroId && m.game_mode === 1 && (m.match_mode === 1 || m.match_mode === 2))
    .sort((a, b) => b.start_time - a.start_time)
  console.log(`  ${matches.length} standard matches found`)
  const recent = matches.slice(0, 30)

  const matchDetails = []
  for (const m of recent) {
    try {
      const meta = await getJSON(`${API}/v1/matches/${m.match_id}/metadata`)
      const player = meta.match_info.players.find((p) => p.account_id === accountId)
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
  console.log(`  ${matchDetails.length} purchase snapshots`)
  save(file, matchDetails)
}

async function main() {
  for (const p of PLAYERS) {
    if (p.file === 'zergggy-infernus-matches.json') continue // already have this one
    await fetchHeldOut(p)
  }
  console.log('done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
