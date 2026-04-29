import { useDeferredValue, useEffect, useState } from 'react'
import { api } from '../api'
import { SEARCH_TABS } from '../constants'
import type { Item, SearchResult, Student } from '../types'
import { GiftPicker } from '../components/search/GiftPicker'
import { SearchResultsTable } from '../components/search/SearchResultsTable'
import { StudentPicker } from '../components/search/StudentPicker'

type SearchScreenProps = {
  bridgeReady: boolean
  refreshToken: number
}

function isBouquetItem(item: Pick<Item, 'gift_kind' | 'name'>): boolean {
  return item.gift_kind === 'bouquet' || item.name.includes('\u82b1\u675f')
}

function giftDisplayRank(item: Item): number {
  if (item.rarity === 'SSR' && !isBouquetItem(item)) {
    return 0
  }
  if (isBouquetItem(item)) {
    return 1
  }
  return 2
}

function sortGiftItems(items: Item[]): Item[] {
  return [...items].sort((left, right) => {
    const rankDiff = giftDisplayRank(left) - giftDisplayRank(right)
    if (rankDiff !== 0) {
      return rankDiff
    }
    return left.name.localeCompare(right.name, 'ja')
  })
}

export function SearchScreen({ bridgeReady, refreshToken }: SearchScreenProps) {
  const [activeTab, setActiveTab] = useState<'gift' | 'student'>('gift')
  const [items, setItems] = useState<Item[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [selectedGiftIds, setSelectedGiftIds] = useState<number[]>([])
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([])
  const [studentQuery, setStudentQuery] = useState('')
  const [hideMedium, setHideMedium] = useState(false)
  const [hiddenResultIds, setHiddenResultIds] = useState<number[]>([])
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(true)

  const deferredStudentQuery = useDeferredValue(studentQuery)

  useEffect(() => {
    let disposed = false

    async function load() {
      if (!bridgeReady) {
        setLoading(true)
        return
      }
      setLoading(true)
      const [studentRows, itemRows] = await Promise.all([
        api.search_students('', '', 'name'),
        api.list_items(),
      ])
      if (disposed) {
        return
      }
      setStudents(Array.isArray(studentRows) ? studentRows : [])
      setItems(sortGiftItems(Array.isArray(itemRows) ? itemRows : []))
      setLoading(false)
    }

    void load()

    return () => {
      disposed = true
    }
  }, [bridgeReady, refreshToken])

  const selectedStudents = students.filter((student) =>
    selectedStudentIds.includes(student.id),
  )

  const candidateStudents = students
    .filter((student) => !selectedStudentIds.includes(student.id))
    .filter((student) =>
      deferredStudentQuery.trim()
        ? student.name.toLowerCase().includes(deferredStudentQuery.trim().toLowerCase())
        : false,
    )
    .slice(0, 40)

  const visibleResults = results
    .filter((row) => !hiddenResultIds.includes(row.student_id))
    .filter((row) => {
      if (activeTab !== 'gift' || !hideMedium) {
        return true
      }
      return row.effects.extra_large.length > 0 || row.effects.large.length > 0
    })

  async function runSearch() {
    setHideMedium(false)
    setHiddenResultIds([])

    if (activeTab === 'gift') {
      if (!selectedGiftIds.length) {
        window.alert('贈り物を1つ以上選択してください。')
        return
      }
      const next = await api.run_gift_search(selectedGiftIds)
      setResults(Array.isArray(next) ? next : [])
      return
    }

    if (!selectedStudentIds.length) {
      window.alert('生徒を1人以上追加してください。')
      return
    }
    const next = await api.run_student_search(selectedStudentIds)
    setResults(Array.isArray(next) ? next : [])
  }

  function switchTab(tab: 'gift' | 'student') {
    setActiveTab(tab)
    setHideMedium(false)
    setHiddenResultIds([])
    setResults([])
  }

  function addStudent(student: Student) {
    if (selectedStudentIds.includes(student.id)) {
      return
    }
    setSelectedStudentIds((current) => [...current, student.id])
    setStudentQuery('')
  }

  function submitStudent(activeStudent?: Student) {
    const lowered = studentQuery.trim().toLowerCase()
    const matched = activeStudent ?? candidateStudents.find(
      (student) => student.name.toLowerCase() === lowered,
    ) ?? candidateStudents[0]
    if (!matched) {
      window.alert('候補から追加したい生徒を選んでください。')
      return
    }
    addStudent(matched)
  }

  function clearSelection() {
    if (activeTab === 'gift') {
      setSelectedGiftIds([])
    } else {
      setSelectedStudentIds([])
      setStudentQuery('')
    }
    setHideMedium(false)
    setHiddenResultIds([])
    setResults([])
  }

  return (
    <div className="screen-stack">
      <section className="card-shell screen-header">
        <div className="section-head">
          <div>
            <h2>検索</h2>
            <p>贈り物からでも、生徒からでも同じテーブル形式で相性を確認できます。</p>
          </div>
        </div>

        <div className="pill-tabs">
          {SEARCH_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`pill-tab ${activeTab === tab.key ? 'active' : ''}`}
              type="button"
              onClick={() => switchTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'gift' ? (
        <GiftPicker
          items={items}
          selectedIds={selectedGiftIds}
          onToggle={(itemId) =>
            setSelectedGiftIds((current) =>
              current.includes(itemId)
                ? current.filter((value) => value !== itemId)
                : [...current, itemId],
            )
          }
        />
      ) : (
        <StudentPicker
          query={studentQuery}
          selectedStudents={selectedStudents}
          suggestions={candidateStudents}
          onAddStudent={addStudent}
          onQueryChange={setStudentQuery}
          onRemoveStudent={(studentId) =>
            setSelectedStudentIds((current) => current.filter((value) => value !== studentId))
          }
          onSubmit={submitStudent}
        />
      )}

      <section className="card-shell">
        <div className="toolbar-row">
          <div className="toolbar-actions">
            <button className="btn btn-primary" disabled={loading} type="button" onClick={() => void runSearch()}>
              {loading ? '読み込み中...' : 'この条件で検索する'}
            </button>
            <button className="btn" type="button" onClick={clearSelection}>
              クリア
            </button>
          </div>

          <div className="toolbar-actions">
            {activeTab === 'gift' && results.length ? (
              <button className="btn" type="button" onClick={() => setHideMedium((current) => !current)}>
                {hideMedium ? '中を表示する' : '中を非表示にする'}
              </button>
            ) : null}
            {hiddenResultIds.length ? (
              <button className="btn" type="button" onClick={() => setHiddenResultIds([])}>
                非表示を解除
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <SearchResultsTable
        hideMedium={hideMedium}
        mode={activeTab}
        rows={visibleResults}
        onHideRow={(studentId) =>
          setHiddenResultIds((current) => [...current, studentId])
        }
      />
    </div>
  )
}
