import type { Item } from '../types'

function humanizeStatName(name: string): { label: string; isPercent: boolean } {
  const isPercent = /Percent(age)?$|Pct$/.test(name)
  const stripped = name.replace(/Percent(age)?$|Pct$/, '')
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
          <img src={item.shop_image_webp ?? item.shop_image} alt={item.name} />
          <div>
            <h3>{item.name}</h3>
            <div className="item-meta">
              <span className={`slot-dot slot-${item.item_slot_type}`} />
              <span>{humanizeLabel(item.item_slot_type ?? '')}</span>
              <span>· Tier {item.item_tier}</span>
              <span>· {item.cost} souls</span>
            </div>
          </div>
        </div>

        {sections.map((s, i) => {
          const text = s.section_attributes.map((a) => a.loc_string).filter(Boolean)
          if (text.length === 0) return null
          return (
            <div key={i}>
              <div className="phase-title">
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
            <div className="phase-title">
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
