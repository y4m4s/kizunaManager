import { PRIORITY_SORT_ORDER } from '../constants'
import type { OptimizeResult, OptimizeSnapshot, PriorityKey, Student } from '../types'
import { clampCurrentExp, clampLevel, cumulativeExpToLevel } from './bond'

type ResultRow = OptimizeResult['results'][number]

/**
 * forecast: 現在の最適化結果の到達予測と、保存時の到達予測を比較
 * final:    保存時に見込んだ誕生日を過ぎたため、現在の実績と保存時の到達予測を比較
 * reached:  目標に到達して現在の最適化対象から外れたため、実績(目標で頭打ち)で比較
 * pending:  まだ現在の最適化を実行していない
 * excluded: 現在の最適化対象外(優先度を保留・終了にした等)
 */
export type SnapshotCompareStatus = 'forecast' | 'final' | 'reached' | 'pending' | 'excluded'

export interface SnapshotCompareRow {
  student_id: number
  student_name: string
  priority: PriorityKey
  target_bond_level: number
  status: SnapshotCompareStatus
  snapshot_level: number
  snapshot_exp: number
  now_level: number
  now_exp: number
  /** 保存時から現在までに実際に増えた絆EXP */
  gained_exp: number
  /** 保存時の日課設定で、今日までに入る見込みだった絆EXP */
  expected_passive_exp: number
  planned_level: number
  planned_level_exp: number
  compare_level: number | null
  compare_level_exp: number | null
  /** 比較値 - 保存時の予測 (EXP)。比較できない場合は null */
  diff_exp: number | null
  diff_level: number | null
  /** 保存時に見込んだ誕生日までの残り日数 (誕生日なしは null) */
  days_left: number | null
}

export interface SnapshotCompareSummary {
  elapsed_days: number
  ahead: number
  behind: number
  even: number
  total_diff_exp: number
  comparable: number
}

export interface SnapshotComparison {
  rows: SnapshotCompareRow[]
  summary: SnapshotCompareSummary
}

function totalExp(level: number, exp: number): number {
  const normalized = clampLevel(level)
  return cumulativeExpToLevel(normalized) + clampCurrentExp(normalized, exp)
}

function localDayStart(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
}

export function elapsedDaysSince(isoDate: string, now = new Date()): number {
  const created = new Date(isoDate)
  if (Number.isNaN(created.getTime())) {
    return 0
  }
  return Math.max(0, Math.round((localDayStart(now) - localDayStart(created)) / 86400000))
}

export function formatSnapshotDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return isoDate
  }
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function compareWithSnapshot(
  snapshot: OptimizeSnapshot,
  currentResult: OptimizeResult | null,
  studentsById: Record<number, Student>,
  now = new Date(),
): SnapshotComparison {
  const elapsedDays = elapsedDaysSince(snapshot.created_at, now)
  const currentRows = new Map<number, ResultRow>(
    (currentResult?.results ?? []).map((row) => [row.student_id, row]),
  )

  const rows = snapshot.result.results.map((saved): SnapshotCompareRow => {
    const snapshotLevel = Number(saved.current_bond_level || 1)
    const snapshotExp = Number(saved.current_bond_exp || 0)
    const student = studentsById[saved.student_id]
    const currentRow = currentRows.get(saved.student_id)
    const nowLevel = Number(
      student?.current_bond_level ?? currentRow?.current_bond_level ?? snapshotLevel,
    )
    const nowExp = Number(student?.current_bond_exp ?? currentRow?.current_bond_exp ?? snapshotExp)
    const snapshotTotal = totalExp(snapshotLevel, snapshotExp)
    const nowTotal = totalExp(nowLevel, nowExp)
    const plannedLevel = Number(saved.predicted_level || snapshotLevel)
    const plannedExp = Number(saved.predicted_level_exp || 0)
    const plannedTotal = totalExp(plannedLevel, plannedExp)
    const targetTotal = cumulativeExpToLevel(Number(saved.target_bond_level || 1))

    const hasBirthday = Boolean(saved.birthday)
    const savedDays = Number(saved.days_until_birthday || 0)
    const deadlinePassed = hasBirthday && elapsedDays > savedDays
    const passiveDays = hasBirthday ? Math.min(elapsedDays, savedDays) : 0
    const expectedPassive =
      savedDays > 0 ? Math.round((Number(saved.passive_exp || 0) / savedDays) * passiveDays) : 0

    let status: SnapshotCompareStatus
    let compareLevel: number | null = null
    let compareExp: number | null = null
    let diffExp: number | null = null

    if (deadlinePassed) {
      status = 'final'
      compareLevel = nowLevel
      compareExp = nowExp
      diffExp = nowTotal - plannedTotal
    } else if (currentRow) {
      status = 'forecast'
      compareLevel = Number(currentRow.predicted_level || nowLevel)
      compareExp = Number(currentRow.predicted_level_exp || 0)
      diffExp = totalExp(compareLevel, compareExp) - plannedTotal
    } else if (nowTotal >= targetTotal) {
      status = 'reached'
      compareLevel = nowLevel
      compareExp = nowExp
      diffExp = Math.min(nowTotal, targetTotal) - Math.min(plannedTotal, targetTotal)
    } else {
      status = currentResult ? 'excluded' : 'pending'
    }

    return {
      student_id: saved.student_id,
      student_name: saved.student_name,
      priority: saved.priority,
      target_bond_level: Number(saved.target_bond_level || 1),
      status,
      snapshot_level: snapshotLevel,
      snapshot_exp: snapshotExp,
      now_level: nowLevel,
      now_exp: nowExp,
      gained_exp: nowTotal - snapshotTotal,
      expected_passive_exp: expectedPassive,
      planned_level: plannedLevel,
      planned_level_exp: plannedExp,
      compare_level: compareLevel,
      compare_level_exp: compareExp,
      diff_exp: diffExp,
      diff_level: compareLevel === null ? null : compareLevel - plannedLevel,
      days_left: hasBirthday ? Math.max(0, savedDays - elapsedDays) : null,
    }
  })

  rows.sort((left, right) => {
    const priorityDiff =
      (PRIORITY_SORT_ORDER[left.priority] ?? Number.MAX_SAFE_INTEGER) -
      (PRIORITY_SORT_ORDER[right.priority] ?? Number.MAX_SAFE_INTEGER)
    if (priorityDiff !== 0) {
      return priorityDiff
    }
    return left.student_name.localeCompare(right.student_name, 'ja')
  })

  const summary: SnapshotCompareSummary = {
    elapsed_days: elapsedDays,
    ahead: 0,
    behind: 0,
    even: 0,
    total_diff_exp: 0,
    comparable: 0,
  }
  for (const row of rows) {
    if (row.diff_exp === null) {
      continue
    }
    summary.comparable += 1
    summary.total_diff_exp += row.diff_exp
    if (row.diff_exp > 0) summary.ahead += 1
    else if (row.diff_exp < 0) summary.behind += 1
    else summary.even += 1
  }

  return { rows, summary }
}
