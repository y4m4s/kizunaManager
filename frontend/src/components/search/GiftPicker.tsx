import type { Item } from '../../types'
import { IconThumb } from '../common/IconThumb'

type GiftPickerProps = {
  items: Item[]
  selectedIds: number[]
  onToggle: (itemId: number) => void
}

function isBouquetItem(item: Pick<Item, 'gift_kind' | 'name'>): boolean {
  return item.gift_kind === 'bouquet' || item.name.includes('\u82b1\u675f')
}

function giftTileTone(item: Item): string {
  if (isBouquetItem(item)) {
    return 'bouquet'
  }
  return item.rarity === 'SSR' ? 'rarity-ssr' : 'rarity-sr'
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
        {items.filter((item) => !isBouquetItem(item)).map((item) => {
          const selected = selectedIds.includes(item.id)
          return (
            <button
              key={item.id}
              className={`gift-tile ${selected ? 'selected' : ''} ${giftTileTone(item)}`}
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
