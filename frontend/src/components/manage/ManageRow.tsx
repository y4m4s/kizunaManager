import { memo } from 'react'
import type { PriorityKey, Student } from '../../types'
import { IconThumb } from '../common/IconThumb'

type ManageDraft = {
  currentLevel: string
  targetLevel: string
  priority: PriorityKey
}

type ManageRowProps = {
  draft: ManageDraft
  requiredExpText: string
  student: Student
  onChange: (patch: Partial<ManageDraft>) => void
  onRemove: () => void
  onSave: (patch?: Partial<ManageDraft>) => void
}

function ManageRowComponent({
  draft,
  requiredExpText,
  student,
  onChange,
  onRemove,
  onSave,
}: ManageRowProps) {
  const hasTarget = draft.targetLevel.trim() !== ''

  return (
    <div className="manage-row">
      <div className="manage-row-student" data-label="生徒">
        <IconThumb filePath={student.icon_path} label={student.name} size={38} tone="student" />
        <span>{student.name}</span>
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

      <label className="manage-row-field manage-row-priority" data-label="優先度">
        <select
          className="select-input compact"
          disabled={!hasTarget}
          title={hasTarget ? '最適化時の扱いを選びます' : '目標を設定すると変更できます'}
          value={draft.priority}
          onChange={(event) =>
            onChange({ priority: event.target.value as ManageDraft['priority'] })
          }
          onBlur={(event) =>
            onSave({ priority: event.currentTarget.value as ManageDraft['priority'] })
          }
        >
          <option value="top_priority">最優先</option>
          <option value="priority">優先</option>
          <option value="semi_priority">準優先</option>
          <option value="defer">見送り</option>
          <option value="done">終了</option>
        </select>
      </label>

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
    prev.student.id === next.student.id &&
    prev.student.name === next.student.name &&
    prev.student.icon_path === next.student.icon_path &&
    prev.draft.currentLevel === next.draft.currentLevel &&
    prev.draft.targetLevel === next.draft.targetLevel &&
    prev.draft.priority === next.draft.priority
  )
}

export const ManageRow = memo(ManageRowComponent, areEqual)
