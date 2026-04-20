import type { Item } from '../../types'
import { InventoryBoxTile } from './InventoryBoxTile'
import { InventoryItemRow } from './InventoryItemRow'

const INVENTORY_GRID_COLUMNS = 11

type InventoryEditorProps = {
  boxQuantity: string
  items: Item[]
  quantityInputs: Record<number, string>
  onBoxQuantityChange: (value: string) => void
  onItemQuantityChange: (itemId: number, value: string) => void
  onSaveBoxQuantity: () => void
  onSaveItemQuantity: (itemId: number) => void
}

export function InventoryEditor({
  boxQuantity,
  items,
  quantityInputs,
  onBoxQuantityChange,
  onItemQuantityChange,
  onSaveBoxQuantity,
  onSaveItemQuantity,
}: InventoryEditorProps) {
  const remainder = items.length % INVENTORY_GRID_COLUMNS
  const boxTileSpan = remainder === 0 ? INVENTORY_GRID_COLUMNS : INVENTORY_GRID_COLUMNS - remainder

  return (
    <section className="card-shell search-section">
      <div className="section-head">
        <div>
          <h3>贈り物在庫</h3>
          <p>花束、紫、橙の順で並べています。所持数は各タイルの下で直接編集できます。</p>
        </div>
      </div>

      <div className="inventory-grid">
        {items.map((item) => (
          <InventoryItemRow
            key={item.id}
            item={item}
            quantityInput={quantityInputs[item.id] ?? '0'}
            onQuantityChange={onItemQuantityChange}
            onQuantityCommit={onSaveItemQuantity}
          />
        ))}

        <InventoryBoxTile
          quantity={boxQuantity}
          span={boxTileSpan}
          onChange={onBoxQuantityChange}
          onCommit={onSaveBoxQuantity}
        />
      </div>
    </section>
  )
}
