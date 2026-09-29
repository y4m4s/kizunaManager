import type { Item } from '../../types'
import advancedTaylorStoneIconUrl from '../../../../data/images/items/item_icon_shiftingcraftitem_2.webp'
import { SELECTABLE_BOX_ICON_URL } from '../../lib/uiAssets'
import { InventoryResourceTile } from './InventoryResourceTile'
import { InventoryItemRow } from './InventoryItemRow'

type InventoryEditorProps = {
  boxQuantity: string
  stoneQuantity: string
  items: Item[]
  quantityInputs: Record<number, string>
  onBoxQuantityChange: (value: string) => void
  onStoneQuantityChange: (value: string) => void
  onItemQuantityChange: (itemId: number, value: string) => void
  onSaveBoxQuantity: () => void
  onSaveStoneQuantity: () => void
  onSaveItemQuantity: (itemId: number) => void
}

export function InventoryEditor({
  boxQuantity,
  stoneQuantity,
  items,
  quantityInputs,
  onBoxQuantityChange,
  onStoneQuantityChange,
  onItemQuantityChange,
  onSaveBoxQuantity,
  onSaveStoneQuantity,
  onSaveItemQuantity,
}: InventoryEditorProps) {
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

        <InventoryResourceTile
          name="選択式ボックス"
          description="橙大として計算"
          iconUrl={SELECTABLE_BOX_ICON_URL}
          quantity={boxQuantity}
          span={2}
          onChange={onBoxQuantityChange}
          onCommit={onSaveBoxQuantity}
        />
        <InventoryResourceTile
          name="上級テイラーストーン"
          description="1個＋橙2個でボックス1個"
          iconUrl={advancedTaylorStoneIconUrl}
          quantity={stoneQuantity}
          span={2}
          onChange={onStoneQuantityChange}
          onCommit={onSaveStoneQuantity}
        />
      </div>
    </section>
  )
}
