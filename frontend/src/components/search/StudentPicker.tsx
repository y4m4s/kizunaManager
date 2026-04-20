import { GIFT_PLACEHOLDER } from '../../constants'
import type { Student } from '../../types'

type StudentPickerProps = {
  query: string
  selectedStudents: Student[]
  suggestions: Student[]
  onAddStudent: (student: Student) => void
  onQueryChange: (value: string) => void
  onRemoveStudent: (studentId: number) => void
  onSubmit: () => void
}

export function StudentPicker({
  query,
  selectedStudents,
  suggestions,
  onAddStudent,
  onQueryChange,
  onRemoveStudent,
  onSubmit,
}: StudentPickerProps) {
  return (
    <section className="card-shell search-section">
      <div className="section-head">
        <div>
          <h3>生徒から選択</h3>
          <p>候補から追加した生徒ごとに、相性の良い贈り物を確認できます。</p>
        </div>
      </div>

      <div className="picker-block">
        <div className="inline-form">
          <input
            className="text-input"
            placeholder={GIFT_PLACEHOLDER}
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onSubmit()
              }
            }}
          />
          <button className="btn" type="button" onClick={onSubmit}>
            追加
          </button>
        </div>

        {query.trim() ? (
          <div className="candidate-list">
            {suggestions.length ? (
              suggestions.map((student) => (
                <button
                  key={student.id}
                  className="candidate-item"
                  type="button"
                  onClick={() => onAddStudent(student)}
                >
                  <span>{student.name}</span>
                  <small>{student.school || 'その他'}</small>
                </button>
              ))
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
