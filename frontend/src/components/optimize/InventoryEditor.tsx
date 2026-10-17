import type { Item } from '../../types'
import advancedTaylorStoneIconUrl from '../../../../data/images/items/item_icon_shiftingcraftitem_2.webp'
import { SELECTABLE_BOX_ICON_URL } from '../../lib/uiAssets'
import { InventoryResourceTile } from './InventoryResourceTile'
import { InventoryItemRow } from './InventoryItemRow'

type InventoryEditorProps = {
  boxQuantity: string
  stoneQuantity: string
  savedBoxQuantity: number
  savedStoneQuantity: number
  items: Item[]
  quantityInputs: Record<number, string>
  onBoxQuantityChange: (value: string) => void
  onStoneQuantityChange: (value: string) => void
  onItemQuantityChange: (itemId: number, value: string) => void
  onSaveBoxQuantity: () => void
  onSaveStoneQuantity: () => void
  onSaveItemQuantity: (itemId: number) => void
  onRevertBoxQuantity: () => void
  onRevertStoneQuantity: () => void
  onRevertItemQuantity: (itemId: number) => void
  onPasteItemQuantities: (itemId: number, values: number[]) => void
  onOpenScreenshotImport: () => void
}

export function InventoryEditor({
  boxQuantity,
  stoneQuantity,
  savedBoxQuantity,
  savedStoneQuantity,
  items,
  quantityInputs,
  onBoxQuantityChange,
  onStoneQuantityChange,
  onItemQuantityChange,
  onSaveBoxQuantity,
  onSaveStoneQuantity,
  onSaveItemQuantity,
  onRevertBoxQuantity,
  onRevertStoneQuantity,
  onRevertItemQuantity,
  onPasteItemQuantities,
  onOpenScreenshotImport,
}: InventoryEditorProps) {
  return (
    <section className="card-shell search-section">
      <div className="section-head">
        <div>
          <h3>贈り物在庫</h3>
          <p>花束、紫、橙の順で並べています。所持数は各タイルの下で直接編集できます。</p>
          <ul className="quantity-help" aria-label="所持数入力の操作">
            <li><kbd>Enter</kbd> 次へ / <kbd>Shift</kbd>+<kbd>Enter</kbd> 前へ</li>
            <li><kbd>↑</kbd><kbd>↓</kbd> 上下のタイルへ</li>
            <li><kbd>Esc</kbd> 入力を取り消し</li>
            <li><code>+3</code> <code>-2</code> で今の数から増減、<code>12+5</code> も可</li>
            <li>改行やタブ区切りの数値を貼り付けると、そのタイルから順に入力</li>
          </ul>
        </div>
        <button className="btn screenshot-import-button" type="button" onClick={onOpenScreenshotImport}>
          スクショから取り込み
        </button>
      </div>

      <div className="inventory-grid" data-quantity-grid="">
        {items.map((item) => (
          <InventoryItemRow
            key={item.id}
            item={item}
            quantityInput={quantityInputs[item.id] ?? '0'}
            onQuantityChange={onItemQuantityChange}
            onQuantityCommit={onSaveItemQuantity}
            onQuantityPasteList={onPasteItemQuantities}
            onQuantityRevert={onRevertItemQuantity}
          />
        ))}

        <InventoryResourceTile
          name="選択式ボックス"
          description="橙大として計算"
          iconUrl={SELECTABLE_BOX_ICON_URL}
          quantity={boxQuantity}
          savedQuantity={savedBoxQuantity}
          span={2}
          onChange={onBoxQuantityChange}
          onCommit={onSaveBoxQuantity}
          onRevert={onRevertBoxQuantity}
        />
        <InventoryResourceTile
          name="上級テイラーストーン"
          description="1個＋橙2個でボックス1個"
          iconUrl={advancedTaylorStoneIconUrl}
          quantity={stoneQuantity}
          savedQuantity={savedStoneQuantity}
          span={2}
          onChange={onStoneQuantityChange}
          onCommit={onSaveStoneQuantity}
          onRevert={onRevertStoneQuantity}
        />
      </div>
    </section>
  )
}
