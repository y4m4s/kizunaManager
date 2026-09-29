type InventoryResourceTileProps = {
  name: string
  description: string
  iconUrl: string
  quantity: string
  span: number
  onChange: (value: string) => void
  onCommit: () => void
}

export function InventoryResourceTile({
  name,
  description,
  iconUrl,
  quantity,
  span,
  onChange,
  onCommit,
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

      <input
        aria-label={`${name}在庫`}
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
