import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))
export const BACKEND_DIR = path.resolve(CURRENT_DIR, '..')
export const BASE_DIR = path.resolve(BACKEND_DIR, '..')
// パッケージ版デスクトップアプリでは KIZUNA_DATA_DIR でユーザーデータ領域に差し替える
export const DATA_DIR = process.env.KIZUNA_DATA_DIR
  ? path.resolve(process.env.KIZUNA_DATA_DIR)
  : path.join(BASE_DIR, 'data')
export const CACHE_DIR = path.join(DATA_DIR, 'cache')
export const IMAGE_DIR = path.join(DATA_DIR, 'images')
export const STUDENT_IMAGE_DIR = path.join(IMAGE_DIR, 'students')
export const ITEM_IMAGE_DIR = path.join(IMAGE_DIR, 'items')
export const DB_PATH = path.join(DATA_DIR, 'bond_manager.db')
export const RECOVERED_DB_PATH = path.join(DATA_DIR, 'bond_manager.recovered.db')
export const CACHE_META_PATH = path.join(CACHE_DIR, 'meta.json')
export const FRONTEND_DIST_DIR = path.join(BASE_DIR, 'frontend', 'dist')

export const DEFAULT_PORT = Number(process.env.PORT || 8787)
export const MASTER_LANG = 'jp'
export const MASTER_RESOURCES = ['students', 'items'] as const
export const MASTER_PRIMARY_BASE_URL = 'https://schaledb.com'
export const MASTER_FALLBACK_BASE_URL =
  'https://raw.githubusercontent.com/SchaleDB/SchaleDB/main'

export const MASTER_SOURCE_LABELS = {
  web: 'schaledb_web',
  github: 'schaledb_github_archive',
  cache: 'cache',
  sample: 'sample',
} as const

export const MASTER_RESOURCE_LABELS: Record<string, string> = {
  students: '生徒データ',
  items: '贈り物データ',
}

export const SELECTABLE_BOX_KEY = 'orange_L'
export const SELECTABLE_BOX_ITEM_ID = -1001
export const SELECTABLE_BOX_NAME = '選択式ボックス'
export const SELECTABLE_BOX_ICON_FILE = 'item_icon_favor_selection.webp'

export const PRIORITY_ORDER: Record<string, number> = {
  top_priority: 5,
  priority: 4,
  semi_priority: 3,
  defer: 2,
  done: 1,
}

export const PRIORITY_LABELS: Record<string, string> = {
  top_priority: '最優先',
  priority: '優先',
  semi_priority: '準優先',
  defer: '保留',
  done: '終了',
}

export const HIDDEN_ITEM_NAMES = new Set(['初音ミクのフォトカード'])
export const HIDDEN_ITEM_ICON_NAMES = new Set(['item_icon_favor_ssr_2'])

export const SCHOOL_NAME_MAP: Record<string, string> = {
  Abydos: 'アビドス',
  Arius: 'アリウス',
  ETC: 'その他',
  Gehenna: 'ゲヘナ',
  Highlander: 'ハイランダー',
  Hyakkiyako: '百鬼夜行',
  Millennium: 'ミレニアム',
  RedWinter: 'レッドウィンター',
  SRT: 'SRT',
  Sakugawa: '桜川',
  Shanhaijing: '山海経',
  Tokiwadai: '常盤台',
  Trinity: 'トリニティ',
  Valkyrie: 'ヴァルキューレ',
  WildHunt: 'ワイルドハント',
}

export function normalizeSchoolName(value: string): string {
  const school = String(value || '').trim()
  return SCHOOL_NAME_MAP[school] || school
}

export function isHiddenItem(name = '', iconName = ''): boolean {
  return HIDDEN_ITEM_NAMES.has(String(name || '').trim()) ||
    HIDDEN_ITEM_ICON_NAMES.has(String(iconName || '').trim())
}
