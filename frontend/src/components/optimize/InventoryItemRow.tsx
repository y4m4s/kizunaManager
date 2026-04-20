import { memo } from 'react'
import type { Item } from '../../types'
import { IconThumb } from '../common/IconThumb'

type InventoryItemRowProps = {
  item: Item
  quantityInput: string
  onQuantityChange: (itemId: number, value: string) => void
  onQuantityCommit: (itemId: number) => void
}

function InventoryItemRowComponent({
  item,
  quantityInput,
  onQuantityChange,
  onQuantityCommit,
}: InventoryItemRowProps) {
  const toneClass =
    item.gift_kind === 'bouquet'
      ? 'bouquet'
      : item.rarity === 'SSR'
        ? 'rarity-ssr'
        : 'rarity-sr'

  return (
    <div className="inventory-tile-card" title={item.name}>
      <div className={`inventory-tile ${toneClass}`}>
        <IconThumb filePath={item.icon_path} label={item.name} size={60} tone="gift" />
      </div>

      <input
        aria-label={`${item.name} の所持数`}
        className="text-input compact inventory-tile-input"
        inputMode="numeric"
        type="text"
        value={quantityInput}
        onFocus={() => {
          if (quantityInput === '0') {
            onQuantityChange(item.id, '')
          }
        }}
        onBlur={() => onQuantityCommit(item.id)}
        onChange={(event) => onQuantityChange(item.id, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onQuantityCommit(item.id)
          }
        }}
      />
    </div>
  )
}

function areEqual(prev: InventoryItemRowProps, next: InventoryItemRowProps): boolean {
  return (
    prev.item.id === next.item.id &&
    prev.item.name === next.item.name &&
    prev.item.icon_path === next.item.icon_path &&
    prev.item.rarity === next.item.rarity &&
    prev.item.gift_kind === next.item.gift_kind &&
    prev.quantityInput === next.quantityInput
  )
}

export const InventoryItemRow = memo(InventoryItemRowComponent, areEqual)
