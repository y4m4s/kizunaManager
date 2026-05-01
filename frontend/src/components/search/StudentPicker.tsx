import { useEffect, useId, useRef, useState } from 'react'
import { GIFT_PLACEHOLDER } from '../../constants'
import type { Student } from '../../types'

type StudentPickerProps = {
  query: string
  selectedStudents: Student[]
  suggestions: Student[]
  onAddStudent: (student: Student) => void
  onClear: () => void
  onExport: () => void
  onQueryChange: (value: string) => void
  onRemoveStudent: (studentId: number) => void
  onSubmit: (student?: Student) => void
}

export function StudentPicker({
  query,
  selectedStudents,
  suggestions,
  onAddStudent,
  onClear,
  onExport,
  onQueryChange,
  onRemoveStudent,
  onSubmit,
}: StudentPickerProps) {
  const listId = useId()
  const optionRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const [activeStudentId, setActiveStudentId] = useState<number | null>(null)
  const activeIndex =
    suggestions.findIndex((student) => student.id === activeStudentId) >= 0
      ? suggestions.findIndex((student) => student.id === activeStudentId)
      : 0
  const activeStudent = suggestions[activeIndex]

  useEffect(() => {
    if (!activeStudent) {
      return
    }
    optionRefs.current[activeStudent.id]?.scrollIntoView({ block: 'nearest' })
  }, [activeStudent])

  function moveActiveSuggestion(direction: 1 | -1) {
    if (!suggestions.length) {
      return
    }
    const nextIndex = (activeIndex + direction + suggestions.length) % suggestions.length
    setActiveStudentId(suggestions[nextIndex].id)
  }

  return (
    <section className="card-shell search-section">
      <div className="section-head">
        <div>
          <h3>生徒から選択</h3>
          <p>候補から追加した生徒ごとに、相性の良い贈り物を確認できます。</p>
        </div>
      </div>

      <div className="picker-block">
        <div className="student-search-form">
          <div className="student-search-primary">
            <input
              aria-activedescendant={activeStudent ? `${listId}-${activeStudent.id}` : undefined}
              aria-controls={query.trim() ? listId : undefined}
              aria-expanded={Boolean(query.trim() && suggestions.length)}
              aria-autocomplete="list"
              className="text-input"
              placeholder={GIFT_PLACEHOLDER}
              role="combobox"
              type="text"
              value={query}
              onChange={(event) => {
                setActiveStudentId(null)
                onQueryChange(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onSubmit(activeStudent)
                } else if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  moveActiveSuggestion(1)
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  moveActiveSuggestion(-1)
                }
              }}
            />
            <button className="btn btn-primary" type="button" onClick={() => onSubmit(activeStudent)}>
              追加
            </button>
          </div>
          <div className="student-search-secondary">
            <button className="btn" type="button" onClick={onClear}>
              クリア
            </button>
            <button className="btn" type="button" onClick={onExport}>
              出力
            </button>
          </div>
        </div>

        {query.trim() ? (
          <div id={listId} className="candidate-list" role="listbox">
            {suggestions.length ? (
              suggestions.map((student, index) => {
                const active = index === activeIndex
                return (
                  <button
                    id={`${listId}-${student.id}`}
                    key={student.id}
                    ref={(element) => {
                      optionRefs.current[student.id] = element
                    }}
                    aria-selected={active}
                    className={`candidate-item ${active ? 'active' : ''}`}
                    role="option"
                    type="button"
                    onClick={() => onAddStudent(student)}
                    onMouseEnter={() => setActiveStudentId(student.id)}
                  >
                    <span>{student.name}</span>
                    <small>{student.school || 'その他'}</small>
                  </button>
                )
              })
            ) : (
              <p className="helper-text">一致する生徒が見つかりません。</p>
            )}
          </div>
        ) : null}

        <div className="chip-wrap">
          {selectedStudents.length ? (
            selectedStudents.map((student) => (
              <div key={student.id} className="student-chip">
                <span>{student.name}</span>
                <button
                  aria-label={`${student.name} を外す`}
                  className="chip-remove"
                  type="button"
                  onClick={() => onRemoveStudent(student.id)}
                >
                  ×
                </button>
              </div>
            ))
          ) : (
            <p className="helper-text">まだ生徒は選択されていません。</p>
          )}
        </div>
      </div>
    </section>
  )
}
