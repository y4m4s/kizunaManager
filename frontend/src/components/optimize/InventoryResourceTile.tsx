import { QuantityField } from './QuantityField'

type InventoryResourceTileProps = {
  name: string
  description: string
  iconUrl: string
  quantity: string
  savedQuantity: number
  span: number
  onChange: (value: string) => void
  onCommit: () => void
  onRevert: () => void
}

export function InventoryResourceTile({
  name,
  description,
  iconUrl,
  quantity,
  savedQuantity,
  span,
  onChange,
  onCommit,
  onRevert,
}: InventoryResourceTileProps) {
  return (
    <div
      className="inventory-box-tile-card"
      style={{ ['--inventory-box-span' as string]: String(span) }}
    >
      <div className="inventory-box-tile">
        <img
          alt={name}
          className="inventory-box-icon"
          height={58}
          src={iconUrl}
          width={58}
        />
        <div className="inventory-box-copy">
          <strong>{name}</strong>
          <small>{description}</small>
        </div>
      </div>

      <QuantityField
        ariaLabel={`${name}在庫`}
        savedQuantity={savedQuantity}
        value={quantity}
        onChange={onChange}
        onCommit={onCommit}
        onRevert={onRevert}
      />
    </div>
  )
}
