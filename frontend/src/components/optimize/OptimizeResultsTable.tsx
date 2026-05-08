import { assetUrl } from '../../api'
import { OPTIMIZE_PRIORITY_OPTIONS } from '../../constants'
import { formatNumber } from '../../lib/bond'
import { effectIconUrl, SELECTABLE_BOX_ICON_URL } from '../../lib/uiAssets'
import type { Item, OptimizeResult, PriorityKey, Student } from '../../types'
import { IconThumb } from '../common/IconThumb'
import { PrioritySelect } from '../common/PrioritySelect'
import { StudentGiftHoverCard } from '../common/StudentGiftHoverCard'

type OptimizeResultsTableProps = {
  fallbackItemsById: Record<number, Item>
  giftRefreshKey?: number | string
  onPriorityChange: (
    row: OptimizeResult['results'][number],
    priority: PriorityKey,
  ) => void
  prioritySavingStudentId: number | null
  result: OptimizeResult | null
  studentsById: Record<number, Student>
}

const SELECTABLE_BOX_ITEM_ID = -1001
const SELECTABLE_BOX_LABEL = '選択式ボックス'
const SELECTABLE_BOX_EXP = 60

function isBouquetDisplayItem(
  item: { item_name?: string; gift_kind?: string },
  fallbackItem?: Item,
): boolean {
  return item.gift_kind === 'bouquet' ||
    fallbackItem?.gift_kind === 'bouquet' ||
    String(item.item_name || fallbackItem?.name || '').includes('\u82b1\u675f')
}

function toneClassForGift(
  item: {
    item_id: number
    item_name?: string
    gift_kind?: string
    rarity?: string
  },
  fallbackItem?: Item,
): string {
  const giftKind = item.gift_kind || fallbackItem?.gift_kind || 'gift'
  const rarity = item.rarity || fallbackItem?.rarity || ''
  if (item.item_id === SELECTABLE_BOX_ITEM_ID || giftKind === 'gift_box') {
    return 'gift-box'
  }
  if (isBouquetDisplayItem(item, fallbackItem)) {
    return 'bouquet'
  }
  if (rarity === 'SSR') {
    return 'rarity-ssr'
  }
  return 'rarity-sr'
}

function imageSrcForGift(
  item: {
    item_id: number
    icon_path?: string
    gift_kind?: string
  },
  fallbackItem?: Item,
): string | null {
  if (item.item_id === SELECTABLE_BOX_ITEM_ID || item.gift_kind === 'gift_box') {
    return SELECTABLE_BOX_ICON_URL
  }
  return assetUrl(item.icon_path || fallbackItem?.icon_path || '')
}

function giftDisplayRank(
  item: { item_id: number; item_name?: string; gift_kind?: string; rarity?: string },
  fallbackItem?: Item,
): number {
  const giftKind = item.gift_kind || fallbackItem?.gift_kind || 'gift'
  const rarity = item.rarity || fallbackItem?.rarity || ''
  if (item.item_id === SELECTABLE_BOX_ITEM_ID || giftKind === 'gift_box') {
    return 3
  }
  if (rarity === 'SSR' && !isBouquetDisplayItem(item, fallbackItem)) {
    return 0
  }
  if (isBouquetDisplayItem(item, fallbackItem)) {
    return 1
  }
  return 2
}

function sortGiftDisplayItems<T extends { item_id: number; item_name: string; gift_kind?: string; rarity?: string }>(
  items: T[],
  fallbackItemsById: Record<number, Item>,
): T[] {
  return [...items].sort((left, right) => {
    const leftFallback = fallbackItemsById[left.item_id]
    const rightFallback = fallbackItemsById[right.item_id]
    const rankDiff = giftDisplayRank(left, leftFallback) - giftDisplayRank(right, rightFallback)
    if (rankDiff !== 0) {
      return rankDiff
    }
    return left.item_name.localeCompare(right.item_name, 'ja')
  })
}


export function OptimizeResultsTable({
  fallbackItemsById,
  giftRefreshKey,
  onPriorityChange,
  prioritySavingStudentId,
  result,
  studentsById,
}: OptimizeResultsTableProps) {
  if (!result?.results.length) {
    return (
      <section className="card-shell">
        <div className="empty-state">
          <p>まだ最適化結果はありません。</p>
        </div>
      </section>
    )
  }

  return (
    <section className="card-shell optimize-results">
      <div className="optimize-table-head optimize-table-row">
        <div>生徒</div>
        <div>誕生日まで</div>
        <div>優先度</div>
        <div>獲得EXP</div>
        <div>到達予測</div>
        <div>配分内訳</div>
      </div>

      <div className="optimize-table-body">
        {result.results.map((row) => {
          const student = studentsById[row.student_id]
          const birthday = student?.birthday || row.birthday || '-'
          const hasBirthday = birthday !== '-'
          const daysUntilBirthday = Number(row.days_until_birthday || 0)
          const daysLabel = hasBirthday
            ? daysUntilBirthday === 0
              ? '今日'
              : `あと${formatNumber(daysUntilBirthday)}日`
            : '未設定'
          const birthdayTone = !hasBirthday
            ? ' empty'
            : daysUntilBirthday === 0
              ? ' today'
              : daysUntilBirthday <= 30
                ? ' soon'
                : ''
          const shortageExp = Math.max(0, Number(row.remaining_exp || 0))
          const shortageBoxCount = Math.ceil(shortageExp / SELECTABLE_BOX_EXP)
          const predictedLabel = `Lv${row.current_bond_level} ⇒ Lv${row.predicted_level}`
          return (
            <div key={row.student_id} className="optimize-table-row" data-priority={row.priority}>
              <div className="opt-student-cell" data-label="生徒">
                <StudentGiftHoverCard
                  iconPath={student?.icon_path}
                  iconSize={34}
                  refreshKey={giftRefreshKey}
                  studentId={row.student_id}
                  studentName={row.student_name}
                />
              </div>
              <div className="opt-birthday-cell" data-label="誕生日まで">
                <span className={`opt-birthday-days${birthdayTone}`}>{daysLabel}</span>
                <span className="opt-birthday-date">{hasBirthday ? birthday : '誕生日なし'}</span>
              </div>
              <div className="opt-priority-cell" data-label="優先度">
                <PrioritySelect
                  disabled={prioritySavingStudentId === row.student_id}
                  options={OPTIMIZE_PRIORITY_OPTIONS}
                  studentName={row.student_name}
                  value={row.priority}
                  onChange={(priority) => onPriorityChange(row, priority)}
                />
              </div>
              <div className="opt-allocated-cell" data-label="獲得EXP">
                <span className="opt-exp-breakdown">
                  <span className="opt-exp-main">{formatNumber(row.allocated_exp)}</span>
                  <span className="opt-exp-passive">{`+${formatNumber(row.passive_exp)}`}</span>
                </span>
              </div>
              <div className="opt-predicted-cell" data-label="到達予測">
                {shortageExp > 0 ? (
                  <span
                    className="opt-predicted-shortage"
                    tabIndex={0}
                  >
                    <span className="opt-predicted-text">{predictedLabel}</span>
                    <span className="opt-shortage-card" role="tooltip">
                      <span className="opt-shortage-card-title">目標まで不足</span>
                      <span className="opt-shortage-card-row">
                        <span>必要EXP</span>
                        <strong>{formatNumber(shortageExp)}</strong>
                      </span>
                      <span className="opt-shortage-card-row">
                        <span>{SELECTABLE_BOX_LABEL}</span>
                        <strong>{formatNumber(shortageBoxCount)}個分</strong>
                      </span>
                    </span>
                  </span>
                ) : (
                  predictedLabel
                )}
              </div>
              <div className="opt-items-cell" data-label="配分内訳">
                {row.allocated_items.length ? (
                  <div className="opt-items-grid">
                    {sortGiftDisplayItems(row.allocated_items, fallbackItemsById).map((item) => {
                      const fallbackItem = fallbackItemsById[item.item_id]
                      const toneClass = toneClassForGift(item, fallbackItem)
                      const imageSrc = imageSrcForGift(item, fallbackItem)
                      const effectIconSrc = effectIconUrl(item.effect)
                      return (
                        <div
                          key={`${row.student_id}:${item.item_id}:${item.effect}`}
                          className={`opt-item-card ${toneClass}`}
                          title={`${item.item_name} x${item.count}`}
                        >
                          {effectIconSrc ? (
                            <span className="opt-item-effect-badge">
                              <img
                                alt={item.effect_label}
                                className="opt-item-effect-image"
                                height={18}
                                src={effectIconSrc}
                                width={18}
                              />
                            </span>
                          ) : null}
                          {imageSrc ? (
                            <img
                              alt={item.item_name}
                              className="opt-item-image"
                              height={56}
                              src={imageSrc}
                              width={56}
                            />
                          ) : (
                            <IconThumb
                              filePath={item.icon_path || fallbackItem?.icon_path}
                              label={item.item_name}
                              size={56}
                              tone="gift"
                            />
                          )}
                          <span className="opt-item-badge">{`x${item.count}`}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  '割り当てなし'
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="optimize-leftovers">
        <div className="optimize-leftovers-grid">
          <section className="optimize-leftovers-main">
            <h3>未使用の贈り物</h3>
            {result.leftovers.length ? (
              <div className="opt-items-grid">
                {sortGiftDisplayItems(result.leftovers, fallbackItemsById).map((item) => {
                  const fallbackItem = fallbackItemsById[item.item_id]
                  const toneClass = toneClassForGift(item, fallbackItem)
                  const imageSrc = imageSrcForGift(item, fallbackItem)
                  return (
                    <div
                      key={`${item.item_id}:${item.item_name}`}
                      className={`opt-item-card ${toneClass}`}
                      title={`${item.item_name} x${item.quantity}`}
                    >
                      {imageSrc ? (
                        <img
                          alt={item.item_name}
                          className="opt-item-image"
                          height={56}
                          src={imageSrc}
                          width={56}
                        />
                      ) : (
                        <IconThumb
                          filePath={item.icon_path || fallbackItem?.icon_path}
                          label={item.item_name}
                          size={56}
                          tone="gift"
                        />
                      )}
                      <span className="opt-item-badge">{`x${item.quantity}`}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p>未使用の贈り物はありません。</p>
            )}
          </section>

          <aside className="optimize-leftovers-side">
            <h3>作れる選択式ボックス</h3>
            <p className="helper-text">{`橙 ${result.craftable_boxes.source_item_count} 個から換算`}</p>
            <div className="opt-items-grid opt-items-grid-compact">
              <div
                className="opt-item-card gift-box"
                title={`${SELECTABLE_BOX_LABEL} x${result.craftable_boxes.box_count}`}
              >
                <img
                  alt={SELECTABLE_BOX_LABEL}
                  className="opt-item-image"
                  height={56}
                  src={SELECTABLE_BOX_ICON_URL}
                  width={56}
                />
                <span className="opt-item-badge">{`x${result.craftable_boxes.box_count}`}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
