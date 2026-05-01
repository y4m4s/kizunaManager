import {
  startTransition,
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { api } from '../api'
import { PRIORITY_LABELS, PRIORITY_OPTIONS, PRIORITY_SORT_ORDER } from '../constants'
import { calcRequiredExp, clampLevel, formatNumber } from '../lib/bond'
import { normalizeForSearch } from '../lib/search'
import type { Plan, PriorityKey, Student } from '../types'
import { ConfirmModal } from '../components/common/ConfirmModal'
import type { ToastKind } from '../components/common/Toast'
import { ManageRow } from '../components/manage/ManageRow'
import { SaveIndicator, type SaveStatus } from '../components/manage/SaveIndicator'

type ManageScreenProps = {
  bridgeReady: boolean
  onDataChanged: () => void
  onToast: (message: string, kind?: ToastKind, duration?: number | null) => void
  refreshToken: number
}

type ManageDraft = {
  currentLevel: string
  targetLevel: string
  priority: PriorityKey
}

type PriorityFilterKey = PriorityKey | 'none'

const PRIORITY_FILTER_OPTIONS: Array<{ value: PriorityFilterKey; label: string }> = [
  ...PRIORITY_OPTIONS,
  { value: 'none', label: '未設定' },
]

const SAVE_DEBOUNCE_MS = 700

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
  onToast,
  refreshToken,
}: ManageScreenProps) {
  const [students, setStudents] = useState<Student[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [addQuery, setAddQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<number, ManageDraft>>({})
  const [removeTarget, setRemoveTarget] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)

  const deferredAddQuery = useDeferredValue(addQuery)
  const candidateListId = useId()
  const studentsRef = useRef<Student[]>([])
  const plansRef = useRef<Plan[]>([])
  const draftsRef = useRef<Record<number, ManageDraft>>({})
  const saveQueueRef = useRef<Record<number, Promise<void>>>({})
  const candidateRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const saveTimersRef = useRef<Record<number, ReturnType<typeof window.setTimeout>>>({})
  const dirtyStudentIdsRef = useRef<Set<number>>(new Set())
  const draftVersionRef = useRef<Record<number, number>>({})
  const pendingSaveCountRef = useRef(0)
  const saveFailureMessageRef = useRef<string | null>(null)
  const [activeCandidateId, setActiveCandidateId] = useState<number | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [hiddenPriorities, setHiddenPriorities] = useState<Set<PriorityFilterKey>>(new Set())

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

  function nextDraftVersion(studentId: number): number {
    const nextVersion = (draftVersionRef.current[studentId] ?? 0) + 1
    draftVersionRef.current[studentId] = nextVersion
    dirtyStudentIdsRef.current.add(studentId)
    return nextVersion
  }

  function clearSaveTimer(studentId: number) {
    const timer = saveTimersRef.current[studentId]
    if (timer) {
      window.clearTimeout(timer)
      delete saveTimersRef.current[studentId]
    }
  }

  function validateDraft(draft: ManageDraft, silent = false): boolean {
    const currentLevel = parseInt(draft.currentLevel, 10)
    if (Number.isNaN(currentLevel)) {
      if (!silent) {
        window.alert('現在の絆は数字で入力してください。')
      }
      return false
    }

    if (draft.targetLevel.trim()) {
      const targetLevel = parseInt(draft.targetLevel, 10)
      if (Number.isNaN(targetLevel)) {
        if (!silent) {
          window.alert('目標は数字で入力してください。')
        }
        return false
      }
    }

    return true
  }

  function showSavingIndicator() {
    if (pendingSaveCountRef.current === 0) {
      saveFailureMessageRef.current = null
    }
    pendingSaveCountRef.current += 1
    setSaveStatus('saving')
  }

  function settleSavingIndicator(success: boolean, message?: string) {
    if (!success) {
      saveFailureMessageRef.current = message ?? '保存に失敗しました'
    }
    pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1)
    if (pendingSaveCountRef.current > 0) {
      return
    }
    if (saveFailureMessageRef.current) {
      onToast(saveFailureMessageRef.current, 'error')
      saveFailureMessageRef.current = null
      setSaveStatus('idle')
      return
    }
    setSaveStatus('success')
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
      const loadedDrafts = Object.fromEntries(
        nextStudents.map((student) => [
          student.id,
          defaultDraft(student, plansByStudent[student.id]),
        ]),
      ) as Record<number, ManageDraft>
      const nextDrafts = { ...loadedDrafts }
      for (const studentId of dirtyStudentIdsRef.current) {
        if (draftsRef.current[studentId]) {
          nextDrafts[studentId] = draftsRef.current[studentId]
        }
      }

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

  useEffect(() => {
    return () => {
      Object.values(saveTimersRef.current).forEach((timer) => window.clearTimeout(timer))
      saveTimersRef.current = {}
    }
  }, [])

  const plansByStudent = Object.fromEntries(
    plans.map((plan) => [plan.student_id, plan]),
  ) as Record<number, Plan>

  function getSortPriority(student: Student): PriorityKey | null {
    const draft = drafts[student.id] || defaultDraft(student, plansByStudent[student.id])
    return draft.targetLevel.trim() ? draft.priority : null
  }

  function getStudentPriorityKey(student: Student): PriorityFilterKey {
    const draft = drafts[student.id] || defaultDraft(student, plansByStudent[student.id])
    return draft.targetLevel.trim() ? draft.priority : 'none'
  }

  function togglePriority(key: PriorityFilterKey) {
    setHiddenPriorities((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
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

  const filteredStudents = managedStudents.filter(
    (student) => !hiddenPriorities.has(getStudentPriorityKey(student)),
  )

  const candidateStudents = students
    .filter((student) => !student.is_owned && !(student.id in plansByStudent))
    .filter((student) =>
      deferredAddQuery.trim()
        ? normalizeForSearch(student.name).includes(normalizeForSearch(deferredAddQuery.trim()))
        : true,
    )
    .slice(0, 20)
  const activeCandidateIndex =
    candidateStudents.findIndex((student) => student.id === activeCandidateId) >= 0
      ? candidateStudents.findIndex((student) => student.id === activeCandidateId)
      : 0
  const activeCandidate = candidateStudents[activeCandidateIndex]

  useEffect(() => {
    if (!activeCandidate) {
      return
    }
    candidateRefs.current[activeCandidate.id]?.scrollIntoView({ block: 'nearest' })
  }, [activeCandidate])

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

  async function persistRow(studentId: number, draft: ManageDraft, draftVersion: number) {
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

    if ((draftVersionRef.current[studentId] ?? 0) <= draftVersion) {
      dirtyStudentIdsRef.current.delete(studentId)
      updateDrafts((current) => ({
        ...current,
        [studentId]: {
          currentLevel: String(normalizedCurrent),
          targetLevel: nextTargetLevel === null ? '' : String(nextTargetLevel),
          priority: draft.priority,
        },
      }))
    }
  }

  function queueRowSave(studentId: number, draft: ManageDraft, draftVersion: number): Promise<void> {
    showSavingIndicator()
    const previous = saveQueueRef.current[studentId] ?? Promise.resolve()
    const queued = previous
      .catch(() => undefined)
      .then(async () => {
        await persistRow(studentId, draft, draftVersion)
      })

    saveQueueRef.current[studentId] = queued
    void queued
      .then(() => {
        settleSavingIndicator(true)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        settleSavingIndicator(false, `保存に失敗しました: ${message}`)
      })
      .finally(() => {
        if (saveQueueRef.current[studentId] === queued) {
          delete saveQueueRef.current[studentId]
        }
      })
    return queued
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

    if (!validateDraft(draft)) {
      return
    }

    clearSaveTimer(studentId)
    const draftVersion = nextDraftVersion(studentId)
    queueRowSave(studentId, draft, draftVersion)
  }

  function scheduleRowSave(studentId: number, draft: ManageDraft, draftVersion: number) {
    clearSaveTimer(studentId)
    if (!validateDraft(draft, true)) {
      return
    }
    saveTimersRef.current[studentId] = window.setTimeout(() => {
      delete saveTimersRef.current[studentId]
      queueRowSave(studentId, draft, draftVersion)
    }, SAVE_DEBOUNCE_MS)
  }

  function patchDraft(studentId: number, patch: Partial<ManageDraft>) {
    const draft = resolveDraft(studentId, patch)
    if (!draft) {
      return
    }

    updateDrafts((current) => ({
      ...current,
      [studentId]: draft,
    }))
    const draftVersion = nextDraftVersion(studentId)
    scheduleRowSave(studentId, draft, draftVersion)
  }

  async function saveDirtyRowsNow(showNoopToast = true): Promise<boolean> {
    const dirtyIds = [...dirtyStudentIdsRef.current]
    if (!dirtyIds.length) {
      if (showNoopToast) {
        setSaveStatus('success')
      }
      return true
    }

    const rowsToSave: Array<{ draft: ManageDraft; studentId: number; version: number }> = []
    for (const studentId of dirtyIds) {
      const draft = resolveDraft(studentId)
      if (!draft || !validateDraft(draft)) {
        return false
      }
      rowsToSave.push({
        draft,
        studentId,
        version: draftVersionRef.current[studentId] ?? 0,
      })
    }

    const saves = rowsToSave.map((row) => {
      clearSaveTimer(row.studentId)
      return queueRowSave(row.studentId, row.draft, row.version)
    })
    const results = await Promise.allSettled(saves)
    return results.every((result) => result.status === 'fulfilled')
  }

  function moveActiveCandidate(direction: 1 | -1) {
    if (!candidateStudents.length) {
      return
    }
    const nextIndex =
      (activeCandidateIndex + direction + candidateStudents.length) % candidateStudents.length
    setActiveCandidateId(candidateStudents[nextIndex].id)
  }

  async function addStudent(selectedStudent?: Student) {
    const normalized = normalizeForSearch(addQuery.trim())
    const matched = selectedStudent ?? candidateStudents.find(
      (student) => normalizeForSearch(student.name) === normalized,
    ) ?? candidateStudents[0]
    if (!matched) {
      window.alert('追加したい生徒を候補から選んでください。')
      return
    }
    const saved = await saveDirtyRowsNow(false)
    if (!saved) {
      return
    }
    await api.upsert_user_student(matched.id, 1, 0, '')
    updateStudents((current) =>
      current.map((student) =>
        student.id === matched.id
          ? {
              ...student,
              current_bond_exp: 0,
              current_bond_level: 1,
              is_owned: true,
            }
          : student,
      ),
    )
    updateDrafts((current) => ({
      ...current,
      [matched.id]: {
        currentLevel: '',
        targetLevel: '',
        priority: 'priority',
      },
    }))
    setAddQuery('')
    setActiveCandidateId(null)
  }

  async function confirmRemoveStudent() {
    if (!removeTarget) {
      return
    }
    const saved = await saveDirtyRowsNow(false)
    if (!saved) {
      return
    }
    await api.delete_user_student(removeTarget.id)
    setRemoveTarget(null)
    onDataChanged()
  }

  function handleScreenKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void saveDirtyRowsNow()
    }
  }

  return (
    <div className="screen-stack" onKeyDown={handleScreenKeyDown}>
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
            aria-activedescendant={
              activeCandidate ? `${candidateListId}-${activeCandidate.id}` : undefined
            }
            aria-controls={addQuery.trim() ? candidateListId : undefined}
            aria-expanded={Boolean(addQuery.trim() && candidateStudents.length)}
            aria-autocomplete="list"
            className="text-input"
            placeholder="生徒名で管理対象に追加"
            role="combobox"
            type="text"
            value={addQuery}
            onChange={(event) => {
              setActiveCandidateId(null)
              setAddQuery(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void addStudent(activeCandidate)
              } else if (event.key === 'ArrowDown') {
                event.preventDefault()
                moveActiveCandidate(1)
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                moveActiveCandidate(-1)
              }
            }}
          />
          <button className="btn btn-primary" type="button" onClick={() => void addStudent()}>
            管理に追加
          </button>
        </div>

        {addQuery.trim() ? (
          <div id={candidateListId} className="candidate-list manage-candidates" role="listbox">
            {candidateStudents.length ? (
              candidateStudents.map((student, index) => {
                const active = index === activeCandidateIndex
                return (
                  <button
                    id={`${candidateListId}-${student.id}`}
                    key={student.id}
                    ref={(element) => {
                      candidateRefs.current[student.id] = element
                    }}
                    aria-selected={active}
                    className={`candidate-item ${active ? 'active' : ''}`}
                    role="option"
                    type="button"
                    onClick={() => {
                      void addStudent(student)
                    }}
                    onMouseEnter={() => setActiveCandidateId(student.id)}
                  >
                    <span>{student.name}</span>
                    <small>{student.school || 'その他'}</small>
                  </button>
                )
              })
            ) : (
              <p className="helper-text">追加できる候補が見つかりません。</p>
            )}
          </div>
        ) : null}
      </section>

      <div className="priority-filter-row" role="group" aria-label="優先度フィルター">
        <span className="priority-filter-heading">フィルター</span>
        {PRIORITY_FILTER_OPTIONS.map((option) => {
          const visible = !hiddenPriorities.has(option.value)
          return (
            <button
              key={option.value}
              aria-pressed={visible}
              className={`priority-filter-btn${visible ? ' active' : ''}`}
              data-priority={option.value}
              type="button"
              onClick={() => togglePriority(option.value)}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <section className="card-shell manage-table-shell">
        <div className="manage-head-row">
          <span>生徒</span>
          <span>誕生日</span>
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
          ) : filteredStudents.length ? (
            filteredStudents.map((student) => {
              const draft = drafts[student.id] || defaultDraft(student, plansByStudent[student.id])
              const requiredExp = getRequiredExp(student, draft)
              return (
                <ManageRow
                  key={student.id}
                  draft={draft}
                  requiredExpText={draft.targetLevel.trim() ? formatNumber(requiredExp) : '-'}
                  student={student}
                  onChange={(patch) => {
                    patchDraft(student.id, patch)
                  }}
                  onRemove={() => setRemoveTarget(student)}
                  onSave={(patch) => saveRow(student.id, patch)}
                />
              )
            })
          ) : (
            <div className="empty-state">
              <p>
                {managedStudents.length
                  ? 'フィルターに一致する生徒がいません。上のボタンで表示する優先度を選んでください。'
                  : 'まだ管理中の生徒はいません。上の検索バーから追加できます。'}
              </p>
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

      <SaveIndicator
        status={saveStatus}
        onFadeOut={() => setSaveStatus('idle')}
      />
    </div>
  )
}
