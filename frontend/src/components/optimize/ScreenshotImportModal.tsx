import { useCallback, useMemo, useRef, useState } from 'react'
import { loadIconReferences, loadScreenshot } from '../../lib/screenshotImport/loadImages'
import {
  inferZeroItems,
  mergeReadings,
  readScreenshot,
  type IconReference,
  type MergedReading,
  type ScreenshotReading,
} from '../../lib/screenshotImport/recognize'
import type { Item } from '../../types'
import { IconThumb } from '../common/IconThumb'
import { ScreenshotDropZone } from '../screenshot/ScreenshotDropZone'
import { useScreenshotQueue, type ShotResult } from '../screenshot/useScreenshotQueue'

type RowState = {
  checked: boolean
  value: string
}

type ScreenshotImportModalProps = {
  items: Item[]
  initialFiles: File[]
  onApply: (updates: Array<{ itemId: number; quantity: number }>) => void
  onClose: () => void
}

// 選択式ボックスと上級テイラーストーンはゲームのアイテム一覧に出ないので、取り込みの対象にしない
// (写っていなくても 0 にしない)
const EXCLUDED_NAMES = new Set(['選択式ボックス', '上級テイラーストーン'])
const EXCLUDED_ICON_PATTERN = /item_icon_favor_selection|item_icon_shiftingcraftitem/

function isImportTarget(item: Item): boolean {
  return item.id > 0 &&
    !EXCLUDED_NAMES.has(item.name) &&
    !EXCLUDED_ICON_PATTERN.test(String(item.icon_path || ''))
}

type ResultRow = MergedReading & {
  // 写っていないので 0 と判断した行
  inferred: boolean
}

export function ScreenshotImportModal({ items, initialFiles, onApply, onClose }: ScreenshotImportModalProps) {
  // ユーザーが触った行だけ保持する。触っていない行は読み取り結果から決める。
  const [overrides, setOverrides] = useState<Record<number, RowState>>({})
  const [zeroUncertain, setZeroUncertain] = useState(false)
  const iconsRef = useRef<Promise<IconReference[]> | null>(null)

  const targetItems = useMemo(() => items.filter(isImportTarget), [items])
  const itemsById = useMemo(() => new Map(targetItems.map((item) => [item.id, item])), [targetItems])
  const itemOrder = useMemo(() => new Map(items.map((item, index) => [item.id, index])), [items])
  // ゲームの「デフォルト」の並び = アイテム ID 順
  const gameOrder = useMemo(() => targetItems.map((item) => item.id).sort((a, b) => a - b), [targetItems])

  const read = useCallback(async (file: File): Promise<ShotResult<ScreenshotReading>> => {
    if (!iconsRef.current) iconsRef.current = loadIconReferences(targetItems)
    const [image, references] = await Promise.all([loadScreenshot(file), iconsRef.current])
    if (!references.length) throw new Error('贈り物アイコンを読み込めませんでした。画像ダウンロードを済ませてください。')
    const reading = readScreenshot(image, references)
    if (reading.error) return { reading, message: reading.error, error: true }
    const known = reading.cards.filter((card) => card.itemId !== null).length
    return { reading, message: `${known} 件を読み取り` }
  }, [targetItems])
  const { shots, addFiles, busy } = useScreenshotQueue({ initialFiles, read, onClose })

  const readings = useMemo(
    () => shots.flatMap((shot) => (shot.status === 'done' && shot.reading ? [shot.reading] : [])),
    [shots],
  )
  const inference = useMemo(
    () => (readings.length ? inferZeroItems(readings, gameOrder) : null),
    [readings, gameOrder],
  )

  const resultRows = useMemo<ResultRow[]>(() => {
    const read = mergeReadings(readings)
      .filter((reading) => itemsById.has(reading.itemId))
      .map((reading) => ({ ...reading, inferred: false }))
    // 撮れている範囲で写っていない贈り物は 0。今 0 のものは変化が無いので出さない。
    const zeros = (inference?.certainZero ?? [])
      .filter((itemId) => Number(itemsById.get(itemId)?.quantity || 0) > 0)
      .map((itemId) => ({ itemId, quantity: 0, confident: true, candidates: [0], note: '', inferred: true }))
    return [...read, ...zeros]
      .sort((a, b) => (itemOrder.get(a.itemId) ?? 0) - (itemOrder.get(b.itemId) ?? 0))
  }, [readings, inference, itemsById, itemOrder])

  const uncertainItems = useMemo(
    () => (inference?.uncertain ?? [])
      .map((itemId) => itemsById.get(itemId) as Item)
      .filter((item) => Number(item.quantity || 0) > 0),
    [inference, itemsById],
  )

  function rowFor(itemId: number, quantity: number | null, confident: boolean): RowState {
    const override = overrides[itemId]
    if (override) return override
    const current = Number(itemsById.get(itemId)?.quantity || 0)
    return {
      checked: confident && quantity !== null && quantity !== current,
      value: quantity === null ? '' : String(quantity),
    }
  }

  const updates = [
    ...resultRows.flatMap((reading) => {
      const row = rowFor(reading.itemId, reading.quantity, reading.confident)
      if (!row.checked || !/^\d+$/.test(row.value)) return []
      return [{ itemId: reading.itemId, quantity: Number(row.value) }]
    }),
    ...(zeroUncertain ? uncertainItems.map((item) => ({ itemId: item.id, quantity: 0 })) : []),
  ]
  const needsReview = resultRows.filter((reading) => !reading.confident).length
  const readCount = resultRows.filter((reading) => !reading.inferred).length
  const zeroCount = resultRows.length - readCount

  return (
    <div className="modal-backdrop" role="presentation">
      <div aria-labelledby="screenshot-import-title" aria-modal="true" className="modal-card screenshot-import-modal" role="dialog">
        <div className="screenshot-import-head">
          <div>
            <h3 id="screenshot-import-title">スクショから所持数を取り込み</h3>
            <p>PC 版の「アイテム」画面のスクショを、スクロールしながら重なるように撮って入れてください。</p>
          </div>
          <button aria-label="閉じる" className="modal-close-button" type="button" onClick={onClose}>×</button>
        </div>

        <ScreenshotDropZone
          shots={shots}
          tips={[
            '並び替えは「デフォルト」のまま',
            '一覧の先頭から末尾まで、前の画像と重なるようにスクロール',
            '写っていない贈り物は所持数 0 として扱います',
          ]}
          onFiles={addFiles}
        />

        {resultRows.length || inference ? (
          <div className="screenshot-results">
            <div className="screenshot-results-summary">
              <span>{`${readCount} 種類を読み取りました`}</span>
              {zeroCount ? <span className="screenshot-badge is-zero">{`写っていない ${zeroCount} 件を 0 に`}</span> : null}
              {needsReview ? <span className="screenshot-badge is-review">{`要確認 ${needsReview} 件`}</span> : null}
            </div>
            {inference?.complete ? (
              <p className="screenshot-coverage is-complete">
                一覧の先頭から末尾まで撮れています。写っていない贈り物は所持数 0 として扱います。
              </p>
            ) : inference?.warnings.length ? (
              <div className="screenshot-coverage is-partial">
                {inference.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                <p>撮れている範囲で写っていない贈り物だけを 0 にします。</p>
              </div>
            ) : null}
            <table className="screenshot-table">
              <thead>
                <tr>
                  <th aria-label="反映する" />
                  <th>贈り物</th>
                  <th className="numeric">現在</th>
                  <th className="numeric">読み取り</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {resultRows.map((reading) => {
                  const item = itemsById.get(reading.itemId) as Item
                  const row = rowFor(reading.itemId, reading.quantity, reading.confident)
                  const current = Number(item.quantity || 0)
                  const valid = /^\d+$/.test(row.value)
                  const diff = valid ? Number(row.value) - current : 0
                  return (
                    <tr key={reading.itemId} className={reading.confident ? '' : 'is-review'}>
                      <td>
                        <input
                          aria-label={`${item.name} を反映する`}
                          checked={row.checked && valid}
                          disabled={!valid}
                          type="checkbox"
                          onChange={(event) =>
                            setOverrides((all) => ({ ...all, [reading.itemId]: { ...row, checked: event.target.checked } }))
                          }
                        />
                      </td>
                      <td>
                        <span className="screenshot-item">
                          <IconThumb filePath={item.icon_path} label={item.name} size={32} tone="gift" />
                          <span>{item.name.split('\n')[0]}</span>
                        </span>
                      </td>
                      <td className="numeric">{current}</td>
                      <td className="numeric">
                        <input
                          aria-label={`${item.name} の読み取り結果`}
                          className={`text-input compact screenshot-value${valid ? '' : ' is-invalid'}`}
                          inputMode="numeric"
                          type="text"
                          value={row.value}
                          onChange={(event) => {
                            const value = event.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^\d]/g, '')
                            setOverrides((all) => ({
                              ...all,
                              [reading.itemId]: { checked: /^\d+$/.test(value) && Number(value) !== current, value },
                            }))
                          }}
                        />
                      </td>
                      <td>
                        {reading.inferred && valid && Number(row.value) === 0 ? (
                          <span className="screenshot-badge is-zero">{`写っていない → 0 (${diff})`}</span>
                        ) : !reading.confident ? (
                          <span className="screenshot-badge is-review">{reading.note || '要確認'}</span>
                        ) : !valid ? (
                          <span className="screenshot-badge is-review">数を入力してください</span>
                        ) : diff === 0 ? (
                          <span className="screenshot-badge is-same">変更なし</span>
                        ) : (
                          <span className="screenshot-badge is-change">{diff > 0 ? `+${diff}` : String(diff)}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {uncertainItems.length ? (
              <label className="screenshot-missing">
                <input checked={zeroUncertain} type="checkbox" onChange={(event) => setZeroUncertain(event.target.checked)} />
                <span>
                  {`撮っていない範囲の贈り物 ${uncertainItems.length} 件も 0 にする`}
                  <small>
                    撮れていない範囲にあるため、0 かどうか確かめられません。
                    {`(${uncertainItems.map((item) => item.name.split('\n')[0]).join('、')})`}
                  </small>
                </span>
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="modal-actions">
          <button className="btn" type="button" onClick={onClose}>キャンセル</button>
          <button
            className="btn btn-primary"
            disabled={busy || !updates.length}
            type="button"
            onClick={() => onApply(updates)}
          >
            {busy ? '読み取り中…' : `${updates.length} 件を反映`}
          </button>
        </div>
      </div>
    </div>
  )
}
