export const APP_TITLE = 'Blue Archive kizunaManager'
export const SHELL_HEADING = 'BlueArchive kizunaManager'
export const SHELL_SUBTITLE = '検索から管理、最適化までをひとつの画面でつなぐデスクトップツール'

export const NAV_ITEMS = [
  { key: 'search', label: '検索' },
  { key: 'manage', label: '管理' },
  { key: 'optimize', label: '最適化' },
] as const

export const SEARCH_TABS = [
  { key: 'gift', label: '贈り物から検索' },
  { key: 'student', label: '生徒から選択' },
] as const

export const PRIORITY_OPTIONS = [
  { value: 'top_priority', label: '最優先' },
  { value: 'priority', label: '優先' },
  { value: 'semi_priority', label: '準優先' },
  { value: 'defer', label: '見送り' },
  { value: 'done', label: '終了' },
] as const

export const OPTIMIZE_PRIORITY_OPTIONS = PRIORITY_OPTIONS.filter(
  (option) =>
    option.value === 'top_priority' ||
    option.value === 'priority' ||
    option.value === 'semi_priority',
)

export const PRIORITY_LABELS: Record<string, string> = Object.fromEntries(
  PRIORITY_OPTIONS.map((option) => [option.value, option.label]),
)

export const PRIORITY_SORT_ORDER: Record<string, number> = Object.fromEntries(
  PRIORITY_OPTIONS.map((option, index) => [option.value, index]),
)

export const OPTIMIZE_STRATEGIES = [
  { value: 'priority', label: '優先度順' },
  { value: 'balanced', label: '均等配分' },
  { value: 'focus', label: '1人集中' },
] as const

export const GIFT_BOX_TYPES = [
  { key: 'orange_S', label: '橙 小' },
  { key: 'orange_M', label: '橙 中' },
  { key: 'orange_L', label: '橙 大' },
  { key: 'orange_XL', label: '橙 特大' },
  { key: 'purple_S', label: '紫 小' },
  { key: 'purple_M', label: '紫 中' },
  { key: 'purple_L', label: '紫 大' },
  { key: 'purple_XL', label: '紫 特大' },
] as const

export const SEARCH_EFFECT_COLUMNS = [
  { key: 'extra_large', label: '特大' },
  { key: 'large', label: '大' },
  { key: 'medium', label: '中' },
] as const

export const GIFT_PLACEHOLDER = '生徒名で検索'
