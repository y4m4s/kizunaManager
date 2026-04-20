/**
 * pywebview API ブリッジの型付きラッパー。
 *
 * Python 側の Api クラスのパブリックメソッドに対応している。
 * すべての呼び出しは Promise を返す（pywebview が非同期化する）。
 *
 * 画像 URL の解決:
 *   Python から返される icon_path は data/images/... のような絶対パスなので、
 *   assetUrl() でアセットサーバー（localhost:8765）経由の URL に変換して使う。
 */

import type {
  Item,
  MasterStatus,
  OptimizeResult,
  Plan,
  PyEventMap,
  SearchResult,
  Student,
} from './types'

const ASSET_PORT = 8765

// ── アセット URL ─────────────────────────────────────────────────

/**
 * Python から返された絶対パスをアセットサーバー経由の URL に変換する。
 * パスが空の場合は null を返す。
 */
export function assetUrl(filePath: string | undefined | null): string | null {
  if (!filePath) return null
  // Windows の絶対パス (C:\...) も POSIX に正規化
  const posix = filePath.replace(/\\/g, '/')
  // パスの data/ 以降を抽出してアセットサーバーのベース URL に結合
  const dataIndex = posix.indexOf('/data/')
  const relative = dataIndex !== -1 ? posix.slice(dataIndex + 1) : posix
  return `http://127.0.0.1:${ASSET_PORT}/${relative}`
}

export function dataAssetUrl(relativePath: string): string {
  const normalized = relativePath.replace(/^[/\\]+/, '').replace(/\\/g, '/')
  return `http://127.0.0.1:${ASSET_PORT}/data/${normalized}`
}

// ── pywebview API 型定義 ─────────────────────────────────────────

interface RawApi {
  // マスターデータ
  get_master_status(): Promise<MasterStatus>
  update_master_data(): Promise<{ status?: string; error?: string }>
  download_icons(): Promise<{ status?: string; error?: string }>

  // 生徒
  search_students(query?: string, school?: string, sort_by?: string): Promise<Student[]>
  list_schools(): Promise<string[]>
  get_student(student_id: number): Promise<Student | null>
  upsert_user_student(
    student_id: number,
    current_bond_level: number,
    current_bond_exp: number,
    notes?: string,
  ): Promise<{ ok: boolean }>
  delete_user_student(student_id: number): Promise<{ ok: boolean }>

  // アイテム / インベントリ
  list_items(): Promise<Item[]>
  get_inventory(): Promise<Record<string, number>>
  set_inventory_quantity(item_id: number, quantity: number): Promise<{ ok: boolean }>
  list_boxes(): Promise<Record<string, number>>
  set_box_quantity(box_type: string, quantity: number): Promise<{ ok: boolean }>

  // 検索
  run_gift_search(gift_ids: number[]): Promise<SearchResult[]>
  run_student_search(student_ids: number[]): Promise<SearchResult[]>

  // プラン
  list_plans(): Promise<Plan[]>
  save_plan(
    student_id: number,
    target_bond_level: number,
    priority: string,
    notes?: string,
    plan_id?: number | null,
  ): Promise<{ ok: boolean; plan_id: number }>
  delete_plan(plan_id: number): Promise<{ ok: boolean }>

  // 最適化
  optimize(
    strategy?: string,
    daily_cafe_taps?: number,
    daily_schedules?: number,
  ): Promise<OptimizeResult>
}

// ── window 拡張 ──────────────────────────────────────────────────

declare global {
  interface Window {
    pywebview?: { api?: RawApi }
    __pyEvent: <K extends keyof PyEventMap>(event: K, payload: PyEventMap[K]) => void
  }
}

// ── イベントシステム初期化 ───────────────────────────────────────

/**
 * Python から evaluate_js で呼ばれる window.__pyEvent をセットアップする。
 * React コンポーネントは addEventListener('pywebview:<eventName>', ...) で受け取れる。
 */
export function initPyEventBridge(): void {
  window.__pyEvent = (event, payload) => {
    window.dispatchEvent(
      new CustomEvent(`pywebview:${event}`, { detail: payload }),
    )
  }
}

/**
 * pywebview イベントを React から購読するユーティリティ。
 *
 * @example
 * useEffect(() => onPyEvent('onMasterUpdateProgress', (payload) => {
 *   setProgress(payload.current / payload.total)
 * }), [])
 */
export function onPyEvent<K extends keyof PyEventMap>(
  event: K,
  handler: (payload: PyEventMap[K]) => void,
): () => void {
  const listener = (e: Event) => handler((e as CustomEvent).detail)
  window.addEventListener(`pywebview:${event}`, listener)
  return () => window.removeEventListener(`pywebview:${event}`, listener)
}

// ── API エクスポート ─────────────────────────────────────────────

/**
 * pywebview が利用可能かチェックする。
 * ブラウザ単体で開発する場合は false になる。
 */
export function isPywebview(): boolean {
  return typeof window !== 'undefined' && 'pywebview' in window
}

export function isPywebviewReady(): boolean {
  return typeof window !== 'undefined' && typeof window.pywebview?.api === 'object'
}

export function waitForPywebviewReady(timeoutMs = 5000): Promise<boolean> {
  if (isPywebviewReady()) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    let settled = false

    const finish = (ready: boolean) => {
      if (settled) {
        return
      }
      settled = true
      window.removeEventListener('pywebviewready', onReady)
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
      resolve(ready)
    }

    const onReady = () => finish(isPywebviewReady())
    const intervalId = window.setInterval(() => {
      if (isPywebviewReady()) {
        finish(true)
      }
    }, 100)
    const timeoutId = window.setTimeout(() => finish(isPywebviewReady()), timeoutMs)

    window.addEventListener('pywebviewready', onReady, { once: true })
  })
}

/** pywebview API への参照。isPywebview() が false の場合は undefined。 */
export const api: RawApi = new Proxy({} as RawApi, {
  get(_target, prop: string) {
    if (!isPywebviewReady()) {
      console.warn(`[api] pywebview が利用できません: ${prop}()`)
      return () => Promise.resolve(null)
    }
    const fn = window.pywebview?.api?.[prop as keyof RawApi]
    if (typeof fn !== 'function') {
      console.warn(`[api] 存在しないメソッド: ${prop}`)
      return () => Promise.resolve(null)
    }
    return fn.bind(window.pywebview?.api)
  },
})
