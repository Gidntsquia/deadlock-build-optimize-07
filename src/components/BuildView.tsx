import { useState } from 'react'
import type { Build } from '../types'
import type { ZergCoreSet } from '../lib/validation'
import ItemDetailCard from './ItemDetailCard'

const PHASES: Array<Build['items'][number]['phase']> = ['early', 'mid', 'late']

export default function BuildView({ build, core }: { build: Build; core: ZergCoreSet | null }) {
  const [openItemId, setOpenItemId] = useState<number | null>(null)
  const openItem = build.items.find((bi) => bi.item.id === openItemId)?.item

  return (
    <div>
      <p className="build-desc">{build.description}</p>

      <div className="items-section">
        <h2>Buy Order</h2>
        {PHASES.map((phase) => {
          const inPhase = build.items.filter((bi) => bi.phase === phase)
          if (inPhase.length === 0) return null
          return (
            <div className="phase-section" key={phase}>
              <div className="phase-title">
                <span>{phase} game</span>
                <span>{inPhase.length} items</span>
              </div>
              {inPhase.map((bi) => {
                const coreEntry = core?.entries.get(bi.item.id)
                const isCore = coreEntry?.isCore ?? false
                return (
                  <button
                    key={bi.item.id}
                    className="item-row"
                    onClick={() => setOpenItemId(bi.item.id)}
                  >
                    <img src={bi.item.shop_image_webp ?? bi.item.shop_image} alt={bi.item.name} loading="lazy" />
                    <div className="item-info">
                      <div className="item-name">{bi.item.name}</div>
                      <div className="item-meta">
                        <span className={`slot-dot slot-${bi.item.item_slot_type}`} />
                        <span>Tier {bi.item.item_tier}</span>
                        <span className={`badge ${isCore ? 'badge-core' : 'badge-noncore'}`}>
                          {isCore ? 'Zergggy core' : 'not core'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="item-cost">{bi.item.cost}</div>
                      <div className="running-total">total {bi.runningTotal}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="ability-section">
        <h2>Ability Level-Up Order</h2>
        <div className="ability-grid">
          {build.abilityOrder.map((step) => (
            <div className={`ability-step${step.isUpgrade ? '' : ' unlock'}`} key={step.slot}>
              <div className="slot-num">{step.slot}</div>
              <img src={step.ability.image} alt={step.ability.name} loading="lazy" />
              <div className="ability-name">{step.ability.name}</div>
            </div>
          ))}
        </div>
      </div>

      {openItem && <ItemDetailCard item={openItem} onClose={() => setOpenItemId(null)} />}
    </div>
  )
}
