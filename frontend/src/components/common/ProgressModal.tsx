type ProgressModalProps = {
  open: boolean
  title: string
  message: string
  current: number
  total: number
}

export function ProgressModal({
  open,
  title,
  message,
  current,
  total,
}: ProgressModalProps) {
  if (!open) {
    return null
  }

  const safeTotal = total > 0 ? total : 1
  const percent = Math.max(0, Math.min(100, Math.round((current / safeTotal) * 100)))

  return (
    <div className="modal-backdrop" role="presentation">
      <div aria-modal="true" className="modal-card modal-progress" role="dialog">
        <div className="modal-copy">
          <h3>{title}</h3>
          <p>{message || '処理を実行しています...'}</p>
        </div>
        <div className="progress-rail">
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="progress-meta">
          <span>{percent}%</span>
          <span>
            {current} / {total || '?'}
          </span>
        </div>
      </div>
    </div>
  )
}
