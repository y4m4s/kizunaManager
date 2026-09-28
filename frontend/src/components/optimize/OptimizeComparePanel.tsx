import { useEffect, useMemo } from 'react'
import { PRIORITY_LABELS } from '../../constants'
import { formatNumber } from '../../lib/bond'
import {
  compareWithSnapshot,
  formatSnapshotDate,
  type SnapshotCompareRow,
} from '../../lib/optimizeCompare'
import type { OptimizeResult, OptimizeSnapshot, Student } from '../../types'
import { StudentGiftHoverCard } from '../common/StudentGiftHoverCard'

type OptimizeComparePanelProps = {
  currentResult: OptimizeResult | null
  giftRefreshKey?: number | string
  onBack: () => void
  onClose: () => void
  snapshot: OptimizeSnapshot
  studentsById: Record<number, Student>
}

function signedNumber(value: number): string {
  if (value > 0) return `+${formatNumber(value)}`
  if (value < 0) return `−${formatNumber(Math.abs(value))}`
  return '±0'
}

function toneFor(value: number | null): string {
  if (value === null) return 'none'
  if (value > 0) return 'plus'
  if (value < 0) return 'minus'
  return 'even'
}

const STATUS_NOTE: Record<SnapshotCompareRow['status'], string> = {
  forecast: '現在の計算',
  final: '期限後の実績',
  reached: '目標達成',
  pending: '最適化を実行すると比較',
  excluded: '現在の対象外',
}

function levelLabel(level: number, exp: number): string {
  return exp > 0 ? `Lv${level} (+${formatNumber(exp)})` : `Lv${level}`
}

export function OptimizeComparePanel({
  currentResult,
  giftRefreshKey,
  onBack,
  onClose,
  snapshot,
  studentsById,
}: OptimizeComparePanelProps) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const comparison = useMemo(
    () => compareWithSnapshot(snapshot, currentResult, studentsById),
    [snapshot, currentResult, studentsById],
  )
  const { summary } = comparison

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        aria-labelledby="optimize-compare-title"
        aria-modal="true"
        className="modal-card optimize-compare optimize-compare-modal"
        role="dialog"
      >
        <div className="optimize-compare-head">
          <div className="optimize-compare-title">
            <h3 id="optimize-compare-title">履歴との比較</h3>
            <span className="optimize-compare-date">{`${formatSnapshotDate(snapshot.created_at)} の計算`}</span>
            {snapshot.label ? <span className="optimize-compare-label">{snapshot.label}</span> : null}
            <span className="optimize-compare-elapsed">{`${formatNumber(summary.elapsed_days)}日経過`}</span>
          </div>
          <div className="optimize-compare-summary">
            {summary.comparable > 0 ? (
              <>
                <span className="optimize-compare-chip plus">{`先行 ${summary.ahead}`}</span>
                <span className="optimize-compare-chip minus">{`遅れ ${summary.behind}`}</span>
                <span className={`optimize-compare-chip total ${toneFor(summary.total_diff_exp)}`}>
                  {`合計 ${signedNumber(summary.total_diff_exp)} EXP`}
                </span>
              </>
            ) : (
              <span className="optimize-compare-hint">
                {currentResult ? '比較できる生徒がいません' : '最適化を実行すると差分を表示します'}
              </span>
            )}
            <button className="btn optimize-mini-btn" type="button" onClick={onBack}>
              履歴一覧へ
            </button>
            <button
              aria-label="閉じる"
              className="modal-close-button"
              title="閉じる"
              type="button"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        <div className="optimize-compare-table">
          <div className="optimize-compare-row optimize-compare-row-head">
            <div>生徒</div>
            <div>保存時 → 現在</div>
            <div>実績獲得EXP</div>
            <div>保存時の予測</div>
            <div>比較値</div>
            <div>差分</div>
          </div>
          {comparison.rows.map((row) => {
            const tone = toneFor(row.diff_exp)
            return (
              <div
                key={row.student_id}
                className="optimize-compare-row"
                data-priority={row.priority}
              >
                <div className="optimize-compare-student" data-label="生徒">
                  <StudentGiftHoverCard
                    iconPath={studentsById[row.student_id]?.icon_path}
                    iconSize={28}
                    refreshKey={giftRefreshKey}
                    studentId={row.student_id}
                    studentName={row.student_name}
                  />
                  <span className="optimize-compare-sub">
                    {`${PRIORITY_LABELS[row.priority] ?? row.priority} / 目標 Lv${row.target_bond_level}`}
                  </span>
                </div>
                <div data-label="保存時 → 現在">
                  <span className="optimize-compare-main">{`Lv${row.snapshot_level} → Lv${row.now_level}`}</span>
                  <span className="optimize-compare-sub">
                    {row.days_left === null
                      ? '誕生日なし'
                      : row.status === 'final'
                        ? '見込み期限を経過'
                        : `期限まで あと${formatNumber(row.days_left)}日`}
                  </span>
                </div>
                <div data-label="実績獲得EXP">
                  <span className="optimize-compare-main">{signedNumber(row.gained_exp)}</span>
                  <span className="optimize-compare-sub">
                    {`日課見込み +${formatNumber(row.expected_passive_exp)}`}
                  </span>
                </div>
                <div data-label="保存時の予測">
                  <span className="optimize-compare-main">
                    {levelLabel(row.planned_level, row.planned_level_exp)}
                  </span>
                </div>
                <div data-label="比較値">
                  <span className="optimize-compare-main">
                    {row.compare_level === null
                      ? '-'
                      : levelLabel(row.compare_level, row.compare_level_exp ?? 0)}
                  </span>
                  <span className="optimize-compare-sub">{STATUS_NOTE[row.status]}</span>
                </div>
                <div data-label="差分">
                  {row.diff_exp === null ? (
                    <span className="optimize-compare-diff none">-</span>
                  ) : (
                    <span className={`optimize-compare-diff ${tone}`}>
                      <strong>{`${signedNumber(row.diff_exp)} EXP`}</strong>
                      {row.diff_level ? (
                        <small>{`${row.diff_level > 0 ? '+' : '−'}${Math.abs(row.diff_level)} Lv`}</small>
                      ) : null}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          <p className="optimize-compare-footnote">
            差分は「比較値 − 保存時の予測」です。比較値は通常、現在の最適化結果の到達予測です。保存時に見込んだ誕生日を過ぎた生徒は現在の実績で比較します。
          </p>
        </div>
      </section>
    </div>
  )
}
