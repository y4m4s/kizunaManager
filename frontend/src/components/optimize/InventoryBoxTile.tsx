import { SELECTABLE_BOX_ICON_URL } from '../../lib/uiAssets'

type InventoryBoxTileProps = {
  quantity: string
  span: number
  onChange: (value: string) => void
  onCommit: () => void
}

export function InventoryBoxTile({
  quantity,
  span,
  onChange,
  onCommit,
}: InventoryBoxTileProps) {
  return (
    <div
      className="inventory-box-tile-card"
      style={{ ['--inventory-box-span' as string]: String(span) }}
    >
      <div className="inventory-box-tile">
        <img
          alt="選択式ボックス"
          className="inventory-box-icon"
          height={58}
          src={SELECTABLE_BOX_ICON_URL}
          width={58}
        />
        <div className="inventory-box-copy">
          <strong>選択式ボックス</strong>
          <small>橙大として計算</small>
        </div>
      </div>

      <input
        aria-label="選択式ボックス在庫"
        className="text-input compact inventory-tile-input"
        inputMode="numeric"
        type="text"
        value={quantity}
        onFocus={() => {
          if (quantity === '0') {
            onChange('')
          }
        }}
        onBlur={onCommit}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onCommit()
          }
        }}
      />
    </div>
  )
}
