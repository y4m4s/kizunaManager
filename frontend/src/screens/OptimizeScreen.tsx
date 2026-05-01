import { useEffect, useState } from 'react'
import { api } from '../api'
import { PRIORITY_SORT_ORDER } from '../constants'
import type { Item, OptimizeResult, PriorityKey, Student } from '../types'
import { OptimizeResultsTable } from '../components/optimize/OptimizeResultsTable'

type OptimizeScreenProps = {
  bridgeReady: boolean
  onDataChanged: () => void
  refreshToken: number
}

const LEGACY_DAILY_CAFE_TAPS_KEY = 'optimize:dailyCafeTaps'
const DAILY_TOP_PRIORITY_CAFE_TAPS_KEY = 'optimize:dailyTopPriorityCafeTaps'
const DAILY_OTHER_CAFE_TAPS_KEY = 'optimize:dailyOtherCafeTaps'
const DAILY_SCHEDULES_KEY = 'optimize:dailySchedules'

function validPersistedCount(value: string | null): string | null {
  return value && /^\d+$/.test(value) ? value : null
}

function loadPersistedCount(key: string, fallbackKey?: string): string {
  if (typeof window === 'undefined') {
    return '0'
  }
  const stored = validPersistedCount(window.localStorage.getItem(key))
  if (stored) {
    return stored
  }
  if (fallbackKey) {
    return validPersistedCount(window.localStorage.getItem(fallbackKey)) || '0'
  }
  return '0'
}

function sanitizeCountInput(value: string): string {
  const digitsOnly = value.replace(/[^\d]/g, '')
  return digitsOnly === '' ? '' : String(Number.parseInt(digitsOnly, 10))
}

function parseCountInput(value: string): number {
  if (!value.trim()) {
    return 0
  }
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0
  }
  return parsed
}

export function OptimizeScreen({
  bridgeReady,
  onDataChanged,
  refreshToken,
}: OptimizeScreenProps) {
  const [items, setItems] = useState<Item[]>([])
  const [studentsById, setStudentsById] = useState<Record<number, Student>>({})
  const [dailyTopPriorityCafeTaps, setDailyTopPriorityCafeTaps] = useState(() =>
    loadPersistedCount(DAILY_TOP_PRIORITY_CAFE_TAPS_KEY, LEGACY_DAILY_CAFE_TAPS_KEY),
  )
  const [dailyOtherCafeTaps, setDailyOtherCafeTaps] = useState(() =>
    loadPersistedCount(DAILY_OTHER_CAFE_TAPS_KEY, LEGACY_DAILY_CAFE_TAPS_KEY),
  )
  const [dailySchedules, setDailySchedules] = useState(() => loadPersistedCount(DAILY_SCHEDULES_KEY))
  const [includeSemiPriority, setIncludeSemiPriority] = useState(true)
  const [result, setResult] = useState<OptimizeResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [optimizing, setOptimizing] = useState(false)
  const [prioritySavingStudentId, setPrioritySavingStudentId] = useState<number | null>(null)

  useEffect(() => {
    let disposed = false

    async function load() {
      if (!bridgeReady) {
        setLoading(true)
        return
      }

      setLoading(true)
      const [itemRows, studentRows] = await Promise.all([
        api.list_items(),
        api.search_students('', '', 'name'),
      ])
      if (disposed) {
        return
      }

      const nextStudents = Array.isArray(studentRows) ? studentRows : []

      setItems(Array.isArray(itemRows) ? itemRows : [])
      setStudentsById(Object.fromEntries(nextStudents.map((student) => [student.id, student])))
      setLoading(false)
    }

    void load()

    return () => {
      disposed = true
    }
  }, [bridgeReady, refreshToken])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(DAILY_TOP_PRIORITY_CAFE_TAPS_KEY, dailyTopPriorityCafeTaps || '0')
  }, [dailyTopPriorityCafeTaps])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(DAILY_OTHER_CAFE_TAPS_KEY, dailyOtherCafeTaps || '0')
  }, [dailyOtherCafeTaps])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(DAILY_SCHEDULES_KEY, dailySchedules || '0')
  }, [dailySchedules])

  async function runOptimization() {
    setOptimizing(true)
    try {
      const next = await api.optimize(
        parseCountInput(dailyTopPriorityCafeTaps),
        parseCountInput(dailyOtherCafeTaps),
        parseCountInput(dailySchedules),
        includeSemiPriority,
      )
      if (!next || typeof next !== 'object') {
        setResult(null)
        return
      }

      if ('error' in next && next.error) {
        setResult(null)
        return
      }

      setResult(next as OptimizeResult)
    } finally {
      setOptimizing(false)
    }
  }

  function sortOptimizeResults(results: OptimizeResult['results']): OptimizeResult['results'] {
    return [...results].sort((left, right) => {
      const priorityDiff =
        (PRIORITY_SORT_ORDER[left.priority] ?? Number.MAX_SAFE_INTEGER) -
        (PRIORITY_SORT_ORDER[right.priority] ?? Number.MAX_SAFE_INTEGER)
      if (priorityDiff !== 0) {
        return priorityDiff
      }
      return left.student_name.localeCompare(right.student_name, 'ja')
    })
  }

  function patchResultPriority(studentId: number, priority: PriorityKey) {
    setResult((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        results: sortOptimizeResults(
          current.results.map((row) =>
            row.student_id === studentId ? { ...row, priority } : row,
          ),
        ),
      }
    })
  }

  async function handleResultPriorityChange(
    row: OptimizeResult['results'][number],
    priority: PriorityKey,
  ) {
    const previousPriority = row.priority
    if (!previousPriority || previousPriority === priority) {
      return
    }

    patchResultPriority(row.student_id, priority)
    setPrioritySavingStudentId(row.student_id)
    try {
      await api.save_plan(
        row.student_id,
        row.target_bond_level,
        priority,
        row.notes || '',
        row.id,
      )
      onDataChanged()
      await runOptimization()
    } catch (error) {
      patchResultPriority(row.student_id, previousPriority)
      const message = error instanceof Error ? error.message : String(error)
      window.alert(`優先度の更新に失敗しました: ${message}`)
    } finally {
      setPrioritySavingStudentId(null)
    }
  }

  return (
    <div className="screen-stack">
      <section className="card-shell">
        <div className="section-head compact-head">
          <div>
            <h3>誕生日までの自然加算</h3>
            <p>
              今日から次の誕生日までの残り日数を使って、優先度別のカフェタップとスケジュール分の絆EXPを見込みます。
            </p>
          </div>
        </div>

        <div className="optimize-settings-grid">
          <label className="inline-field">
            <span>1日のカフェタップ回数（最優先）</span>
            <input
              className="text-input compact"
              inputMode="numeric"
              placeholder="0"
              type="text"
              value={dailyTopPriorityCafeTaps}
              onChange={(event) =>
                setDailyTopPriorityCafeTaps(sanitizeCountInput(event.target.value))
              }
            />
          </label>
          <label className="inline-field">
            <span>1日のカフェタップ回数（それ以外）</span>
            <input
              className="text-input compact"
              inputMode="numeric"
              placeholder="0"
              type="text"
              value={dailyOtherCafeTaps}
              onChange={(event) => setDailyOtherCafeTaps(sanitizeCountInput(event.target.value))}
            />
          </label>
          <label className="inline-field">
            <span>1日のスケジュール回数</span>
            <input
              className="text-input compact"
              inputMode="numeric"
              placeholder="0"
              type="text"
              value={dailySchedules}
              onChange={(event) => setDailySchedules(sanitizeCountInput(event.target.value))}
            />
          </label>
        </div>

        <p className="optimize-settings-note">
          カフェタップは最優先とそれ以外で別々に反映します。1回あたり15、スケジュールは Rank 12 想定で通常+25、25%でボーナス+25 の期待値で計算します。
        </p>
      </section>

      <section className="card-shell">
        <div className="toolbar-row">
          <div className="optimize-run-copy">
            <h3>最適化</h3>
            <p className="helper-text">在庫と優先度をもとに、相性と代替性を見ながら配分します。</p>
          </div>
          <div className="toolbar-actions">
            <label className="optimize-toggle-label">
              <input
                checked={includeSemiPriority}
                type="checkbox"
                onChange={(event) => setIncludeSemiPriority(event.target.checked)}
              />
              準優先を含める
            </label>
            <button
              className="btn btn-primary"
              disabled={loading || optimizing || prioritySavingStudentId !== null}
              type="button"
              onClick={() => void runOptimization()}
            >
              最適化を実行
            </button>
          </div>
        </div>
      </section>

      <OptimizeResultsTable
        fallbackItemsById={Object.fromEntries(items.map((item) => [item.id, item]))}
        onPriorityChange={(row, priority) =>
          void handleResultPriorityChange(row, priority)
        }
        prioritySavingStudentId={prioritySavingStudentId}
        result={
          result && !includeSemiPriority
            ? {
                ...result,
                results: result.results.filter((row) => row.priority !== 'semi_priority'),
              }
            : result
        }
        studentsById={studentsById}
      />
    </div>
  )
}
