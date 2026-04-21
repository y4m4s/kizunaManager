import { useState } from 'react'
import { APP_TITLE, NAV_ITEMS } from '../../constants'
import type { MasterStatus } from '../../types'

type ActiveTab = (typeof NAV_ITEMS)[number]['key']

type SidebarProps = {
  activeTab: ActiveTab
  busy: boolean
  masterStatus: MasterStatus | null
  onDownloadIcons: () => void
  onSelect: (tab: ActiveTab) => void
  onUpdateMaster: () => void
}

function formatTimestamp(value: string): string {
  if (!value) {
    return '未取得'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function Sidebar({
  activeTab,
  busy,
  masterStatus,
  onDownloadIcons,
  onSelect,
  onUpdateMaster,
}: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  function handleSelect(tab: ActiveTab) {
    onSelect(tab)
    setMenuOpen(false)
  }

  return (
    <aside className={`sidebar ${menuOpen ? 'menu-open' : ''}`}>
      <div className="sidebar-header">
        <h1 className="app-title">{APP_TITLE}</h1>
        <button
          aria-controls="sidebar-nav"
          aria-expanded={menuOpen}
          aria-label="メニューを開閉"
          className="sidebar-menu-button"
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <nav id="sidebar-nav" className="nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${activeTab === item.key ? 'active' : ''}`}
            type="button"
            onClick={() => handleSelect(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-actions">
          <button
            className="btn btn-primary sidebar-action-button"
            disabled={busy}
            type="button"
            onClick={onUpdateMaster}
          >
            最新データ更新
          </button>
          <button
            className="btn sidebar-action-button"
            disabled={busy}
            type="button"
            onClick={onDownloadIcons}
          >
            画像ダウンロード
          </button>
        </div>

        <div className="sidebar-status card-shell">
          <strong>マスターデータ</strong>
          <dl>
            <div>
              <dt>取得元</dt>
              <dd>{masterStatus?.source || 'loading...'}</dd>
            </div>
            <div>
              <dt>生徒 / 贈り物</dt>
              <dd>
                {masterStatus?.counts.students ?? '-'} / {masterStatus?.counts.items ?? '-'}
              </dd>
            </div>
            <div>
              <dt>更新日時</dt>
              <dd>{formatTimestamp(masterStatus?.refreshed_at || '')}</dd>
            </div>
          </dl>
        </div>
      </div>
    </aside>
  )
}
