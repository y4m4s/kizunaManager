import type { Item } from '../../types'
import { IconThumb } from '../common/IconThumb'

type GiftPickerProps = {
  items: Item[]
  selectedIds: number[]
  onToggle: (itemId: number) => void
}

export function GiftPicker({ items, selectedIds, onToggle }: GiftPickerProps) {
  return (
    <section className="card-shell search-section">
      <div className="section-head">
        <div>
          <h3>贈り物を選択</h3>
          <p>複数選択して、その贈り物を好む生徒を一覧で確認できます。</p>
        </div>
      </div>

      <div className="gift-grid">
        {items.map((item) => {
          const selected = selectedIds.includes(item.id)
          return (
            <button
              key={item.id}
              className={`gift-tile ${selected ? 'selected' : ''} ${item.rarity === 'SSR' ? 'rarity-ssr' : 'rarity-sr'}`}
              type="button"
              onClick={() => onToggle(item.id)}
            >
              <IconThumb filePath={item.icon_path} label={item.name} size={60} tone="gift" />
            </button>
          )
        })}
      </div>
    </section>
  )
}
