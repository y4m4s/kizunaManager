import { useCallback, useMemo, useRef, useState } from 'react'
import {
  createScaledIconProvider,
  loadScreenshot,
  loadStudentIconSources,
} from '../../lib/screenshotImport/loadImages'
import {
  mergeStudentReadings,
  readStudentScreenshot,
  type ScaledIconProvider,
  type StudentIconSource,
  type StudentScreenshotReading,
} from '../../lib/screenshotImport/studentRecognize'
import type { Student } from '../../types'
import { IconThumb } from '../common/IconThumb'
import { ScreenshotDropZone } from '../screenshot/ScreenshotDropZone'
import { useScreenshotQueue, type ShotResult } from '../screenshot/useScreenshotQueue'

type RowState = {
  checked: boolean
  value: string
}

export type BondImportUpdate = {
  studentId: number
  level: number
}

type BondScreenshotImportModalProps = {
  students: Student[]
  initialFiles: File[]
  onApply: (updates: BondImportUpdate[]) => void
  onClose: () => void
}

function toLevelText(raw: string): string {
  return raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^\d]/g, '')
    .slice(0, 3)
}

function isValidLevel(value: string): boolean {
  if (!/^\d+$/.test(value)) return false
  const level = Number(value)
  return level >= 1 && level <= 100
}

export function BondScreenshotImportModal({ students, initialFiles, onApply, onClose }: BondScreenshotImportModalProps) {
  // ユーザーが触った行だけ保持する。触っていない行は読み取り結果から決める。
  const [overrides, setOverrides] = useState<Record<number, RowState>>({})
  const sourcesRef = useRef<Promise<StudentIconSource[]> | null>(null)
  const scaledIconRef = useRef<ScaledIconProvider | null>(null)

  const studentsById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students])

  const read = useCallback(async (
    file: File,
    progress: (message: string) => void,
    signal: AbortSignal,
  ): Promise<ShotResult<StudentScreenshotReading>> => {
    if (!sourcesRef.current) {
      progress('生徒アイコンを準備中…')
      sourcesRef.current = loadStudentIconSources(students)
    }
    if (!scaledIconRef.current) scaledIconRef.current = createScaledIconProvider()
    const [image, sources] = await Promise.all([loadScreenshot(file), sourcesRef.current])
    if (!sources.length) throw new Error('生徒アイコンを読み込めませんでした。画像ダウンロードを済ませてください。')
    const reading = await readStudentScreenshot(
      image,
      sources,
      scaledIconRef.current,
      (done, total) => progress(`読み取り中… ${done}/${total}`),
      signal,
    )
    if (reading.error) return { reading, message: reading.error, error: true }
    const known = reading.cards.filter((card) => card.studentId !== null).length
    const unknown = reading.cards.length - known
    return { reading, message: `${known} 人を読み取り${unknown ? ` (${unknown} 枚は判定できず)` : ''}` }
  }, [students])
  const { shots, addFiles, busy } = useScreenshotQueue({ initialFiles, read, onClose })

  const merged = useMemo(() => {
    const readings = shots.flatMap((shot) => (shot.status === 'done' && shot.reading ? [shot.reading] : []))
    return mergeStudentReadings(readings).filter((reading) => studentsById.has(reading.studentId))
  }, [shots, studentsById])

  function rowFor(studentId: number, level: number | null, confident: boolean): RowState {
    const override = overrides[studentId]
    if (override) return override
    const student = studentsById.get(studentId)
    // 管理していない生徒は、読めても最初はチェックを入れない (管理一覧が増えすぎないように)
    return {
      checked: Boolean(student?.is_owned) && confident && level !== null && level !== student?.current_bond_level,
      value: level === null ? '' : String(level),
    }
  }

  const updates: BondImportUpdate[] = merged.flatMap((reading) => {
    const row = rowFor(reading.studentId, reading.level, reading.confident)
    if (!row.checked || !isValidLevel(row.value)) return []
    return [{ studentId: reading.studentId, level: Number(row.value) }]
  })
  const needsReview = merged.filter((reading) => !reading.confident).length
  const unregistered = merged.filter((reading) => !studentsById.get(reading.studentId)?.is_owned).length

  return (
    <div className="modal-backdrop" role="presentation">
      <div aria-labelledby="bond-import-title" aria-modal="true" className="modal-card screenshot-import-modal" role="dialog">
        <div className="screenshot-import-head">
          <div>
            <h3 id="bond-import-title">スクショから絆ランクを取り込み</h3>
            <p>PC 版の「生徒」画面 (生徒リスト) のスクショを入れてください。絆ランクの数字とカードの絵から読み取ります。</p>
          </div>
          <button aria-label="閉じる" className="modal-close-button" type="button" onClick={onClose}>×</button>
        </div>

        <ScreenshotDropZone
          shots={shots}
          tips={[
            'ハートと数字が隠れていないカードを読み取ります',
            '上下が少し切れたカードも、絵が半分ほど見えていれば読めます',
            '絆ランクが変わった生徒は、そのランクの経験値を 0 から数えます',
          ]}
          onFiles={addFiles}
        />

        {merged.length ? (
          <div className="screenshot-results">
            <div className="screenshot-results-summary">
              <span>{`${merged.length} 人を読み取りました`}</span>
              {unregistered ? <span className="screenshot-badge is-same">{`未管理 ${unregistered} 人`}</span> : null}
              {needsReview ? <span className="screenshot-badge is-review">{`要確認 ${needsReview} 人`}</span> : null}
            </div>
            <table className="screenshot-table">
              <thead>
                <tr>
                  <th aria-label="反映する" />
                  <th>生徒</th>
                  <th className="numeric">現在</th>
                  <th className="numeric">読み取り</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {merged.map((reading) => {
                  const student = studentsById.get(reading.studentId) as Student
                  const row = rowFor(reading.studentId, reading.level, reading.confident)
                  const owned = student.is_owned
                  const current = student.current_bond_level
                  const valid = isValidLevel(row.value)
                  const diff = valid && owned ? Number(row.value) - current : 0
                  return (
                    <tr key={reading.studentId} className={reading.confident ? '' : 'is-review'}>
                      <td>
                        <input
                          aria-label={`${student.name} を反映する`}
                          checked={row.checked && valid}
                          disabled={!valid}
                          type="checkbox"
                          onChange={(event) =>
                            setOverrides((all) => ({ ...all, [reading.studentId]: { ...row, checked: event.target.checked } }))
                          }
                        />
                      </td>
                      <td>
                        <span className="screenshot-item">
                          <IconThumb filePath={student.icon_path} label={student.name} rounded="circle" size={32} />
                          <span>{student.name}</span>
                        </span>
                      </td>
                      <td className="numeric">{owned ? current : '—'}</td>
                      <td className="numeric">
                        <input
                          aria-label={`${student.name} の読み取り結果`}
                          className={`text-input compact screenshot-value${valid ? '' : ' is-invalid'}`}
                          inputMode="numeric"
                          type="text"
                          value={row.value}
                          onChange={(event) => {
                            const value = toLevelText(event.target.value)
                            setOverrides((all) => ({
                              ...all,
                              [reading.studentId]: {
                                checked: isValidLevel(value) && (!owned || Number(value) !== current),
                                value,
                              },
                            }))
                          }}
                        />
                      </td>
                      <td>
                        {!reading.confident ? (
                          <span className="screenshot-badge is-review">{reading.note || '要確認'}</span>
                        ) : !valid ? (
                          <span className="screenshot-badge is-review">1〜100 で入力してください</span>
                        ) : !owned ? (
                          <span className="screenshot-badge is-zero">未管理 (チェックで追加)</span>
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
            {busy ? '読み取り中…' : `${updates.length} 人を反映`}
          </button>
        </div>
      </div>
    </div>
  )
}
