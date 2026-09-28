import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { SEARCH_EFFECT_COLUMNS } from '../../constants'
import type { SearchResult, SlimItem } from '../../types'
import { effectIconUrl } from '../../lib/uiAssets'
import { IconThumb } from '../common/IconThumb'
import { StudentGiftHoverCard } from '../common/StudentGiftHoverCard'

// 生徒列は最小幅を基本に、名前が収まらない場合だけ広げる。
// 効果列(特大/大/中)は等幅のまま上限を設けて、結果領域全体を必要以上に広げない
const STUDENT_COLUMN_MIN_WIDTH = 260
const EFFECT_COLUMN_MAX_WIDTH = 280
// 生徒欄の中央寄せ用: アイコン(40) + 間隔(10) + 表示中で最長の名前 を1つの枠として中央に置く。
// 枠内は左揃えなので、名前の長さが違ってもアイコンの位置は全行で揃う
const STUDENT_ICON_BLOCK_WIDTH = 50
// 枠の左右に確保する余白
const STUDENT_SIDE_GUTTER = 40

type SearchResultsTableProps = {
  giftRefreshKey?: number | string
  rows: SearchResult[]
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
  giftRefreshKey,
  rows,
}: SearchResultsTableProps) {
  const shellRef = useRef<HTMLElement | null>(null)
  const visibleColumns = SEARCH_EFFECT_COLUMNS
  const layoutStyle = {
    '--search-columns': `var(--search-student-col, ${STUDENT_COLUMN_MIN_WIDTH}px) repeat(${visibleColumns.length}, minmax(180px, 1fr))`,
    '--search-max-width': `calc(var(--search-student-col, ${STUDENT_COLUMN_MIN_WIDTH}px) + ${EFFECT_COLUMN_MAX_WIDTH * visibleColumns.length}px)`,
  } as CSSProperties

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    let disposed = false
    const measure = () => {
      if (disposed) return
      const names = shell.querySelectorAll<HTMLElement>('.result-student-main .student-gift-hover-name')
      let longest = 0
      names.forEach((name) => {
        // scrollWidth は整数に丸められるため、小数幅の文字列でも欠けないよう実寸を使う
        const range = document.createRange()
        range.selectNodeContents(name)
        longest = Math.max(longest, range.getBoundingClientRect().width, name.scrollWidth)
      })
      // 端数で折り返し・欠けが出ないよう少し余裕を持たせる
      const inner = Math.ceil(STUDENT_ICON_BLOCK_WIDTH + longest + 2)
      const column = Math.max(STUDENT_COLUMN_MIN_WIDTH, inner + STUDENT_SIDE_GUTTER * 2)
      shell.style.setProperty('--search-student-inner', `${inner}px`)
      shell.style.setProperty('--search-student-col', `${column}px`)
    }
    measure()
    // Webフォント読み込み後に名前の幅が変わる場合があるので再計測
    void document.fonts?.ready.then(measure)
    return () => {
      disposed = true
    }
  }, [rows])

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
    <section ref={shellRef} className="card-shell results-shell" style={layoutStyle}>
      <div className="results-grid results-grid-header">
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
          <div key={row.student_id} className="results-grid result-row">
            <div className="result-student-cell" data-label="生徒">
              <div className="result-student-main">
                <StudentGiftHoverCard
                  iconPath={row.icon_path}
                  iconSize={40}
                  refreshKey={giftRefreshKey}
                  studentId={row.student_id}
                  studentName={row.student_name}
                />
              </div>
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
