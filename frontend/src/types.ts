export interface Student {
  id: number
  name: string
  school: string
  icon_path: string
  birthday: string
  is_owned: boolean
  current_bond_level: number
  current_bond_exp: number
  star_rank: number
  notes: string
  favor_item_tags: string[]
  favor_item_unique_tags: string[]
}

export interface Item {
  id: number
  name: string
  rarity: string
  icon_path: string
  gift_kind: string
  tags: string[]
  exp_value: number
  quantity: number
}

export interface SlimItem {
  id: number
  name: string
  rarity: string
  icon_path: string
  effect: string
  effect_label: string
  gained_exp: number
  quantity: number
  gift_kind: string
}

export interface SearchResult {
  student_id: number
  student_name: string
  icon_path: string
  effects: {
    extra_large: SlimItem[]
    large: SlimItem[]
    medium: SlimItem[]
  }
}

export type PriorityKey =
  | 'top_priority'
  | 'priority'
  | 'semi_priority'
  | 'defer'
  | 'done'

export interface Plan {
  id: number
  student_id: number
  student_name: string
  school: string
  current_bond_level: number
  current_bond_exp: number
  target_bond_level: number
  priority: PriorityKey
  priority_label: string
  notes: string
  required_exp: number
  progress: number
}

export interface MasterStatus {
  counts: { students: number; items: number }
  source: string
  refreshed_at: string
}

export interface OptimizeResult {
  results: Array<{
    id: number
    student_id: number
    student_name: string
    birthday: string
    days_until_birthday: number
    priority: PriorityKey
    notes: string
    current_bond_level: number
    current_bond_exp?: number
    target_bond_level: number
    required_exp: number
    progress: number
    passive_exp: number
    allocated_exp: number
    remaining_exp: number
    predicted_level: number
    predicted_level_exp: number
    allocated_items: Array<{
      item_id: number
      item_name: string
      icon_path: string
      rarity: string
      gift_kind: string
      count: number
      effect: string
      effect_label: string
      exp_per_item: number
      total_exp: number
    }>
  }>
  summary: {
    total_required_exp: number
    total_allocated_exp: number
    total_passive_exp: number
    completion_rate: number
  }
  leftovers: Array<{
    item_id: number
    item_name: string
    icon_path: string
    rarity: string
    gift_kind: string
    quantity: number
    craft_material_ok?: boolean
  }>
  craftable_boxes: {
    box_count: number
    source_item_count: number
  }
  error?: string
}

export interface TaskSnapshot {
  id: string
  kind: string
  status: 'running' | 'done' | 'error'
  message: string
  current: number
  total: number
  started_at: string
  finished_at?: string
  result?: Record<string, unknown>
  error?: string
}


