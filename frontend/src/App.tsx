import { useEffect, useState } from 'react'
import './App.css'
import { api, isPywebview, isPywebviewReady, onPyEvent, waitForPywebviewReady } from './api'
import { ProgressModal } from './components/common/ProgressModal'
import { Sidebar } from './components/layout/Sidebar'
import { ManageScreen } from './screens/ManageScreen'
import { OptimizeScreen } from './screens/OptimizeScreen'
import { SearchScreen } from './screens/SearchScreen'
import type { MasterStatus } from './types'

type Tab = 'search' | 'manage' | 'optimize'

/*
function LegacyApp() {
  const [activeTab, setActiveTab] = useState<Tab>('search')

  return (
    <div className="app">
      legacy sidebar block
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="app-title">ブルーアーカイブ<br />絆マネージャー</h1>
          <p className="app-subtitle">軽量・ローカル完結・扱いやすいUX</p>
        </div>

        <nav className="nav">
          {(['search', 'manage', 'optimize'] as Tab[]).map((tab) => (
            <button
              key={tab}
              className={`nav-item ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'search' && '検索'}
              {tab === 'manage' && '管理'}
              {tab === 'optimize' && '最適化'}
            </button>
          ))}
        </nav>
      </aside>

      legacy content block
      <div className="content">
        <header className="topbar">
          <div>
            <h2 className="topbar-title">Blue Archive Bond Manager</h2>
            <p className="topbar-sub">検索から管理、配分までを1画面でつなぐデスクトップツール</p>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-primary">最新データ更新</button>
            <button className="btn">画像ダウンロード</button>
          </div>
        </header>

        <main className="main">
          {activeTab === 'search' && (
            <div className="placeholder">
              <p>🔍 検索画面（実装予定）</p>
            </div>
          )}
          {activeTab === 'manage' && (
            <div className="placeholder">
              <p>📋 管理画面（実装予定）</p>
            </div>
          )}
          {activeTab === 'optimize' && (
            <div className="placeholder">
              <p>⚡ 最適化画面（実装予定）</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
*/

type ProgressState = {
  current: number
  message: string
  open: boolean
  title: string
  total: number
}

const INITIAL_PROGRESS: ProgressState = {
  current: 0,
  message: '',
  open: false,
  title: '',
  total: 0,
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('search')
  const [bridgeReady, setBridgeReady] = useState(isPywebviewReady())
  const [masterStatus, setMasterStatus] = useState<MasterStatus | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [progress, setProgress] = useState<ProgressState>(INITIAL_PROGRESS)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let disposed = false

    async function waitBridge() {
      if (isPywebviewReady()) {
        setBridgeReady(true)
        return
      }

      const ready = await waitForPywebviewReady(15000)
      if (disposed) {
        return
      }

      setBridgeReady(ready)
      if (ready) {
        setRefreshToken((current) => current + 1)
        return
      }

      setNotice(
        !isPywebview()
          ? '`python main.py --dev` で開いたアプリウィンドウから確認してください。ブラウザ単体ではデータを読み込めません。'
          : 'バックエンドとの接続を確認できませんでした。`python main.py --dev` で開いた pywebview ウィンドウを使っているか確認してください。',
      )
    }

    void waitBridge()

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    let disposed = false

    async function loadStatus() {
      if (!bridgeReady) {
        return
      }
      const status = await api.get_master_status()
      if (!disposed && status && typeof status === 'object') {
        setMasterStatus(status as MasterStatus)
      }
    }

    void loadStatus()
    return () => {
      disposed = true
    }
  }, [bridgeReady, refreshToken])

  useEffect(() => {
    const offUpdateProgress = onPyEvent('onMasterUpdateProgress', (payload) => {
      setProgress({
        current: payload.current,
        message: payload.message,
        open: true,
        title: '最新データ更新',
        total: payload.total,
      })
    })
    const offUpdateDone = onPyEvent('onMasterUpdateDone', () => {
      setProgress(INITIAL_PROGRESS)
      setNotice('最新データの取得が完了しました。')
      setRefreshToken((current) => current + 1)
    })
    const offUpdateError = onPyEvent('onMasterUpdateError', (payload) => {
      setProgress(INITIAL_PROGRESS)
      setNotice(`最新データ更新に失敗しました: ${payload.error}`)
    })
    const offIconProgress = onPyEvent('onIconDownloadProgress', (payload) => {
      setProgress({
        current: payload.current,
        message: payload.message,
        open: true,
        title: '画像ダウンロード',
        total: payload.total,
      })
    })
    const offIconDone = onPyEvent('onIconDownloadDone', () => {
      setProgress(INITIAL_PROGRESS)
      setNotice('画像ダウンロードが完了しました。')
      setRefreshToken((current) => current + 1)
    })
    const offIconError = onPyEvent('onIconDownloadError', (payload) => {
      setProgress(INITIAL_PROGRESS)
      setNotice(`画像ダウンロードに失敗しました: ${payload.error}`)
    })

    return () => {
      offUpdateProgress()
      offUpdateDone()
      offUpdateError()
      offIconProgress()
      offIconDone()
      offIconError()
    }
  }, [])

  async function startMasterUpdate() {
    if (!bridgeReady) {
      setNotice(
        isPywebview()
          ? 'バックエンドとの接続を待っています。数秒待ってからもう一度試してください。'
          : '`python main.py --dev` で開いたアプリウィンドウから更新してください。',
      )
      return
    }
    const response = await api.update_master_data()
    if (!response || response?.error) {
      setNotice(response?.error || '更新を開始できませんでした。')
      return
    }
    setNotice('')
    setProgress({
      current: 0,
      message: '最新データを取得しています...',
      open: true,
      title: '最新データ更新',
      total: 1,
    })
  }

  async function startIconDownload() {
    if (!bridgeReady) {
      setNotice(
        isPywebview()
          ? 'バックエンドとの接続を待っています。数秒待ってからもう一度試してください。'
          : '`python main.py --dev` で開いたアプリウィンドウから更新してください。',
      )
      return
    }
    const response = await api.download_icons()
    if (!response || response?.error) {
      setNotice(response?.error || '画像ダウンロードを開始できませんでした。')
      return
    }
    setNotice('')
    setProgress({
      current: 0,
      message: '画像をダウンロードしています...',
      open: true,
      title: '画像ダウンロード',
      total: 1,
    })
  }

  function renderScreen() {
    if (activeTab === 'manage') {
      return (
        <ManageScreen
          bridgeReady={bridgeReady}
          refreshToken={refreshToken}
          onDataChanged={() => setRefreshToken((current) => current + 1)}
        />
      )
    }

    if (activeTab === 'optimize') {
      return (
        <OptimizeScreen
          bridgeReady={bridgeReady}
          onDataChanged={() => setRefreshToken((current) => current + 1)}
          refreshToken={refreshToken}
        />
      )
    }

    return <SearchScreen bridgeReady={bridgeReady} refreshToken={refreshToken} />
  }

  return (
    <>
      <div className="app">
        <Sidebar
          activeTab={activeTab}
          busy={progress.open}
          masterStatus={masterStatus}
          onDownloadIcons={() => void startIconDownload()}
          onSelect={(tab) => setActiveTab(tab)}
          onUpdateMaster={() => void startMasterUpdate()}
        />

        <div className="content">
          <main className="main">
            {notice ? <div className="notice-banner">{notice}</div> : null}
            {renderScreen()}
          </main>
        </div>
      </div>

      <ProgressModal
        current={progress.current}
        message={progress.message}
        open={progress.open}
        title={progress.title}
        total={progress.total}
      />
    </>
  )
}

export default App
