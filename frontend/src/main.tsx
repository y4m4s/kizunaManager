import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initPyEventBridge } from './api'
import App from './App.tsx'
import './index.css'

// Python → JS イベントブリッジをアプリ起動前にセットアップ
initPyEventBridge()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
