import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateGiftExp, optimizeAllocation } from './optimizer.ts'
import { calcRequiredExp, projectLevelAfterGain } from './bondCalculator.ts'
import { SELECTABLE_BOX_ITEM_ID } from './config.ts'
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

test('marks leftover SR gifts as craft-safe when no registered student can use them', () => {
  const plans = [plan(1, 1, 120, 'top_priority')]
  const studentsById = {
    1: student(1),
    2: student(2),
  }
  const itemsById = {
    101: item(101, 'Unmatched SR'),
    102: item(102, 'SSR medium', 'SSR'),
  }

  const result = optimizeAllocation(plans, { 101: 2, 102: 1 }, studentsById, itemsById)

  assert.equal(
    result.leftovers.find((leftover) => leftover.item_id === 101)?.craft_material_ok,
    true,
  )
  assert.equal(
    result.leftovers.find((leftover) => leftover.item_id === 102)?.craft_material_ok,
    false,
  )
})

test('does not mark leftover SR gifts craft-safe when a registered student can use them', () => {
  const plans = [plan(1, 1, 120, 'top_priority')]
  const studentsById = {
    1: student(1),
    2: student(2, ['a']),
  }
  const itemsById = { 101: item(101, 'Matched SR', 'SR', ['a']) }

  const result = optimizeAllocation(plans, { 101: 2 }, studentsById, itemsById)

  assert.equal(
    result.leftovers.find((leftover) => leftover.item_id === 101)?.craft_material_ok,
    false,
  )
})

test('ignores unregistered or max-bond students when judging craft safety', () => {
  const plans = [plan(1, 1, 120, 'top_priority')]
  const studentsById = {
    1: student(1),
    2: { ...student(2, ['a']), is_owned: false },
    3: { ...student(3, ['a']), current_bond_level: 100 },
  }
  const itemsById = { 101: item(101, 'Matched SR', 'SR', ['a']) }

  const result = optimizeAllocation(plans, { 101: 2 }, studentsById, itemsById)

  assert.equal(
    result.leftovers.find((leftover) => leftover.item_id === 101)?.craft_material_ok,
    true,
  )
})

test('uses leftover SSR medium gifts for top priority only when enabled', () => {
  const plans = [plan(1, 1, 120, 'top_priority')]
  const studentsById = { 1: student(1) }
  const itemsById = { 101: item(101, 'SSR medium', 'SSR') }

  const disabled = optimizeAllocation(plans, { 101: 1 }, studentsById, itemsById)
  const enabled = optimizeAllocation(
    plans,
    { 101: 1 },
    studentsById,
    itemsById,
    0,
    0,
    0,
    true,
    true,
  )

  assert.equal(disabled.results[0].allocated_exp, 0)
  assert.equal(disabled.leftovers[0].item_id, 101)
  assert.equal(enabled.results[0].allocated_exp, 120)
  assert.equal(enabled.results[0].remaining_exp, 0)
  assert.equal(enabled.results[0].allocated_items[0].effect, 'medium')
  assert.equal(enabled.results[0].allocated_items[0].exp_per_item, 120)
  assert.equal(enabled.leftovers.length, 0)
})

test('repairs greedy overshoot with an exact bounded subset', () => {
  const plans = [plan(1, 1, 120)]
  const studentsById = { 1: student(1, ['a', 'b', 'c']) }
  const itemsById = {
    101: item(101, 'Extra large', 'SR', ['a', 'b', 'c']),
    102: item(102, 'Large', 'SR', ['a', 'b']),
  }

  const result = optimizeAllocation(plans, { 101: 1, 102: 2 }, studentsById, itemsById)

  assert.equal(result.results[0].allocated_exp, 120)
  assert.deepEqual(
    result.results[0].allocated_items.map((allocation) => [allocation.item_id, allocation.count]),
    [[102, 2]],
  )
  assert.equal(result.leftovers.find((leftover) => leftover.item_id === 101)?.quantity, 1)
})

test('compares gift value when both candidates have no alternatives', () => {
  const result = optimizeAllocation(
    [plan(1, 1, 300), plan(2, 2, 240)], { 101: 1 },
    { 1: student(1, ['a']), 2: student(2, ['a', 'b']) },
    { 101: item(101, 'SSR', 'SSR', ['a', 'b']) },
  )
  assert.equal(result.results.find((row) => row.student_id === 1)?.allocated_exp, 0)
  assert.equal(result.results.find((row) => row.student_id === 2)?.allocated_exp, 240)
})

test('reallocates stock released by overshoot repair to semi priority', () => {
  const result = optimizeAllocation(
    [plan(1, 1, 120, 'top_priority'), plan(2, 2, 40, 'semi_priority')],
    { 101: 1, 102: 2 },
    { 1: student(1, ['a', 'b', 'c']), 2: student(2, ['c']) },
    { 101: item(101, 'X', 'SR', ['a', 'b', 'c']), 102: item(102, 'Y', 'SR', ['a', 'b']) },
  )
  assert.ok(result.results.every((row) => row.remaining_exp === 0))
  assert.equal(result.results.find((row) => row.student_id === 2)?.allocated_items[0].item_id, 101)
  assert.deepEqual(result.leftovers, [])
})

test('reserves equally effective gifts for semi priority without reducing primary fulfillment', () => {
  for (const primaryPriority of ['top_priority', 'priority']) {
    for (const names of [['A shared', 'Z exclusive'], ['Z shared', 'A exclusive']]) {
      const result = optimizeAllocation(
        [plan(1, 1, 40, primaryPriority), plan(2, 2, 40, 'semi_priority')],
        { 101: 1, 102: 1 },
        { 1: student(1, ['a', 'b']), 2: student(2, ['a']) },
        { 101: item(101, names[0], 'SR', ['a']), 102: item(102, names[1], 'SR', ['b']) },
      )
      assert.ok(result.results.every((row) => row.remaining_exp === 0))
      assert.equal(result.results.find((row) => row.student_id === 2)?.allocated_items[0].item_id, 101)
      assert.deepEqual(result.leftovers, [])
    }
  }
})

test('reallocates usable stock released by equivalent class rebalancing', () => {
  const result = optimizeAllocation(
    [plan(1, 1, 80, 'top_priority'), plan(2, 2, 40, 'top_priority'), plan(3, 3, 80, 'semi_priority')],
    { 101: 2, 102: 1, 104: 2 },
    { 1: student(1, ['a', 'b']), 2: student(2, ['a']), 3: student(3, ['b']) },
    { 101: item(101, '101', 'SR', ['a']), 102: item(102, '102', 'SR', ['b']), 104: item(104, '104', 'SR', ['a']) },
  )
  assert.ok(result.results.filter((row) => row.priority === 'top_priority').every((row) => row.remaining_exp === 0))
  const semi = result.results.find((row) => row.student_id === 3)!
  assert.equal(semi.allocated_exp, 40)
  assert.equal(semi.remaining_exp, 40)
  assert.equal(semi.allocated_items[0].item_id, 102)
  assert.equal(result.leftovers.some((row) => row.item_id === 102), false)
})

test('keeps contested gifts for primary students and excludes disabled semi priority', () => {
  for (const includeSemi of [true, false]) {
    const result = optimizeAllocation(
      [plan(1, 1, 40, 'top_priority'), plan(2, 2, 40, 'semi_priority')],
      { 101: 1, 102: 1 },
      { 1: student(1, ['a']), 2: student(2, ['a', 'b']) },
      { 101: item(101, 'Shared', 'SR', ['a']), 102: item(102, 'Semi only', 'SR', ['b']) },
      0, 0, 0, includeSemi,
    )
    assert.equal(result.results.find((row) => row.student_id === 1)?.allocated_exp, 40)
    assert.equal(result.results.find((row) => row.student_id === 2)?.allocated_exp, includeSemi ? 40 : 0)
    assert.equal(result.leftovers.reduce((sum, row) => sum + row.quantity, 0), includeSemi ? 0 : 1)
  }
})

test('craftable boxes require one advanced Taylor stone and two leftover orange gifts', () => {
  const items = {
    101: item(101, 'Orange'),
    102: item(102, 'Purple', 'SSR'),
    103: { ...item(103, 'Bouquet'), gift_kind: 'bouquet', exp_value: 60 },
    [SELECTABLE_BOX_ITEM_ID]: { ...item(SELECTABLE_BOX_ITEM_ID, 'Box'), gift_kind: 'gift_box' },
  }
  for (const [orange, stones, expected] of [[7, 2, 2], [5, 9, 2], [6, 3, 3], [1, 8, 0], [0, 8, 0], [8, 0, 0]]) {
    const inventory = { 101: orange, 102: 10, 103: 10, [SELECTABLE_BOX_ITEM_ID]: 10 }
    const result = optimizeAllocation([], inventory, {}, items, 0, 0, 0, true, false, stones)
    assert.deepEqual(result.craftable_boxes, {
      box_count: expected, source_item_count: orange, taylor_stone_count: stones,
    })
    assert.equal(inventory[101], orange)
    assert.equal(result.leftovers.find((row) => row.item_id === 101)?.quantity ?? 0, orange)
  }
  const withoutStones = optimizeAllocation([], { 101: 8 }, {}, items)
  assert.equal(withoutStones.craftable_boxes.box_count, 0)
})

test('crafting counts only gifts left after allocation', () => {
  const result = optimizeAllocation(
    [plan(1, 1, 40)], { 101: 5 }, { 1: student(1, ['a']) },
    { 101: item(101, 'Orange', 'SR', ['a']) }, 0, 0, 0, true, false, 10,
  )
  assert.equal(result.results[0].allocated_items[0].count, 1)
  assert.deepEqual(result.craftable_boxes, {
    box_count: 2, source_item_count: 4, taylor_stone_count: 10,
  })
})

test('calculates birthday days even with zero daily EXP', () => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const birthday = `${tomorrow.getMonth() + 1}/${tomorrow.getDate()}`
  const result = optimizeAllocation([plan(1, 1, 40)], {}, { 1: { ...student(1), birthday } }, {})
  assert.equal(result.results[0].days_until_birthday, 1)
  assert.equal(result.results[0].passive_exp, 0)
})

test('does not count one student surplus toward another student completion', () => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const birthday = `${tomorrow.getMonth() + 1}/${tomorrow.getDate()}`
  const result = optimizeAllocation(
    [plan(1, 1, 15), plan(2, 2, 15)], {},
    { 1: { ...student(1), birthday }, 2: student(2) }, {}, 2, 2,
  )
  assert.equal(result.summary.completion_rate, 0.5)
  assert.equal(result.results.find((row) => row.student_id === 2)?.remaining_exp, 15)
})

test('required EXP and level projection agree at every target boundary', () => {
  for (let current = 1; current < 100; current += 1) {
    for (let target = current + 1; target <= 100; target += 1) {
      const required = calcRequiredExp(current, 0, target)
      assert.deepEqual(projectLevelAfterGain(current, 0, required), [target, 0])
      assert.ok(projectLevelAfterGain(current, 0, required - 1)[0] < target)
    }
  }
})

test('preserves stock and EXP across varied preferences, priorities and options', () => {
  let seed = 20260906
  const random = (limit: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % limit
  }
  for (let sample = 0; sample < 1000; sample += 1) {
    const students: Record<number, StudentRecord> = {}
    const items: Record<number, ItemRecord> = {}
    const inventory: Record<number, number> = {}
    const plans: PlanRecord[] = []
    for (let id = 1; id <= 4; id += 1) {
      students[id] = student(id, ['a', 'b', 'c'].filter(() => random(2)))
      plans.push(plan(id, id, random(400) + 1, PRIORITY_SCORE_ORDER[random(3)]))
    }
    for (let id = 101; id <= 105; id += 1) {
      items[id] = item(id, String(id), random(2) ? 'SR' : 'SSR', ['a', 'b', 'c'].filter(() => random(2)))
      inventory[id] = random(5)
    }
    const before = JSON.stringify({ students, items, inventory, plans })
    const includeSemi = Boolean(random(2))
    const result = optimizeAllocation(plans, inventory, students, items, 0, 0, 0, includeSemi, Boolean(random(2)))
    const used: Record<number, number> = {}
    for (const row of result.results) {
      let total = 0
      for (const allocation of row.allocated_items) {
        assert.ok(Number.isInteger(allocation.count) && allocation.count > 0)
        assert.equal(allocation.exp_per_item, calculateGiftExp(students[row.student_id], items[allocation.item_id], items)[1])
        assert.equal(allocation.total_exp, allocation.exp_per_item * allocation.count)
        total += allocation.total_exp
        used[allocation.item_id] = (used[allocation.item_id] || 0) + allocation.count
      }
      assert.equal(row.allocated_exp, total)
      assert.equal(row.remaining_exp, Math.max(0, row.required_exp - total))
      if (!includeSemi && row.priority === 'semi_priority') assert.equal(total, 0)
    }
    for (const [id, count] of Object.entries(inventory)) {
      assert.equal((used[Number(id)] || 0) + (result.leftovers.find((row) => row.item_id === Number(id))?.quantity || 0), count)
    }
    assert.equal(JSON.stringify({ students, items, inventory, plans }), before)
  }
})

test('completes the student closest to the goal instead of spreading a scarce gift', () => {
  const plans = [plan(1, 1, 240, 'top_priority'), plan(3, 3, 40, 'top_priority')]
  const studentsById = { 1: student(1, ['b']), 3: student(3, ['b']) }
  const itemsById = { 102: item(102, 'Medium', 'SR', ['b']) }
  const result = optimizeAllocation(plans, { 102: 1 }, studentsById, itemsById)
  assert.equal(result.results.find((row) => row.student_id === 3)?.remaining_exp, 0)
  assert.equal(result.results.find((row) => row.student_id === 1)?.allocated_exp, 0)
})

test('concentrates gifts so that one more student completes', () => {
  const plans = [plan(2, 2, 120), plan(4, 4, 160)]
  const studentsById = { 2: student(2, ['b']), 4: student(4, ['b']) }
  const itemsById = { 101: item(101, 'B1', 'SR', ['b']), 103: item(103, 'B2', 'SR', ['b']) }
  const inventory = { 101: 1, 103: 3 }
  const result = optimizeAllocation(plans, inventory, studentsById, itemsById)
  assert.deepEqual(
    fulfillmentScore(result.results),
    exactFulfillmentScore(plans, inventory, studentsById, itemsById),
  )
  assert.equal(result.results.filter((row) => row.remaining_exp === 0).length, 1)
})

test('swaps gifts across students to remove top priority waste', () => {
  const plans = [plan(2, 2, 120, 'top_priority'), plan(4, 4, 240, 'semi_priority')]
  const studentsById = { 2: student(2, ['b']), 4: student(4, ['b']) }
  const itemsById = { 101: item(101, 'SSR', 'SSR', ['b']), 103: item(103, 'SR', 'SR', ['b']) }
  const inventory = { 101: 1, 103: 3 }
  const result = optimizeAllocation(plans, inventory, studentsById, itemsById)
  const top = result.results.find((row) => row.student_id === 2)!
  assert.equal(top.allocated_exp, 120)
  assert.deepEqual(top.allocated_items.map((row) => [row.item_id, row.count]), [[103, 3]])
  assert.equal(result.results.find((row) => row.student_id === 4)?.allocated_exp, 180)
})

test('matches the exhaustive optimum on small random cases', () => {
  let seed = 20261009
  const random = (limit: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % limit
  }
  for (let sample = 0; sample < 400; sample += 1) {
    const studentsById: Record<number, StudentRecord> = {}
    const itemsById: Record<number, ItemRecord> = {}
    const inventory: Record<number, number> = {}
    const plans: PlanRecord[] = []
    const studentCount = 2 + random(3)
    const itemCount = 2 + random(3)
    for (let id = 1; id <= studentCount; id += 1) {
      studentsById[id] = student(id, ['a', 'b', 'c'].filter(() => random(2)))
      plans.push(plan(id, id, (1 + random(12)) * 20, PRIORITY_SCORE_ORDER[random(3)]))
    }
    let units = 0
    for (let id = 101; id < 101 + itemCount; id += 1) {
      itemsById[id] = item(id, String(id), random(3) ? 'SR' : 'SSR', ['a', 'b', 'c'].filter(() => random(2)))
      inventory[id] = Math.min(random(4), 7 - units)
      units += inventory[id]
    }
    const result = optimizeAllocation(plans, inventory, studentsById, itemsById)
    assert.deepEqual(
      fulfillmentScore(result.results),
      exactFulfillmentScore(plans, inventory, studentsById, itemsById),
      JSON.stringify({ plans: plans.map((row) => [row.student_id, row.priority, row.required_exp]), inventory }),
    )
  }
})

test('repairs overshoot with gifts whose EXP is not a multiple of 20', () => {
  const result = optimizeAllocation(
    [plan(1, 1, 65)],
    { 101: 1, 102: 2 },
    { 1: student(1, ['a']) },
    {
      101: { ...item(101, 'Bouquet'), gift_kind: 'bouquet', exp_value: 25 },
      102: item(102, 'Medium', 'SR', ['a']),
    },
  )
  assert.equal(result.results[0].allocated_exp, 65)
  assert.deepEqual(
    result.results[0].allocated_items.map((allocation) => [allocation.item_id, allocation.count]).sort(),
    [[101, 1], [102, 1]],
  )
})
