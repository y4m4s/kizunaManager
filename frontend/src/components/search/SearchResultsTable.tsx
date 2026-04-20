import type { CSSProperties } from 'react'
import { SEARCH_EFFECT_COLUMNS } from '../../constants'
import type { SearchResult, SlimItem } from '../../types'
import { effectIconUrl } from '../../lib/uiAssets'
import { IconThumb } from '../common/IconThumb'

type SearchResultsTableProps = {
  hideMedium: boolean
  mode: 'gift' | 'student'
  rows: SearchResult[]
  onHideRow: (studentId: number) => void
}

function GiftCell({ items }: { items: SlimItem[] }) {
  if (!items.length) {
    return <div className="result-cell-empty" />
  }

  return (
    <div className="result-gift-grid">
      {items.map((item) => (
        <div
          key={`${item.id}-${item.effect}`}
          className={`result-gift-card ${item.rarity === 'SSR' ? 'rarity-ssr' : 'rarity-sr'}`}
          title={`${item.name} / ${item.effect_label}`}
        >
          <IconThumb filePath={item.icon_path} label={item.name} size={42} tone="gift" />
        </div>
      ))}
    </div>
  )
}

export function SearchResultsTable({
  hideMedium,
  mode,
  rows,
  onHideRow,
}: SearchResultsTableProps) {
  const visibleColumns = SEARCH_EFFECT_COLUMNS.filter(
    (column) => !(hideMedium && column.key === 'medium'),
  )

  if (!rows.length) {
    return (
      <section className="card-shell">
        <div className="empty-state">
          <p>条件に合う検索結果がありません。</p>
        </div>
      </section>
    )
  }

  return (
    <section className="card-shell results-shell">
      <div
        className="results-grid results-grid-header"
        style={
          {
            '--search-columns': `minmax(220px, 1.4fr) repeat(${visibleColumns.length}, minmax(180px, 1fr))`,
          } as CSSProperties
        }
      >
        <div className="result-header-cell">生徒</div>
        {visibleColumns.map((column) => (
          <div key={column.key} className="result-header-cell">
            <div className="effect-header">
              <img
                alt={column.label}
                className="effect-header-icon"
                src={effectIconUrl(column.key) ?? undefined}
              />
              <span>{column.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="results-body">
        {rows.map((row) => (
          <div
            key={row.student_id}
            className="results-grid result-row"
            style={
              {
                '--search-columns': `minmax(220px, 1.4fr) repeat(${visibleColumns.length}, minmax(180px, 1fr))`,
              } as CSSProperties
            }
          >
            <div className="result-student-cell">
              <div className="result-student-main">
                <IconThumb filePath={row.icon_path} label={row.student_name} size={40} tone="student" />
                <strong>{row.student_name}</strong>
              </div>
              {mode === 'gift' ? (
                <button
                  aria-label={`${row.student_name} を非表示`}
                  className="ghost-icon-button"
                  type="button"
                  onClick={() => onHideRow(row.student_id)}
                >
                  ×
                </button>
              ) : null}
            </div>

            {visibleColumns.map((column) => (
              <div key={column.key} className="result-effect-cell" data-label={column.label}>
                <GiftCell items={row.effects[column.key]} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
