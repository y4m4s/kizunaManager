import { useLayoutEffect, useRef } from 'react'
import { SEARCH_EFFECT_COLUMNS } from '../../constants'
import { effectIconUrl } from '../../lib/uiAssets'
import type { Item, SearchResult } from '../../types'
import { IconThumb } from '../common/IconThumb'
import { StudentGiftHoverCard } from '../common/StudentGiftHoverCard'

type EffectKey = (typeof SEARCH_EFFECT_COLUMNS)[number]['key']

// 生徒タイルの最小幅。表示中の最長の名前がこれより広い場合はタイル幅を揃えて広げる
const STUDENT_TILE_MIN_WIDTH = 84
// タイル内の左右パディング分 + 端数対策
const STUDENT_TILE_PADDING = 12

type GiftSearchResultsProps = {
  gifts: Item[]
  giftRefreshKey?: number | string
  rows: SearchResult[]
}

type StudentEntry = {
  student_id: number
  student_name: string
  icon_path: string
}

type GiftTable = {
  gift: Item
  total: number
  effects: Record<EffectKey, StudentEntry[]>
}

function buildGiftTables(gifts: Item[], rows: SearchResult[]): GiftTable[] {
  return gifts.map((gift) => {
    const effects = { extra_large: [], large: [], medium: [] } as Record<EffectKey, StudentEntry[]>
    for (const row of rows) {
      for (const column of SEARCH_EFFECT_COLUMNS) {
        if (row.effects[column.key].some((item) => item.id === gift.id)) {
          effects[column.key].push({
            student_id: row.student_id,
            student_name: row.student_name,
            icon_path: row.icon_path,
          })
        }
      }
    }
    for (const column of SEARCH_EFFECT_COLUMNS) {
      effects[column.key].sort((left, right) => left.student_name.localeCompare(right.student_name, 'ja'))
    }
    const total = SEARCH_EFFECT_COLUMNS.reduce((sum, column) => sum + effects[column.key].length, 0)
    return { gift, total, effects }
  })
}

export function GiftSearchResults({ gifts, giftRefreshKey, rows }: GiftSearchResultsProps) {
  const stackRef = useRef<HTMLDivElement | null>(null)

  // 名前を改行・省略せず1行で出すため、表示中で最長の名前に合わせて全タイルの幅を揃える
  useLayoutEffect(() => {
    const stack = stackRef.current
    if (!stack) return
    let disposed = false
    const measure = () => {
      if (disposed) return
      let longest = 0
      stack.querySelectorAll<HTMLElement>('.gift-result-student .student-gift-hover-name').forEach((name) => {
        const range = document.createRange()
        range.selectNodeContents(name)
        longest = Math.max(longest, range.getBoundingClientRect().width)
      })
      const width = Math.max(STUDENT_TILE_MIN_WIDTH, Math.ceil(longest + STUDENT_TILE_PADDING))
      stack.style.setProperty('--gift-student-tile-width', `${width}px`)
    }
    measure()
    // Webフォント読み込み後に名前の幅が変わる場合があるので再計測
    void document.fonts?.ready.then(measure)
    return () => {
      disposed = true
    }
  }, [gifts, rows])

  if (!gifts.length) {
    return (
      <section className="card-shell">
        <div className="empty-state">
          <p>条件に合う検索結果がありません。</p>
        </div>
      </section>
    )
  }

  const visibleColumns = SEARCH_EFFECT_COLUMNS
  const tables = buildGiftTables(gifts, rows)

  return (
    <div ref={stackRef} className="gift-results-stack">
      {tables.map(({ gift, total, effects }) => (
        <section key={gift.id} className="card-shell gift-result-table" aria-label={`${gift.name} の検索結果`}>
          <div className="gift-result-row gift-result-row-head">
            <div className="gift-result-label gift-result-gift">
              <span className={`gift-result-gift-icon ${gift.rarity === 'SSR' ? 'rarity-ssr' : 'rarity-sr'}`}>
                <IconThumb filePath={gift.icon_path} label={gift.name} size={48} tone="gift" />
              </span>
              <span className="gift-result-gift-name">{gift.name}</span>
            </div>
            <div className="gift-result-students-head">
              <span>生徒</span>
              <small>{`${total}人`}</small>
            </div>
          </div>

          {visibleColumns.map((column) => {
            const students = effects[column.key]
            const iconSrc = effectIconUrl(column.key)
            return (
              <div key={column.key} className="gift-result-row" data-effect={column.key}>
                <div className="gift-result-label gift-result-effect">
                  <span className="gift-result-effect-inner">
                    {iconSrc ? <img alt="" className="effect-header-icon" src={iconSrc} /> : null}
                    <span>{column.label}</span>
                  </span>
                </div>
                <div className="gift-result-students">
                  {students.length ? (
                    students.map((student) => (
                      <div key={student.student_id} className="gift-result-student">
                        <StudentGiftHoverCard
                          iconPath={student.icon_path}
                          iconSize={44}
                          refreshKey={giftRefreshKey}
                          studentId={student.student_id}
                          studentName={student.student_name}
                        />
                      </div>
                    ))
                  ) : (
                    <span className="gift-result-none">該当なし</span>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
