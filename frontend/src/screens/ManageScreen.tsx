import { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { PRIORITY_LABELS, PRIORITY_SORT_ORDER } from '../constants'
import { calcRequiredExp, clampLevel, formatNumber } from '../lib/bond'
import type { Plan, PriorityKey, Student } from '../types'
import { ConfirmModal } from '../components/common/ConfirmModal'
import { ManageRow } from '../components/manage/ManageRow'

type ManageScreenProps = {
  bridgeReady: boolean
  onDataChanged: () => void
  refreshToken: number
}

type ManageDraft = {
  currentLevel: string
  targetLevel: string
  priority: PriorityKey
}

function defaultDraft(student: Student, plan?: Plan): ManageDraft {
  return {
    currentLevel: String(student.current_bond_level),
    targetLevel: plan ? String(plan.target_bond_level) : '',
    priority: plan?.priority || 'priority',
  }
}

export function ManageScreen({
  bridgeReady,
  onDataChanged,
  refreshToken,
}: ManageScreenProps) {
  const [students, setStudents] = useState<Student[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [addQuery, setAddQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<number, ManageDraft>>({})
  const [removeTarget, setRemoveTarget] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)

  const deferredAddQuery = useDeferredValue(addQuery)
  const studentsRef = useRef<Student[]>([])
  const plansRef = useRef<Plan[]>([])
  const draftsRef = useRef<Record<number, ManageDraft>>({})
  const saveQueueRef = useRef<Record<number, Promise<void>>>({})

  function plansByStudentFrom(rows: Plan[]): Record<number, Plan> {
    return Object.fromEntries(rows.map((plan) => [plan.student_id, plan])) as Record<number, Plan>
  }

  function replaceStudents(nextStudents: Student[]) {
    studentsRef.current = nextStudents
    setStudents(nextStudents)
  }

  function replacePlans(nextPlans: Plan[]) {
    plansRef.current = nextPlans
    setPlans(nextPlans)
  }

  function replaceDrafts(nextDrafts: Record<number, ManageDraft>) {
    draftsRef.current = nextDrafts
    setDrafts(nextDrafts)
  }

  function updateStudents(updater: (current: Student[]) => Student[]) {
    const nextStudents = updater(studentsRef.current)
    studentsRef.current = nextStudents
    startTransition(() => {
      setStudents(nextStudents)
    })
  }

  function updatePlans(updater: (current: Plan[]) => Plan[]) {
    const nextPlans = updater(plansRef.current)
    plansRef.current = nextPlans
    startTransition(() => {
      setPlans(nextPlans)
    })
  }

  function updateDrafts(
    updater: (current: Record<number, ManageDraft>) => Record<number, ManageDraft>,
  ) {
    const nextDrafts = updater(draftsRef.current)
    draftsRef.current = nextDrafts
    setDrafts(nextDrafts)
  }

  useEffect(() => {
    let disposed = false

    async function load() {
      if (!bridgeReady) {
        setLoading(true)
        return
      }
      setLoading(true)
      const [studentRows, planRows] = await Promise.all([
        api.search_students('', '', 'name'),
        api.list_plans(),
      ])
      if (disposed) {
        return
      }

      const nextStudents = Array.isArray(studentRows) ? studentRows : []
      const nextPlans = Array.isArray(planRows) ? planRows : []
      const plansByStudent = Object.fromEntries(
        nextPlans.map((plan) => [plan.student_id, plan]),
      ) as Record<number, Plan>
      const nextDrafts = Object.fromEntries(
        nextStudents.map((student) => [
          student.id,
          defaultDraft(student, plansByStudent[student.id]),
        ]),
      )

      replaceStudents(nextStudents)
      replacePlans(nextPlans)
      replaceDrafts(nextDrafts)
      setLoading(false)
    }

    void load()

    return () => {
      disposed = true
    }
  }, [bridgeReady, refreshToken])

  const plansByStudent = Object.fromEntries(
    plans.map((plan) => [plan.student_id, plan]),
  ) as Record<number, Plan>

  function getSortPriority(student: Student): PriorityKey | null {
    const draft = drafts[student.id] || defaultDraft(student, plansByStudent[student.id])
    return draft.targetLevel.trim() ? draft.priority : null
  }

  const managedStudents = students
    .filter((student) => student.is_owned || student.id in plansByStudent)
    .sort((left, right) => {
      const leftPriority = getSortPriority(left)
      const rightPriority = getSortPriority(right)

      if (leftPriority && rightPriority) {
        const priorityDiff =
          (PRIORITY_SORT_ORDER[leftPriority] ?? Number.MAX_SAFE_INTEGER) -
          (PRIORITY_SORT_ORDER[rightPriority] ?? Number.MAX_SAFE_INTEGER)
        if (priorityDiff !== 0) {
          return priorityDiff
        }
      } else if (leftPriority || rightPriority) {
        return leftPriority ? -1 : 1
      }

      return left.name.localeCompare(right.name, 'ja')
    })

  const candidateStudents = students
    .filter((student) => !student.is_owned && !(student.id in plansByStudent))
    .filter((student) =>
      deferredAddQuery.trim()
        ? student.name.toLowerCase().includes(deferredAddQuery.trim().toLowerCase())
        : true,
    )
    .slice(0, 20)

  const summary = managedStudents.reduce(
    (acc, student) => {
      const draft = drafts[student.id] || defaultDraft(student, plansByStudent[student.id])
      const requiredExp = getRequiredExp(student, draft)
      const hasTarget = draft.targetLevel.trim() !== ''
      if (hasTarget) {
        acc.totalRequired += requiredExp
      }
      if (
        hasTarget &&
        (
          draft.priority === 'top_priority' ||
          draft.priority === 'priority' ||
          draft.priority === 'semi_priority'
        )
      ) {
        acc.priorityCount += 1
      }
      acc.totalCount += 1
      return acc
    },
    { priorityCount: 0, totalCount: 0, totalRequired: 0 },
  )

  function getRequiredExp(student: Student, draft: ManageDraft): number {
    const currentLevel = parseInt(draft.currentLevel || '1', 10)
    const targetLevel = parseInt(draft.targetLevel || '0', 10)
    if (Number.isNaN(currentLevel) || Number.isNaN(targetLevel) || !draft.targetLevel.trim()) {
      return 0
    }
    const normalizedCurrent = clampLevel(currentLevel)
    const normalizedTarget = Math.max(normalizedCurrent, clampLevel(targetLevel))
    const currentExp =
      normalizedCurrent === student.current_bond_level ? student.current_bond_exp : 0
    return calcRequiredExp(normalizedCurrent, currentExp, normalizedTarget)
  }

  function resolveDraft(studentId: number, patch: Partial<ManageDraft> = {}): ManageDraft | null {
    const student = studentsRef.current.find((row) => row.id === studentId)
    if (!student) {
      return null
    }
    const baseDraft =
      draftsRef.current[studentId] ||
      defaultDraft(student, plansByStudentFrom(plansRef.current)[student.id])
    return { ...baseDraft, ...patch }
  }

  async function persistRow(studentId: number, draft: ManageDraft) {
    const student = studentsRef.current.find((row) => row.id === studentId)
    if (!student) {
      return
    }

    const currentLevel = parseInt(draft.currentLevel || '1', 10)
    const normalizedCurrent = clampLevel(currentLevel)
    const currentExp =
      normalizedCurrent === student.current_bond_level ? student.current_bond_exp : 0
    const nextTargetLevel = draft.targetLevel.trim()
      ? Math.max(normalizedCurrent, clampLevel(parseInt(draft.targetLevel, 10)))
      : null

    await api.upsert_user_student(
      studentId,
      normalizedCurrent,
      currentExp,
      student.notes || '',
    )

    updateStudents((current) =>
      current.map((row) =>
        row.id === studentId
          ? {
              ...row,
              current_bond_level: normalizedCurrent,
              current_bond_exp: currentExp,
              is_owned: true,
            }
          : row,
      ),
    )

    const existingPlan = plansByStudentFrom(plansRef.current)[studentId]
    if (nextTargetLevel === null) {
      if (existingPlan) {
        await api.delete_plan(existingPlan.id)
        updatePlans((current) => current.filter((plan) => plan.student_id !== studentId))
      }
    } else {
      const response = await api.save_plan(
        studentId,
        nextTargetLevel,
        draft.priority,
        '',
        existingPlan?.id || null,
      )

      const nextPlan: Plan = {
        id: Number(response?.plan_id ?? existingPlan?.id ?? 0),
        student_id: studentId,
        student_name: student.name,
        school: student.school,
        current_bond_level: normalizedCurrent,
        current_bond_exp: currentExp,
        target_bond_level: nextTargetLevel,
        priority: draft.priority,
        priority_label: PRIORITY_LABELS[draft.priority] || draft.priority,
        notes: '',
        required_exp: calcRequiredExp(normalizedCurrent, currentExp, nextTargetLevel),
        progress: normalizedCurrent >= nextTargetLevel ? 1 : 0,
      }

      updatePlans((current) => [
        ...current.filter((plan) => plan.student_id !== studentId),
        nextPlan,
      ])
    }

    updateDrafts((current) => ({
      ...current,
      [studentId]: {
        currentLevel: String(normalizedCurrent),
        targetLevel: nextTargetLevel === null ? '' : String(nextTargetLevel),
        priority: draft.priority,
      },
    }))
  }

  function queueRowSave(studentId: number, draft: ManageDraft) {
    const previous = saveQueueRef.current[studentId] ?? Promise.resolve()
    const queued = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          await persistRow(studentId, draft)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          window.alert(`保存に失敗しました: ${message}`)
        }
      })

    saveQueueRef.current[studentId] = queued
    void queued.finally(() => {
      if (saveQueueRef.current[studentId] === queued) {
        delete saveQueueRef.current[studentId]
      }
    })
  }

  function saveRow(studentId: number, patch: Partial<ManageDraft> = {}) {
    const draft =
      Object.keys(patch).length > 0 ? resolveDraft(studentId, patch) : resolveDraft(studentId)
    if (!draft) {
      return
    }

    if (Object.keys(patch).length > 0) {
      updateDrafts((current) => ({
        ...current,
        [studentId]: draft,
      }))
    }

    const currentLevel = parseInt(draft.currentLevel || '1', 10)
    if (Number.isNaN(currentLevel)) {
      window.alert('現在の絆は数字で入力してください。')
      return
    }

    if (draft.targetLevel.trim()) {
      const targetLevel = parseInt(draft.targetLevel, 10)
      if (Number.isNaN(targetLevel)) {
        window.alert('目標は数字で入力してください。')
        return
      }
    }

    queueRowSave(studentId, draft)
  }

  async function addStudent() {
    const lowered = addQuery.trim().toLowerCase()
    const matched = candidateStudents.find(
      (student) => student.name.toLowerCase() === lowered,
    ) ?? candidateStudents[0]
    if (!matched) {
      window.alert('追加したい生徒を候補から選んでください。')
      return
    }
    await api.upsert_user_student(matched.id, 1, 0, '')
    setAddQuery('')
    onDataChanged()
  }

  async function confirmRemoveStudent() {
    if (!removeTarget) {
      return
    }
    await api.delete_user_student(removeTarget.id)
    setRemoveTarget(null)
    onDataChanged()
  }

  return (
    <div className="screen-stack">
      <section className="card-shell screen-header">
        <div className="section-head">
          <div>
            <h2>管理</h2>
            <p>追加、現在絆、目標、優先度をひとつの一覧で管理できます。</p>
          </div>
          <div className="summary-badges">
            <span>{`管理中 ${summary.totalCount}人`}</span>
            <span>{`優先 ${summary.priorityCount}人`}</span>
            <span>{`必要EXP ${formatNumber(summary.totalRequired)}`}</span>
          </div>
        </div>
      </section>

      <section className="card-shell">
        <div className="inline-form">
          <input
            className="text-input"
            placeholder="生徒名で管理対象に追加"
            type="text"
            value={addQuery}
            onChange={(event) => setAddQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void addStudent()
              }
            }}
          />
          <button className="btn btn-primary" type="button" onClick={() => void addStudent()}>
            管理に追加
          </button>
        </div>

        {addQuery.trim() ? (
          <div className="candidate-list manage-candidates">
            {candidateStudents.length ? (
              candidateStudents.map((student) => (
                <button
                  key={student.id}
                  className="candidate-item"
                  type="button"
                  onClick={() => {
                    void api.upsert_user_student(student.id, 1, 0, '').then(onDataChanged)
                    setAddQuery('')
                  }}
                >
                  <span>{student.name}</span>
                  <small>{student.school || 'その他'}</small>
                </button>
              ))
            ) : (
              <p className="helper-text">追加できる候補が見つかりません。</p>
            )}
          </div>
        ) : null}
      </section>

      <section className="card-shell manage-table-shell">
        <div className="manage-head-row">
          <span>生徒</span>
          <span>現在</span>
          <span>目標</span>
          <span>優先度</span>
          <span>必要EXP</span>
          <span />
        </div>

        <div className="manage-body">
          {loading ? (
            <div className="empty-state">
              <p>読み込み中...</p>
            </div>
          ) : managedStudents.length ? (
            managedStudents.map((student) => {
              const draft = drafts[student.id] || defaultDraft(student, plansByStudent[student.id])
              const requiredExp = getRequiredExp(student, draft)
              return (
                <ManageRow
                  key={student.id}
                  draft={draft}
                  requiredExpText={draft.targetLevel.trim() ? formatNumber(requiredExp) : '-'}
                  student={student}
                  onChange={(patch) => {
                    const nextDraft = resolveDraft(student.id, patch)
                    if (!nextDraft) {
                      return
                    }
                    updateDrafts((current) => ({
                      ...current,
                      [student.id]: nextDraft,
                    }))
                  }}
                  onRemove={() => setRemoveTarget(student)}
                  onSave={(patch) => saveRow(student.id, patch)}
                />
              )
            })
          ) : (
            <div className="empty-state">
              <p>まだ管理中の生徒はいません。上の検索バーから追加できます。</p>
            </div>
          )}
        </div>
      </section>

      <ConfirmModal
        open={Boolean(removeTarget)}
        title="管理から外す"
        message={removeTarget ? `${removeTarget.name}を管理から外しますか？` : ''}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void confirmRemoveStudent()}
      />
    </div>
  )
}
