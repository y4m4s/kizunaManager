import type {
  Item,
  MasterStatus,
  OptimizeResult,
  Plan,
  SearchResult,
  Student,
  TaskSnapshot,
} from './types'

// 本番ビルドはバックエンドが同一オリジンで配信するため相対パスを使う(Electron の動的ポートにも対応)
const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '')

function joinUrl(pathname: string): string {
  return `${API_BASE}${pathname}`
}

async function requestJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(joinUrl(pathname), {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  })

  const text = await response.text()
  const payload = text ? (JSON.parse(text) as T | { error?: string }) : ({} as T)

  if (!response.ok) {
    const errorMessage =
      typeof payload === 'object' && payload !== null && 'error' in payload && payload.error
        ? String(payload.error)
        : `${response.status} ${response.statusText}`
    throw new Error(errorMessage)
  }

  return payload as T
}

export function assetUrl(filePath: string | undefined | null): string | null {
  if (!filePath) {
    return null
  }
  const posix = filePath.replace(/\\/g, '/')
  const dataIndex = posix.indexOf('/data/')
  const relative = dataIndex !== -1 ? posix.slice(dataIndex + 1) : posix.replace(/^[/\\]+/, '')
  return `${API_BASE}/assets/${relative}`
}

export function dataAssetUrl(relativePath: string): string {
  const normalized = relativePath.replace(/^[/\\]+/, '').replace(/\\/g, '/')
  return `${API_BASE}/assets/data/${normalized}`
}

export function isBackendReady(): boolean {
  return true
}

export async function waitForBackendReady(timeoutMs = 5000): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const payload = await requestJson<{ ok: boolean }>('/api/health')
      if (payload.ok) {
        return true
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => window.setTimeout(resolve, 200))
  }
  return false
}

export async function pollTask(
  taskId: string,
  onProgress: (snapshot: TaskSnapshot) => void,
): Promise<TaskSnapshot> {
  while (true) {
    const snapshot = await requestJson<TaskSnapshot>(`/api/tasks/${taskId}`)
    onProgress(snapshot)
    if (snapshot.status === 'done' || snapshot.status === 'error') {
      return snapshot
    }
    await new Promise((resolve) => window.setTimeout(resolve, 250))
  }
}

interface RawApi {
  get_master_status(): Promise<MasterStatus>
  update_master_data(): Promise<{ task_id?: string; error?: string }>
  download_icons(): Promise<{ task_id?: string; error?: string }>

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

  list_items(): Promise<Item[]>
  get_inventory(): Promise<Record<string, number>>
  set_inventory_quantity(item_id: number, quantity: number): Promise<{ ok: boolean }>
  list_boxes(): Promise<Record<string, number>>
  set_box_quantity(box_type: string, quantity: number): Promise<{ ok: boolean }>

  run_gift_search(gift_ids: number[]): Promise<SearchResult[]>
  run_student_search(student_ids: number[]): Promise<SearchResult[]>

  list_plans(): Promise<Plan[]>
  save_plan(
    student_id: number,
    target_bond_level: number,
    priority: string,
    notes?: string,
    plan_id?: number | null,
  ): Promise<{ ok: boolean; plan_id: number }>
  delete_plan(plan_id: number): Promise<{ ok: boolean }>

  optimize(
    daily_top_priority_cafe_taps?: number,
    daily_other_cafe_taps?: number,
    daily_schedules?: number,
    include_semi_priority?: boolean,
    use_leftover_ssr_for_top?: boolean,
  ): Promise<OptimizeResult>

  get_ui_settings(): Promise<Record<string, string>>
  set_ui_setting(key: string, value: string): Promise<{ ok: boolean }>
}

export const api: RawApi = {
  get_master_status() {
    return requestJson('/api/master/status')
  },
  update_master_data() {
    return requestJson('/api/master/update', { method: 'POST' })
  },
  download_icons() {
    return requestJson('/api/master/icons', { method: 'POST' })
  },
  search_students(query = '', school = '', sort_by = 'name') {
    const params = new URLSearchParams({ query, school, sort_by })
    return requestJson(`/api/students?${params.toString()}`)
  },
  list_schools() {
    return requestJson('/api/schools')
  },
  get_student(student_id) {
    return requestJson(`/api/students/${student_id}`)
  },
  upsert_user_student(student_id, current_bond_level, current_bond_exp, notes = '') {
    return requestJson(`/api/user-students/${student_id}`, {
      method: 'PUT',
      body: JSON.stringify({
        current_bond_level,
        current_bond_exp,
        notes,
      }),
    })
  },
  delete_user_student(student_id) {
    return requestJson(`/api/user-students/${student_id}`, { method: 'DELETE' })
  },
  list_items() {
    return requestJson('/api/items')
  },
  get_inventory() {
    return requestJson('/api/inventory')
  },
  set_inventory_quantity(item_id, quantity) {
    return requestJson(`/api/inventory/${item_id}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    })
  },
  list_boxes() {
    return requestJson('/api/boxes')
  },
  set_box_quantity(box_type, quantity) {
    return requestJson(`/api/boxes/${box_type}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    })
  },
  run_gift_search(gift_ids) {
    return requestJson('/api/search/gifts', {
      method: 'POST',
      body: JSON.stringify({ gift_ids }),
    })
  },
  run_student_search(student_ids) {
    return requestJson('/api/search/students', {
      method: 'POST',
      body: JSON.stringify({ student_ids }),
    })
  },
  list_plans() {
    return requestJson('/api/plans')
  },
  save_plan(student_id, target_bond_level, priority, notes = '', plan_id = null) {
    const body: {
      notes: string
      plan_id?: number
      priority: string
      student_id: number
      target_bond_level: number
    } = {
      student_id,
      target_bond_level,
      priority,
      notes,
    }
    if (plan_id !== null && plan_id !== undefined) {
      body.plan_id = plan_id
    }
    return requestJson('/api/plans', {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  },
  delete_plan(plan_id) {
    return requestJson(`/api/plans/${plan_id}`, { method: 'DELETE' })
  },
  get_ui_settings() {
    return requestJson('/api/ui-settings')
  },
  set_ui_setting(key, value) {
    return requestJson(`/api/ui-settings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    })
  },
  optimize(
    daily_top_priority_cafe_taps = 0,
    daily_other_cafe_taps = 0,
    daily_schedules = 0,
    include_semi_priority = true,
    use_leftover_ssr_for_top = false,
  ) {
    return requestJson('/api/optimize', {
      method: 'POST',
      body: JSON.stringify({
        daily_top_priority_cafe_taps,
        daily_other_cafe_taps,
        daily_schedules,
        include_semi_priority,
        use_leftover_ssr_for_top,
      }),
    })
  },
}
