// Smoke test: run the real generateBuild() against every active hero using
// on-disk data (bypassing fetch), to catch heroes with missing/thin stats
// that crash or produce empty builds.
import { readFileSync } from 'node:fs'
import { generateBuild } from '../src/lib/generator.ts'

const dataDir = new URL('../public/data/', import.meta.url)
const load = (name) => JSON.parse(readFileSync(new URL(name, dataDir), 'utf8'))

const snap = {
  items: load('items.json'),
  heroes: load('heroes.json'),
  abilities: load('abilities.json'),
  itemStats: load('item-stats.json'),
  abilityOrderStats: load('ability-order-stats.json'),
  itemPermutationStats: load('item-permutation-stats.json'),
  appUserMatches: [],
}

const active = snap.heroes.filter((h) => h.player_selectable && !h.disabled && !h.in_development)
console.log(`testing ${active.length} active heroes\n`)

const focus = ['Lash', 'Mina']
let failures = 0

for (const hero of active) {
  try {
    const build = generateBuild(snap, hero.id)
    const isFocus = focus.includes(hero.name)
    const problems = []
    if (!build) problems.push('generateBuild returned null')
    else {
      if (build.items.length === 0) problems.push('0 items')
      if (build.abilityOrder.length === 0) problems.push('0 ability steps')
    }
    if (problems.length > 0 || isFocus) {
      const tag = problems.length > 0 ? 'FAIL' : 'ok'
      console.log(
        `[${tag}] ${hero.name} (id ${hero.id})` +
          (build ? ` — ${build.items.length} items, ${build.abilityOrder.length} ability steps` : '') +
          (problems.length ? ` — ${problems.join(', ')}` : ''),
      )
      if (isFocus && build) {
        console.log(
          '  items:',
          build.items.map((bi) => `${bi.item.name}(${bi.phase})`).join(', '),
        )
        console.log(
          '  abilities:',
          build.abilityOrder.map((s) => `${s.ability.name}@${s.slot}${s.isUpgrade ? '' : '*'}`).join(', '),
        )
      }
    }
    if (problems.length > 0) failures++
  } catch (e) {
    console.log(`[CRASH] ${hero.name} (id ${hero.id}): ${e.message}`)
    failures++
  }
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`} out of ${active.length} heroes`)
process.exit(failures === 0 ? 0 : 1)
