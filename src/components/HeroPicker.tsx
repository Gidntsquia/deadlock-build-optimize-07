import type { Hero } from '../types'

export default function HeroPicker({
  heroes,
  selected,
  onSelect,
}: {
  heroes: Hero[]
  selected: number
  onSelect: (id: number) => void
}) {
  return (
    <div className="hero-picker">
      {heroes.map((h) => (
        <button
          key={h.id}
          className={`hero-chip${h.id === selected ? ' active' : ''}`}
          onClick={() => onSelect(h.id)}
        >
          <img
            src={h.images?.icon_image_small_webp ?? h.images?.icon_image_small}
            alt={h.name}
            loading="lazy"
          />
          <span>{h.name}</span>
        </button>
      ))}
    </div>
  )
}
