import { memo } from 'react'
import type { Item } from '../../types'
import { IconThumb } from '../common/IconThumb'
import { QuantityField } from './QuantityField'

type InventoryItemRowProps = {
  item: Item
  quantityInput: string
  onQuantityChange: (itemId: number, value: string) => void
  onQuantityCommit: (itemId: number) => void
  onQuantityRevert: (itemId: number) => void
  onQuantityPasteList: (itemId: number, values: number[]) => void
}

function isBouquetItem(item: Pick<Item, 'gift_kind' | 'name'>): boolean {
  return item.gift_kind === 'bouquet' || item.name.includes('花束')
}

function InventoryItemRowComponent({
  item,
  quantityInput,
  onQuantityChange,
  onQuantityCommit,
  onQuantityRevert,
  onQuantityPasteList,
}: InventoryItemRowProps) {
  const toneClass = isBouquetItem(item)
    ? 'bouquet'
    : item.rarity === 'SSR'
      ? 'rarity-ssr'
      : 'rarity-sr'

  return (
    <div className="inventory-tile-card" title={item.name}>
      <div className={`inventory-tile ${toneClass}`}>
        <IconThumb filePath={item.icon_path} label={item.name} size={60} tone="gift" />
      </div>

      <QuantityField
        ariaLabel={`${item.name} の所持数`}
        savedQuantity={Number(item.quantity || 0)}
        value={quantityInput}
        onChange={(value) => onQuantityChange(item.id, value)}
        onCommit={() => onQuantityCommit(item.id)}
        onPasteList={(values) => onQuantityPasteList(item.id, values)}
        onRevert={() => onQuantityRevert(item.id)}
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
    prev.item.quantity === next.item.quantity &&
    prev.quantityInput === next.quantityInput
  )
}

export const InventoryItemRow = memo(InventoryItemRowComponent, areEqual)
