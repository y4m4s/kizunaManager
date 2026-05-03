import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateGiftExp, optimizeAllocation } from './optimizer.ts'
import type {
  ItemRecord,
  OptimizeResultRecord,
  OptimizeStudentResult,
  PlanRecord,
  StudentRecord,
} from './types.ts'

const PRIORITY_SCORE_ORDER = ['top_priority', 'priority', 'semi_priority']

function plan(
  id: number,
  studentId: number,
  requiredExp: number,
  priority = 'priority',
): PlanRecord {
  return {
    id,
    student_id: studentId,
    student_name: `S${studentId}`,
    school: '',
    current_bond_level: 1,
    current_bond_exp: 0,
    target_bond_level: 2,
    priority,
    notes: '',
    required_exp: requiredExp,
    progress: 0,
  }
}

function student(id: number, tags: string[] = []): StudentRecord {
  return {
    id,
    name: `S${id}`,
    school: '',
    icon_path: '',
    birthday: '',
    favor_item_tags: tags,
    favor_item_unique_tags: [],
    raw_json: {},
    current_bond_level: 1,
    current_bond_exp: 0,
    star_rank: 5,
    notes: '',
    is_owned: true,
  }
}

function item(
  id: number,
  name: string,
  rarity = 'SR',
  tags: string[] = [],
): ItemRecord {
  return {
    id,
    name,
    tags,
    rarity,
    category: 'Favor',
    exp_value: 0,
    gift_kind: 'gift',
    icon_name: '',
    icon_path: '',
    raw_json: {},
    quantity: 0,
  }
}

function isVisibleOptimizationGift(itemRecord: ItemRecord, effect: string): boolean {
  const rarity = String(itemRecord.rarity || '').toUpperCase()
  if (String(itemRecord.gift_kind || '').toLowerCase() === 'bouquet') {
    return true
  }
  if (rarity === 'SSR') {
    return effect === 'large' || effect === 'extra_large'
  }
  if (rarity === 'SR') {
    return effect === 'medium' || effect === 'large' || effect === 'extra_large'
  }
  return false
}

function fulfillmentScore(rows: OptimizeStudentResult[]): number[] {
  const groups = Object.fromEntries(
    PRIORITY_SCORE_ORDER.map((priority) => [
      priority,
      {
        completed: 0,
        deficit: 0,
        useful: 0,
        waste: 0,
      },
    ]),
  ) as Record<string, {
    completed: number
    deficit: number
    useful: number
    waste: number
  }>

  for (const row of rows) {
    const stats = groups[row.priority]
    if (!stats) {
      continue
    }
    const need = Math.max(0, Number(row.required_exp || 0) - Number(row.passive_exp || 0))
    const allocated = Number(row.allocated_exp || 0)
    const deficit = Math.max(0, need - allocated)
    const waste = Math.max(0, allocated - need)
    stats.completed += deficit === 0 ? 1 : 0
    stats.deficit += deficit
    stats.useful += Math.min(allocated, need)
    stats.waste += waste
  }

  return PRIORITY_SCORE_ORDER.flatMap((priority) => {
    const stats = groups[priority]
    return [
      stats.completed,
      -stats.deficit,
      stats.useful,
      -stats.waste,
    ]
  })
}

function compareScores(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

function exactFulfillmentScore(
  plans: PlanRecord[],
  inventory: Record<number, number>,
  studentsById: Record<number, StudentRecord>,
  itemsById: Record<number, ItemRecord>,
): number[] {
  const units = Object.entries(inventory).flatMap(([itemIdText, quantity]) =>
    Array.from({ length: Number(quantity) }, () => Number(itemIdText)),
  )
  let bestScore: number[] | null = null
  const allocatedByStudentId: Record<number, number> = {}

  function scoreCurrent(): number[] {
    return fulfillmentScore(
      plans.map((planRecord) => ({
        ...planRecord,
        birthday: '',
        days_until_birthday: 0,
        passive_exp: 0,
        allocated_exp: allocatedByStudentId[planRecord.student_id] || 0,
        remaining_exp: Math.max(
          0,
          Number(planRecord.required_exp || 0) -
            Number(allocatedByStudentId[planRecord.student_id] || 0),
        ),
        predicted_level: planRecord.current_bond_level,
        predicted_level_exp: planRecord.current_bond_exp,
        allocated_items: [],
      })),
    )
  }

  function search(unitIndex: number): void {
    if (unitIndex >= units.length) {
      const score = scoreCurrent()
      if (!bestScore || compareScores(score, bestScore) > 0) {
        bestScore = score
      }
      return
    }

    search(unitIndex + 1)

    const itemId = units[unitIndex]
    const itemRecord = itemsById[itemId]
    for (const planRecord of plans) {
      const studentRecord = studentsById[planRecord.student_id]
      const [effect, gainedExp] = calculateGiftExp(studentRecord, itemRecord, itemsById)
      if (!isVisibleOptimizationGift(itemRecord, effect)) {
        continue
      }
      allocatedByStudentId[planRecord.student_id] =
        (allocatedByStudentId[planRecord.student_id] || 0) + gainedExp
      search(unitIndex + 1)
      allocatedByStudentId[planRecord.student_id] -= gainedExp
    }
  }

  search(0)
  assert.ok(bestScore)
  return bestScore
}

function sharedAllocationsForClass(
  result: OptimizeResultRecord,
  effect: string,
  expPerItem: number,
): number[] {
  const usage = new Map<number, Set<number>>()
  for (const row of result.results) {
    for (const allocation of row.allocated_items) {
      if (allocation.effect !== effect || allocation.exp_per_item !== expPerItem) {
        continue
      }
      const students = usage.get(allocation.item_id) || new Set<number>()
      students.add(row.student_id)
      usage.set(allocation.item_id, students)
    }
  }
  return [...usage.entries()]
    .filter(([, students]) => students.size > 1)
    .map(([itemId]) => itemId)
}

test('does not use SSR medium gifts as optimizer candidates', () => {
  const plans = [plan(1, 1, 120)]
  const studentsById = { 1: student(1) }
  const itemsById = { 101: item(101, 'SSR medium', 'SSR') }

  const result = optimizeAllocation(plans, { 101: 1 }, studentsById, itemsById)

  assert.equal(result.results[0].allocated_exp, 0)
  assert.equal(result.results[0].remaining_exp, 120)
  assert.deepEqual(result.results[0].allocated_items, [])
  assert.equal(result.leftovers[0].item_id, 101)
})

test('uses SSR large gifts as optimizer candidates', () => {
  const plans = [plan(1, 1, 180)]
  const studentsById = { 1: student(1, ['a']) }
  const itemsById = { 101: item(101, 'SSR large', 'SSR', ['a']) }

  const result = optimizeAllocation(plans, { 101: 1 }, studentsById, itemsById)

  assert.equal(result.results[0].allocated_exp, 180)
  assert.equal(result.results[0].remaining_exp, 0)
  assert.equal(result.results[0].allocated_items[0].item_id, 101)
  assert.equal(result.results[0].allocated_items[0].effect, 'large')
})

test('rebalances equivalent class allocations away from shared items', () => {
  const plans = [
    plan(1, 1, 360),
    plan(2, 2, 180),
    plan(3, 3, 180),
  ]
  const studentsById = {
    1: student(1, ['a']),
    2: student(2, ['a']),
    3: student(3, ['a']),
  }
  const itemsById = {
    101: item(101, 'A', 'SSR', ['a']),
    102: item(102, 'B', 'SSR', ['a']),
    103: item(103, 'C', 'SSR', ['a']),
  }
  const inventory = {
    101: 3,
    102: 1,
    103: 1,
  }

  const result = optimizeAllocation(plans, inventory, studentsById, itemsById)

  assert.deepEqual(
    fulfillmentScore(result.results),
    exactFulfillmentScore(plans, inventory, studentsById, itemsById),
  )
  assert.deepEqual(sharedAllocationsForClass(result, 'large', 180), [])
  assert.equal(result.results.every((row) => row.remaining_exp === 0), true)
  assert.equal(result.leftovers.reduce((sum, row) => sum + row.quantity, 0), 1)
})
