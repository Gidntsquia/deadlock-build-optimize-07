import { useState } from 'react'
import type { AbilityStep, Build } from '../types'
import type { ZergCoreSet } from '../lib/validation'
import ItemDetailCard from './ItemDetailCard'

const PHASES: Array<Build['items'][number]['phase']> = ['early', 'mid', 'late']
const PHASE_LABEL: Record<Build['items'][number]['phase'], string> = {
  early: 'Early game',
  mid: 'Mid game',
  late: 'Late game',
}
const TIER_NUMERAL: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }

interface AbilityLane {
  ability: AbilityStep['ability']
  picks: AbilityStep[]
}

function buildLanes(steps: AbilityStep[]): AbilityLane[] {
  const lanes: AbilityLane[] = []
  const byId = new Map<number, AbilityLane>()
  for (const step of steps) {
    let lane = byId.get(step.ability.id)
    if (!lane) {
      lane = { ability: step.ability, picks: [] }
      byId.set(step.ability.id, lane)
      lanes.push(lane)
    }
    lane.picks.push(step)
  }
  return lanes
}

export default function BuildView({ build, core }: { build: Build; core: ZergCoreSet | null }) {
  const [openItemId, setOpenItemId] = useState<number | null>(null)
  const openItem = build.items.find((bi) => bi.item.id === openItemId)?.item
  const lanes = buildLanes(build.abilityOrder)
  const maxSlot = Math.max(1, ...build.abilityOrder.map((s) => s.slot))

  return (
    <div>
      <p className="build-desc">{build.description}</p>

      <div className="items-section">
        <div className="panel-label">Buy order</div>
        <div className="build-panel">
          {PHASES.map((phase) => {
            const inPhase = build.items.filter((bi) => bi.phase === phase)
            if (inPhase.length === 0) return null
            return (
              <div className="phase-block" key={phase}>
                <div className="phase-bar">
                  <span>{PHASE_LABEL[phase]}</span>
                  <span className="phase-count">{inPhase.length} items</span>
                </div>
                <div className="item-tile-grid">
                  {inPhase.map((bi) => {
                    const coreEntry = core?.entries.get(bi.item.id)
                    const isCore = coreEntry?.isCore ?? false
                    return (
                      <button
                        key={bi.item.id}
                        className={`item-tile slot-edge-${bi.item.item_slot_type ?? 'weapon'}`}
                        onClick={() => setOpenItemId(bi.item.id)}
                      >
                        <div className="item-tile-art">
                          <img
                            src={bi.item.shop_image_webp ?? bi.item.shop_image}
                            alt={bi.item.name}
                            loading="lazy"
                          />
                          {bi.item.item_tier && (
                            <span className={`tier-ribbon tier-${bi.item.item_tier}`}>
                              {TIER_NUMERAL[bi.item.item_tier]}
                            </span>
                          )}
                          {isCore && <span className="core-pip" title="Confirmed in Zergggy's matches" />}
                        </div>
                        <div className="item-tile-name">{bi.item.name}</div>
                        <div className="item-tile-cost">
                          <span className="soul-icon" aria-hidden />
                          {bi.item.cost}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="ability-section">
        <div className="panel-label">Ability point order</div>
        <div className="ability-panel">
          {lanes.map((lane) => (
            <div className="ability-lane" key={lane.ability.id}>
              <div className="lane-icon-col">
                <img src={lane.ability.image} alt={lane.ability.name} loading="lazy" className="lane-icon" />
                <span className="lane-name">{lane.ability.name}</span>
              </div>
              <div className="lane-track">
                {lane.picks.map((pick) => (
                  <span
                    key={pick.slot}
                    className={`lane-pip${pick.isUpgrade ? '' : ' lane-pip-unlock'}`}
                    style={{ left: `${(pick.slot / maxSlot) * 100}%` }}
                    title={`${lane.ability.name} — level ${pick.slot}`}
                  >
                    {pick.isUpgrade && pick.slot}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {openItem && <ItemDetailCard item={openItem} onClose={() => setOpenItemId(null)} />}
    </div>
  )
}
