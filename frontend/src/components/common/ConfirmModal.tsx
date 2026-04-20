type ConfirmModalProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = '削除する',
  cancelLabel = 'キャンセル',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div aria-modal="true" className="modal-card" role="dialog">
        <div className="modal-copy">
          <h3>{title}</h3>
          <p>{message}</p>
        </div>
        <div className="modal-actions">
          <button className="btn" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn btn-danger" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
