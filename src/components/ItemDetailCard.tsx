import type { Item } from '../types'

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
              <span>{item.item_slot_type}</span>
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
                <span>{s.section_type}</span>
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
            {props.map((p, i) => (
              <div className="stat-line" key={i}>
                <span>{p.name}</span>
                <span>+{p.bonus}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
