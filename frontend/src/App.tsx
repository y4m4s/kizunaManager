import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { api, pollTask, waitForBackendReady } from './api'
import { ProgressModal } from './components/common/ProgressModal'
import { Toast } from './components/common/Toast'
import { Sidebar } from './components/layout/Sidebar'
import { NAV_ITEMS } from './constants'
import { GiftManagementScreen } from './screens/GiftManagementScreen'
import { ManageScreen } from './screens/ManageScreen'
import { OptimizeScreen } from './screens/OptimizeScreen'
import { SearchScreen } from './screens/SearchScreen'
import type { MasterStatus } from './types'

type Tab = (typeof NAV_ITEMS)[number]['key']

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
  const [backendReady, setBackendReady] = useState(false)
  const [masterStatus, setMasterStatus] = useState<MasterStatus | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [progress, setProgress] = useState<ProgressState>(INITIAL_PROGRESS)
  const [notice, setNotice] = useState('')
  const dismissNotice = useCallback(() => setNotice(''), [])

  useEffect(() => {
    let disposed = false

    async function connectBackend() {
      const ready = await waitForBackendReady(15000)
      if (disposed) {
        return
      }
      setBackendReady(ready)
      if (ready) {
        setRefreshToken((current) => current + 1)
      } else {
        setNotice(
          'バックエンドへ接続できませんでした。`npm run dev` か `npm run start` のログを確認してください。',
        )
      }
    }

    void connectBackend()

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    let disposed = false

    async function loadStatus() {
      if (!backendReady) {
        return
      }
      try {
        const status = await api.get_master_status()
        if (!disposed) {
          setMasterStatus(status)
        }
      } catch (error) {
        if (!disposed) {
          setNotice(error instanceof Error ? error.message : String(error))
        }
      }
    }

    void loadStatus()

    return () => {
      disposed = true
    }
  }, [backendReady, refreshToken])

  async function runTask(
    title: string,
    starter: () => Promise<{ task_id?: string; error?: string }>,
    successMessage: string,
  ) {
    if (!backendReady) {
      setNotice('バックエンドへの接続を待っています。数秒後に再度お試しください。')
      return
    }

    try {
      const response = await starter()
      if (!response?.task_id) {
        setNotice(response?.error || '処理の開始に失敗しました。')
        return
      }

      setNotice('')
      setProgress({
        current: 0,
        message: '処理を開始しています...',
        open: true,
        title,
        total: 1,
      })

      const snapshot = await pollTask(response.task_id, (task) => {
        setProgress({
          current: task.current,
          message: task.message,
          open: task.status === 'running',
          title,
          total: task.total,
        })
      })

      if (snapshot.status === 'error') {
        setNotice(`${title}に失敗しました: ${snapshot.error || 'unknown error'}`)
      } else {
        setNotice(successMessage)
        setRefreshToken((current) => current + 1)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setProgress(INITIAL_PROGRESS)
    }
  }

  function renderScreen() {
    if (activeTab === 'manage') {
      return (
        <ManageScreen
          bridgeReady={backendReady}
          refreshToken={refreshToken}
          onDataChanged={() => setRefreshToken((current) => current + 1)}
        />
      )
    }

    if (activeTab === 'optimize') {
      return (
        <OptimizeScreen
          bridgeReady={backendReady}
          onDataChanged={() => setRefreshToken((current) => current + 1)}
          refreshToken={refreshToken}
        />
      )
    }

    if (activeTab === 'giftManage') {
      return <GiftManagementScreen bridgeReady={backendReady} refreshToken={refreshToken} />
    }

    return <SearchScreen bridgeReady={backendReady} refreshToken={refreshToken} />
  }

  return (
    <>
      <div className="app">
        <Sidebar
          activeTab={activeTab}
          busy={progress.open}
          masterStatus={masterStatus}
          onDownloadIcons={() =>
            void runTask('画像ダウンロード', () => api.download_icons(), '画像ダウンロードが完了しました。')
          }
          onSelect={(tab) => setActiveTab(tab)}
          onUpdateMaster={() =>
            void runTask('最新データ更新', () => api.update_master_data(), '最新データの更新が完了しました。')
          }
        />

        <div className="content">
          <main className={`main ${activeTab === 'giftManage' ? 'main-compact' : ''}`}>
            {renderScreen()}
          </main>
        </div>
      </div>

      <Toast message={notice} onClose={dismissNotice} open={Boolean(notice)} />
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
