import { assetUrl } from '../../api'
import { OPTIMIZE_PRIORITY_OPTIONS } from '../../constants'
import { formatNumber } from '../../lib/bond'
import { effectIconUrl, SELECTABLE_BOX_ICON_URL } from '../../lib/uiAssets'
import type { Item, OptimizeResult, PriorityKey, Student } from '../../types'
import { IconThumb } from '../common/IconThumb'

type OptimizeResultsTableProps = {
  fallbackItemsById: Record<number, Item>
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

function toneClassForGift(
  item: {
    item_id: number
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
  if (giftKind === 'bouquet') {
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

export function OptimizeResultsTable({
  fallbackItemsById,
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
        <div>誕生日</div>
        <div>あと</div>
        <div>優先度</div>
        <div>獲得EXP</div>
        <div>到達予測</div>
        <div>配分内訳</div>
      </div>

      <div className="optimize-table-body">
        {result.results.map((row) => {
          const student = studentsById[row.student_id]
          const birthday = student?.birthday || row.birthday || '-'
          const daysLabel = birthday === '-' ? '-' : `あと${row.days_until_birthday}日`
          return (
            <div key={row.student_id} className="optimize-table-row">
              <div className="opt-student-cell">
                <IconThumb
                  filePath={student?.icon_path}
                  label={row.student_name}
                  size={34}
                  tone="student"
                />
                <strong>{row.student_name}</strong>
              </div>
              <div className="opt-birthday-cell">{birthday}</div>
              <div className="opt-days-cell">{daysLabel}</div>
              <div className="opt-priority-cell">
                <select
                  className="select-input compact opt-priority-select"
                  disabled={prioritySavingStudentId === row.student_id}
                  value={row.priority}
                  onChange={(event) => onPriorityChange(row, event.target.value as PriorityKey)}
                >
                  {OPTIMIZE_PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="opt-allocated-cell">
                <span className="opt-exp-breakdown">
                  <span className="opt-exp-main">{formatNumber(row.allocated_exp)}</span>
                  <span className="opt-exp-passive">{`+${formatNumber(row.passive_exp)}`}</span>
                </span>
              </div>
              <div>{`Lv${row.current_bond_level} ⇒ Lv${row.predicted_level}`}</div>
              <div className="opt-items-cell">
                {row.allocated_items.length ? (
                  <div className="opt-items-grid">
                    {row.allocated_items.map((item) => {
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
                {result.leftovers.map((item) => {
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
