export interface StudentRecord {
  id: number
  name: string
  school: string
  icon_path: string
  birthday: string
  favor_item_tags: string[]
  favor_item_unique_tags: string[]
  raw_json: Record<string, unknown>
  current_bond_level: number
  current_bond_exp: number
  star_rank: number
  notes: string
  is_owned: boolean
}

export interface ItemRecord {
  id: number
  name: string
  tags: string[]
  rarity: string
  category: string
  exp_value: number
  gift_kind: string
  icon_name: string
  icon_path: string
  raw_json: Record<string, unknown>
  quantity: number
  box_type?: string
}

export interface PlanRecord {
  id: number
  student_id: number
  student_name: string
  school: string
  current_bond_level: number
  current_bond_exp: number
  target_bond_level: number
  priority: string
  notes: string
  required_exp: number
  progress: number
}

export interface SlimItemRecord {
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

export interface SearchResultRecord {
  student_id: number
  student_name: string
  icon_path: string
  effects: {
    extra_large: SlimItemRecord[]
    large: SlimItemRecord[]
    medium: SlimItemRecord[]
  }
}

export interface AllocationRecord {
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
}

export interface OptimizeStudentResult {
  id: number
  student_id: number
  student_name: string
  birthday: string
  days_until_birthday: number
  priority: string
  notes: string
  current_bond_level: number
  current_bond_exp: number
  target_bond_level: number
  required_exp: number
  progress: number
  passive_exp: number
  allocated_exp: number
  remaining_exp: number
  predicted_level: number
  predicted_level_exp: number
  allocated_items: AllocationRecord[]
}

export interface OptimizeResultRecord {
  results: OptimizeStudentResult[]
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
    craft_material_ok: boolean
  }>
  craftable_boxes: {
    box_count: number
    source_item_count: number
  }
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


