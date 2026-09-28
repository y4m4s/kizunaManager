import { useEffect, useState } from 'react'
import { formatSnapshotDate } from '../../lib/optimizeCompare'
import type { OptimizeSnapshotSummary } from '../../types'
import { ConfirmModal } from '../common/ConfirmModal'

type OptimizeHistoryModalProps = {
  canSave: boolean
  currentSaved: boolean
  error: string
  onClose: () => void
  onCompare: (snapshotId: number) => void
  onDelete: (snapshotId: number) => Promise<void>
  onSave: (label: string) => Promise<void>
  snapshots: OptimizeSnapshotSummary[]
}

function paramsLabel(snapshot: OptimizeSnapshotSummary): string {
  const params = snapshot.params
  const parts = [
    `カフェ 最優先${params.daily_top_priority_cafe_taps}/その他${params.daily_other_cafe_taps}`,
    `スケジュール${params.daily_schedules}`,
  ]
  if (!params.include_semi_priority) parts.push('準優先なし')
  if (params.use_leftover_ssr_for_top) parts.push('紫を最優先へ')
  return parts.join(' ・ ')
}

export function OptimizeHistoryModal({
  canSave,
  currentSaved,
  error,
  onClose,
  onCompare,
  onDelete,
  onSave,
  snapshots,
}: OptimizeHistoryModalProps) {
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<OptimizeSnapshotSummary | null>(null)

  useEffect(() => {
    if (pendingDelete) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [pendingDelete, onClose])

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(label)
      setLabel('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div
        className="modal-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <div aria-labelledby="optimize-history-title" aria-modal="true" className="modal-card optimize-history-modal" role="dialog">
          <div className="optimize-history-head">
            <h3 id="optimize-history-title">最適化履歴</h3>
            <button aria-label="閉じる" className="modal-close-button" title="閉じる" type="button" onClick={onClose}>
              ×
            </button>
          </div>

          <div className="optimize-history-save">
            <input
              className="text-input compact"
              disabled={!canSave || saving}
              maxLength={100}
              placeholder={canSave ? 'メモ (任意)' : '最適化を実行すると保存できます'}
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSave && !saving) void handleSave()
              }}
            />
            <button
              className="btn btn-primary"
              disabled={!canSave || saving}
              type="button"
              onClick={() => void handleSave()}
            >
              {currentSaved ? 'もう一度保存' : '現在の結果を保存'}
            </button>
          </div>
          {error ? <p className="optimize-history-error">{error}</p> : null}

          {snapshots.length ? (
            <ul className="optimize-history-list">
              {snapshots.map((snapshot) => {
                return (
                  <li key={snapshot.id} className="optimize-history-item">
                    <button
                      aria-label={`${formatSnapshotDate(snapshot.created_at)}${snapshot.label ? ` ${snapshot.label}` : ''} の計算と現在を比較`}
                      className="optimize-history-open"
                      type="button"
                      onClick={() => onCompare(snapshot.id)}
                    >
                      <span className="optimize-history-copy">
                        <span className="optimize-history-date">
                          {formatSnapshotDate(snapshot.created_at)}
                          <small>{`${snapshot.student_count}人`}</small>
                        </span>
                        {snapshot.label ? <span className="optimize-history-label">{snapshot.label}</span> : null}
                        <span className="optimize-history-params">{paramsLabel(snapshot)}</span>
                      </span>
                      <span aria-hidden="true" className="optimize-history-open-hint">
                        比較
                        <span className="optimize-history-chevron">›</span>
                      </span>
                    </button>
                    <button
                      aria-label={`${formatSnapshotDate(snapshot.created_at)} の履歴を削除`}
                      className="optimize-history-delete"
                      title="この履歴を削除"
                      type="button"
                      onClick={() => setPendingDelete(snapshot)}
                    >
                      削除
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="optimize-history-empty">保存した履歴はまだありません。</p>
          )}
        </div>
      </div>

      <ConfirmModal
        message={
          pendingDelete
            ? `${formatSnapshotDate(pendingDelete.created_at)}${pendingDelete.label ? `「${pendingDelete.label}」` : ''} の最適化履歴を削除します。元に戻せません。`
            : ''
        }
        open={pendingDelete !== null}
        title="最適化履歴を削除"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) void onDelete(target.id)
        }}
      />
    </>
  )
}
