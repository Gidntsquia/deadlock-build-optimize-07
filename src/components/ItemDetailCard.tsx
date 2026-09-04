import type { Item } from '../types'

// "AbilityCooldown" is this item's own active/passive proc cooldown (in
// seconds), not a reduction to the hero's own ability cooldowns -- the raw
// name reads as the latter, so relabel it to avoid that confusion.
const STAT_NAME_OVERRIDES: Record<string, string> = {
  AbilityCooldown: 'Item Cooldown',
}

function humanizeStatName(name: string): { label: string; isPercent: boolean } {
  const isPercent = /Percent(age)?$|Pct$/.test(name)
  const stripped = name.replace(/Percent(age)?$|Pct$/, '')
  if (STAT_NAME_OVERRIDES[stripped]) {
    return { label: STAT_NAME_OVERRIDES[stripped], isPercent }
  }
  const label = stripped
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
  return { label: label || stripped, isPercent }
}

function humanizeLabel(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function ItemDetailCard({ item, onClose }: { item: Item; onClose: () => void }) {
  const props = item.upgrades?.flatMap((u) => u.property_upgrades ?? []) ?? []
  const sections = item.tooltip_sections ?? []

  return (
    <div className="overlay" onClick={onClose}>
      <div className="detail-card" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="detail-header">
          <div className={`detail-art slot-edge-${item.item_slot_type ?? 'weapon'}`}>
            <img src={item.shop_image_webp ?? item.shop_image} alt={item.name} />
            {item.item_tier && <span className={`tier-ribbon tier-${item.item_tier}`}>{item.item_tier}</span>}
          </div>
          <div>
            <h3>{item.name}</h3>
            <div className="item-meta">
              <span>{humanizeLabel(item.item_slot_type ?? '')}</span>
              <span className="item-tile-cost">
                <span className="soul-icon" aria-hidden />
                {item.cost}
              </span>
            </div>
          </div>
        </div>

        {sections.map((s, i) => {
          const text = s.section_attributes.map((a) => a.loc_string).filter(Boolean)
          if (text.length === 0) return null
          return (
            <div key={i}>
              <div className="detail-section-title">
                <span>{humanizeLabel(s.section_type ?? '')}</span>
              </div>
              {text.map((t, j) => (
                <p
                  key={j}
                  className="tooltip-text"
                  dangerouslySetInnerHTML={{ __html: t!.replace(/<[^>]*class="highlight"[^>]*>/g, '<b>').replace(/<\/span>/g, '</b>') }}
                />
              ))}
            </div>
          )
        })}

        {props.length > 0 && (
          <div>
            <div className="detail-section-title">
              <span>Stats</span>
            </div>
            {props.map((p, i) => {
              const { label, isPercent } = humanizeStatName(p.name)
              const num = Number(p.bonus)
              const sign = num >= 0 ? '+' : ''
              return (
                <div className="stat-line" key={i}>
                  <span>{label}</span>
                  <span>
                    {sign}
                    {p.bonus}
                    {isPercent ? '%' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
