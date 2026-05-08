import { memo } from 'react'
import { PRIORITY_OPTIONS } from '../../constants'
import type { PriorityKey, Student } from '../../types'
import { PrioritySelect } from '../common/PrioritySelect'
import { StudentGiftHoverCard } from '../common/StudentGiftHoverCard'
import { daysUntilBirthday, formatBirthday } from '../../lib/birthday'

type ManageDraft = {
  currentLevel: string
  targetLevel: string
  priority: PriorityKey
}

type ManageRowProps = {
  draft: ManageDraft
  giftRefreshKey?: number | string
  requiredExpText: string
  student: Student
  onChange: (patch: Partial<ManageDraft>) => void
  onRemove: () => void
  onSave: (patch?: Partial<ManageDraft>) => void
}

function ManageRowComponent({
  draft,
  giftRefreshKey,
  requiredExpText,
  student,
  onChange,
  onRemove,
  onSave,
}: ManageRowProps) {
  const hasTarget = draft.targetLevel.trim() !== ''

  const birthdayLabel = formatBirthday(student.birthday)
  const days = student.birthday ? daysUntilBirthday(student.birthday) : null
  const daysLabel =
    days === null ? '-' : days === 0 ? '今日！' : `あと${days}日`

  return (
    <div className="manage-row">
      <div className="manage-row-student" data-label="生徒">
        <StudentGiftHoverCard
          iconPath={student.icon_path}
          iconSize={38}
          refreshKey={giftRefreshKey}
          studentId={student.id}
          studentName={student.name}
        />
      </div>

      <div className="manage-row-birthday" data-label="誕生日">
        <span className="manage-birthday-date">{birthdayLabel}</span>
        <span className={`manage-birthday-days${days === 0 ? ' manage-birthday-today' : ''}`}>
          {daysLabel}
        </span>
      </div>

      <label className="manage-row-field" data-label="現在">
        <input
          aria-label={`${student.name}の現在絆Lv`}
          className="text-input compact"
          inputMode="numeric"
          type="text"
          value={draft.currentLevel}
          onBlur={(event) => onSave({ currentLevel: event.currentTarget.value })}
          onChange={(event) => onChange({ currentLevel: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onSave({ currentLevel: event.currentTarget.value })
            }
          }}
        />
      </label>

      <label className="manage-row-field" data-label="目標">
        <input
          aria-label={`${student.name}の目標絆Lv`}
          className="text-input compact"
          inputMode="numeric"
          type="text"
          value={draft.targetLevel}
          onBlur={(event) => onSave({ targetLevel: event.currentTarget.value })}
          onChange={(event) => onChange({ targetLevel: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onSave({ targetLevel: event.currentTarget.value })
            }
          }}
        />
      </label>

      <div className="manage-row-field manage-row-priority" data-label="優先度">
        <PrioritySelect
          disabled={!hasTarget}
          options={PRIORITY_OPTIONS}
          studentName={student.name}
          value={draft.priority}
          onChange={(priority) => {
            onChange({ priority })
            onSave({ priority })
          }}
        />
      </div>

      <div className="manage-row-field manage-required" data-label="必要EXP">
        <span>{requiredExpText}</span>
      </div>

      <div className="manage-row-remove">
        <button
          aria-label={`${student.name}を管理から外す`}
          className="ghost-icon-button danger"
          type="button"
          onClick={onRemove}
        >
          ×
        </button>
      </div>
    </div>
  )
}

function areEqual(prev: ManageRowProps, next: ManageRowProps): boolean {
  return (
    prev.requiredExpText === next.requiredExpText &&
    prev.giftRefreshKey === next.giftRefreshKey &&
    prev.student.id === next.student.id &&
    prev.student.name === next.student.name &&
    prev.student.icon_path === next.student.icon_path &&
    prev.draft.currentLevel === next.draft.currentLevel &&
    prev.draft.targetLevel === next.draft.targetLevel &&
    prev.draft.priority === next.draft.priority
  )
}

export const ManageRow = memo(ManageRowComponent, areEqual)
