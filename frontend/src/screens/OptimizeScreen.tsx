import { startTransition, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { OPTIMIZE_STRATEGIES, PRIORITY_SORT_ORDER } from '../constants'
import type { Item, OptimizeResult, PriorityKey, Student } from '../types'
import { InventoryEditor } from '../components/optimize/InventoryEditor'
import { OptimizeResultsTable } from '../components/optimize/OptimizeResultsTable'

type OptimizeScreenProps = {
  bridgeReady: boolean
  onDataChanged: () => void
  refreshToken: number
}

const SELECTABLE_BOX_KEY = 'orange_L'
const DAILY_CAFE_TAPS_KEY = 'optimize:dailyCafeTaps'
const DAILY_SCHEDULES_KEY = 'optimize:dailySchedules'

function loadPersistedCount(key: string): string {
  if (typeof window === 'undefined') {
    return '0'
  }
  const stored = window.localStorage.getItem(key)
  return stored && /^\d+$/.test(stored) ? stored : '0'
}

function inventoryGroupRank(item: Item): number {
  if (item.gift_kind === 'bouquet') {
    return 0
  }
  if (item.rarity === 'SSR') {
    return 1
  }
  return 2
}

function sortInventoryItems(items: Item[]): Item[] {
  return [...items].sort((left, right) => {
    const rankDiff = inventoryGroupRank(left) - inventoryGroupRank(right)
    if (rankDiff !== 0) {
      return rankDiff
    }
    return left.name.localeCompare(right.name, 'ja')
  })
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
  const [itemInputs, setItemInputs] = useState<Record<number, string>>({})
  const [studentsById, setStudentsById] = useState<Record<number, Student>>({})
  const [boxQuantity, setBoxQuantity] = useState('0')
  const [strategy, setStrategy] = useState('priority')
  const [dailyCafeTaps, setDailyCafeTaps] = useState(() => loadPersistedCount(DAILY_CAFE_TAPS_KEY))
  const [dailySchedules, setDailySchedules] = useState(() => loadPersistedCount(DAILY_SCHEDULES_KEY))
  const [result, setResult] = useState<OptimizeResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [optimizing, setOptimizing] = useState(false)
  const [prioritySavingStudentId, setPrioritySavingStudentId] = useState<number | null>(null)

  const itemsRef = useRef<Item[]>([])
  const itemInputsRef = useRef<Record<number, string>>({})
  const boxQuantityRef = useRef('0')
  const savedBoxQuantityRef = useRef(0)
  const itemSaveQueueRef = useRef<Record<number, Promise<void>>>({})
  const boxSaveQueueRef = useRef<Promise<void> | null>(null)

  function setBoxState(value: string) {
    boxQuantityRef.current = value
    setBoxQuantity(value)
  }

  function replaceItems(nextItems: Item[]) {
    itemsRef.current = nextItems
    setItems(nextItems)
  }

  function updateItems(updater: (current: Item[]) => Item[]) {
    const nextItems = updater(itemsRef.current)
    itemsRef.current = nextItems
    startTransition(() => {
      setItems(nextItems)
    })
  }

  function replaceItemInputs(nextInputs: Record<number, string>) {
    itemInputsRef.current = nextInputs
    setItemInputs(nextInputs)
  }

  function updateItemInputs(
    updater: (current: Record<number, string>) => Record<number, string>,
  ) {
    const nextInputs = updater(itemInputsRef.current)
    itemInputsRef.current = nextInputs
    setItemInputs(nextInputs)
  }

  useEffect(() => {
    let disposed = false

    async function load() {
      if (!bridgeReady) {
        setLoading(true)
        return
      }

      setLoading(true)
      const [itemRows, inventoryRows, boxRows, studentRows] = await Promise.all([
        api.list_items(),
        api.get_inventory(),
        api.list_boxes(),
        api.search_students('', '', 'name'),
      ])
      if (disposed) {
        return
      }

      const inventory = inventoryRows && typeof inventoryRows === 'object' ? inventoryRows : {}
      const nextItems = sortInventoryItems(
        (Array.isArray(itemRows) ? itemRows : []).map((item) => ({
          ...item,
          quantity: Number(inventory[String(item.id)] ?? item.quantity ?? 0),
        })),
      )
      const nextInputs = Object.fromEntries(
        nextItems.map((item) => [item.id, String(item.quantity)]),
      ) as Record<number, string>
      const nextBoxes = boxRows && typeof boxRows === 'object' ? boxRows : {}
      const nextBoxQuantity = String(Number(nextBoxes[SELECTABLE_BOX_KEY] ?? 0))
      const nextStudents = Array.isArray(studentRows) ? studentRows : []

      replaceItems(nextItems)
      replaceItemInputs(nextInputs)
      setStudentsById(Object.fromEntries(nextStudents.map((student) => [student.id, student])))
      setBoxState(nextBoxQuantity)
      savedBoxQuantityRef.current = Number(nextBoxQuantity)
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
    window.localStorage.setItem(DAILY_CAFE_TAPS_KEY, dailyCafeTaps || '0')
  }, [dailyCafeTaps])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(DAILY_SCHEDULES_KEY, dailySchedules || '0')
  }, [dailySchedules])

  function queueItemSave(itemId: number) {
    const raw = itemInputsRef.current[itemId] ?? '0'
    const quantity = Number.parseInt(raw || '0', 10)
    if (Number.isNaN(quantity) || quantity < 0) {
      window.alert('所持数は0以上の整数で入力してください。')
      const fallback = String(itemsRef.current.find((item) => item.id === itemId)?.quantity ?? 0)
      updateItemInputs((current) => ({ ...current, [itemId]: fallback }))
      return
    }

    const normalized = String(quantity)
    updateItemInputs((current) => ({ ...current, [itemId]: normalized }))
    updateItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, quantity } : item)),
    )

    const previous = itemSaveQueueRef.current[itemId] ?? Promise.resolve()
    const queued = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          await api.set_inventory_quantity(itemId, quantity)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          window.alert(`保存に失敗しました: ${message}`)
        }
      })

    itemSaveQueueRef.current[itemId] = queued
    void queued.finally(() => {
      if (itemSaveQueueRef.current[itemId] === queued) {
        delete itemSaveQueueRef.current[itemId]
      }
    })
  }

  function queueBoxSave() {
    const quantity = Number.parseInt(boxQuantityRef.current || '0', 10)
    if (Number.isNaN(quantity) || quantity < 0) {
      window.alert('選択式ボックス在庫は0以上の整数で入力してください。')
      setBoxState(String(savedBoxQuantityRef.current))
      return
    }

    const normalized = String(quantity)
    setBoxState(normalized)

    const previous = boxSaveQueueRef.current ?? Promise.resolve()
    const queued = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          await api.set_box_quantity(SELECTABLE_BOX_KEY, quantity)
          savedBoxQuantityRef.current = quantity
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          window.alert(`保存に失敗しました: ${message}`)
        }
      })

    boxSaveQueueRef.current = queued
    void queued.finally(() => {
      if (boxSaveQueueRef.current === queued) {
        boxSaveQueueRef.current = null
      }
    })
  }

  async function flushPendingSaves() {
    const pending = [
      ...Object.values(itemSaveQueueRef.current),
      ...(boxSaveQueueRef.current ? [boxSaveQueueRef.current] : []),
    ]
    if (pending.length) {
      await Promise.allSettled(pending)
    }
  }

  async function runOptimization() {
    setOptimizing(true)
    await flushPendingSaves()
    try {
      const next = await api.optimize(
        strategy,
        parseCountInput(dailyCafeTaps),
        parseCountInput(dailySchedules),
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
    studentId: number,
    targetBondLevel: number,
    priority: PriorityKey,
  ) {
    const previousPriority = result?.results.find((row) => row.student_id === studentId)?.priority
    if (!previousPriority || previousPriority === priority) {
      return
    }

    patchResultPriority(studentId, priority)
    setPrioritySavingStudentId(studentId)
    try {
      await api.save_plan(studentId, targetBondLevel, priority, '', null)
      onDataChanged()
      await runOptimization()
    } catch (error) {
      patchResultPriority(studentId, previousPriority)
      const message = error instanceof Error ? error.message : String(error)
      window.alert(`優先度の更新に失敗しました: ${message}`)
    } finally {
      setPrioritySavingStudentId(null)
    }
  }

  return (
    <div className="screen-stack">
      <InventoryEditor
        boxQuantity={boxQuantity}
        items={items}
        quantityInputs={itemInputs}
        onBoxQuantityChange={setBoxState}
        onItemQuantityChange={(itemId, value) =>
          updateItemInputs((current) => ({ ...current, [itemId]: value }))
        }
        onSaveBoxQuantity={queueBoxSave}
        onSaveItemQuantity={queueItemSave}
      />

      <section className="card-shell">
        <div className="section-head compact-head">
          <div>
            <h3>誕生日までの自然加算</h3>
            <p>
              今日から次の誕生日までの残り日数を使って、カフェタップとスケジュール分の絆EXPを見込みます。
            </p>
          </div>
        </div>

        <div className="optimize-settings-grid">
          <label className="inline-field">
            <span>1日のカフェタップ回数</span>
            <input
              className="text-input compact"
              inputMode="numeric"
              placeholder="0"
              type="text"
              value={dailyCafeTaps}
              onChange={(event) => setDailyCafeTaps(sanitizeCountInput(event.target.value))}
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
          カフェタップは絆+15、スケジュールは Rank 12 想定で通常+25、25%で Bonus+25
          が乗る前提の期待値で計算します。
        </p>
      </section>

      <section className="card-shell">
        <div className="toolbar-row">
          <div className="optimize-run-copy">
            <h3>最適化</h3>
            <p className="helper-text">登録済みの優先対象に、在庫を相性順で配分します。</p>
          </div>
          <div className="toolbar-actions">
            <select
              className="select-input"
              value={strategy}
              onChange={(event) => setStrategy(event.target.value)}
            >
              {OPTIMIZE_STRATEGIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
        onPriorityChange={(studentId, targetBondLevel, priority) =>
          void handleResultPriorityChange(studentId, targetBondLevel, priority)
        }
        prioritySavingStudentId={prioritySavingStudentId}
        result={result}
        studentsById={studentsById}
      />
    </div>
  )
}
