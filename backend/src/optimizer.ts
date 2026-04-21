import { calcRequiredExp, projectLevelAfterGain } from './bondCalculator.ts'
import {
  PRIORITY_ORDER,
  SELECTABLE_BOX_ITEM_ID,
  SELECTABLE_BOX_KEY,
  SELECTABLE_BOX_NAME,
} from './config.ts'
import type {
  AllocationRecord,
  ItemRecord,
  OptimizeResultRecord,
  OptimizeStudentResult,
  PlanRecord,
  StudentRecord,
} from './types.ts'

export const EFFECT_ORDER: Record<string, number> = {
  extra_large: 4,
  large: 3,
  medium: 2,
  small: 1,
  bouquet: 2,
}

export const EFFECT_LABELS: Record<string, string> = {
  extra_large: '特大',
  large: '大',
  medium: '中',
  small: '小',
  bouquet: '花束',
}
const GIFT_EXP_VALUES: Record<string, Record<string, number>> = {
  SR: {
    small: 20,
    medium: 40,
    large: 60,
    extra_large: 80,
  },
  SSR: {
    medium: 120,
    large: 180,
    extra_large: 240,
  },
}

const CAFE_TAP_BOND_EXP = 15
const SCHEDULE_BOND_EXP = 25
const SCHEDULE_BONUS_CHANCE = 0.25
const SCHEDULE_BONUS_EXP = 25
const BIRTHDAY_PATTERN = /(\d{1,2})\D+(\d{1,2})/

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean)
  }
  if (typeof value === 'string') {
    try {
      const loaded = JSON.parse(value) as unknown
      if (Array.isArray(loaded)) {
        return loaded.map((item) => String(item)).filter(Boolean)
      }
    } catch {
      return value ? [value] : []
    }
  }
  return []
}

function isBouquet(item: Partial<ItemRecord>): boolean {
  return String(item.gift_kind || '').toLowerCase() === 'bouquet'
}

function isSelectableBox(item: Partial<ItemRecord>): boolean {
  return Number(item.id || 0) === SELECTABLE_BOX_ITEM_ID ||
    String(item.box_type || '').toLowerCase() === SELECTABLE_BOX_KEY ||
    String(item.gift_kind || '').toLowerCase() === 'gift_box' ||
    String(item.name || '') === SELECTABLE_BOX_NAME
}

function giftRarity(item: Partial<ItemRecord>): string {
  return String(item.rarity || '').toUpperCase()
}

function studentBirthday(student: Partial<StudentRecord>): string {
  if (student.birthday) {
    return String(student.birthday)
  }
  const rawJson = student.raw_json
  if (rawJson && typeof rawJson === 'object') {
    const record = rawJson as Record<string, unknown>
    return String(record.Birthday || record.BirthDay || '')
  }
  return ''
}

function parseBirthday(value: unknown): [number, number] | null {
  const text = String(value || '').trim()
  if (!text) {
    return null
  }
  if (/^\d{4}$/.test(text)) {
    const month = Number(text.slice(0, 2))
    const day = Number(text.slice(2))
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return [month, day]
    }
  }
  const matched = text.match(BIRTHDAY_PATTERN)
  if (!matched) {
    return null
  }
  const month = Number(matched[1])
  const day = Number(matched[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  return [month, day]
}

function daysUntilNextBirthday(student: Partial<StudentRecord>, today = new Date()): number {
  const parsed = parseBirthday(studentBirthday(student))
  if (!parsed) {
    return 0
  }
  const [month, day] = parsed
  const year = today.getFullYear()
  let candidate = new Date(year, month - 1, day)
  if (Number.isNaN(candidate.getTime())) {
    return 0
  }
  if (candidate < new Date(year, today.getMonth(), today.getDate())) {
    candidate = new Date(year + 1, month - 1, day)
  }
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.max(0, Math.round((candidate.getTime() - start.getTime()) / 86400000))
}

function plannedPassiveExp(
  student: Partial<StudentRecord>,
  dailyCafeTaps: number,
  dailySchedules: number,
  today = new Date(),
): [number, number] {
  const cafeExp = Math.max(0, dailyCafeTaps) * CAFE_TAP_BOND_EXP
  const scheduleCount = Math.max(0, dailySchedules)
  const scheduleExp = scheduleCount * (SCHEDULE_BOND_EXP + (SCHEDULE_BONUS_CHANCE * SCHEDULE_BONUS_EXP))
  const totalExp = cafeExp + scheduleExp
  if (totalExp <= 0) {
    return [0, 0]
  }
  const days = daysUntilNextBirthday(student, today)
  return [Math.round(totalExp * days), days]
}

function isUniversalFavoriteGift(item: Partial<ItemRecord>): boolean {
  return giftRarity(item) === 'SSR' && !isBouquet(item) && Number(item.exp_value || 0) === 20
}

function bouquetFixedExp(item: Partial<ItemRecord>): number {
  const baseExp = Math.max(0, Number(item.exp_value || 0))
  if (baseExp === 20) {
    return 180
  }
  return baseExp
}

export function getMatchDisplayGroup(item: Partial<ItemRecord>): string {
  if (isBouquet(item)) {
    return 'bouquet'
  }
  const rarity = giftRarity(item)
  if (rarity === 'SSR') {
    return 'ssr'
  }
  if (rarity === 'SR') {
    return 'sr'
  }
  return 'default'
}

export function isSearchVisibleMatch(item: Partial<ItemRecord>, effect: string): boolean {
  if (isBouquet(item)) {
    return false
  }
  const rarity = giftRarity(item)
  if (rarity === 'SSR') {
    return effect === 'large' || effect === 'extra_large'
  }
  if (rarity === 'SR') {
    return effect === 'medium' || effect === 'large' || effect === 'extra_large'
  }
  return false
}

function isOptimizationVisibleMatch(item: Partial<ItemRecord>, effect: string): boolean {
  if (isBouquet(item)) {
    return true
  }
  const rarity = giftRarity(item)
  if (rarity === 'SSR') {
    return effect === 'large' || effect === 'extra_large'
  }
  if (rarity === 'SR') {
    return effect === 'medium' || effect === 'large' || effect === 'extra_large'
  }
  return false
}

function matchedPreferenceCount(student: Partial<StudentRecord>, item: Partial<ItemRecord>): number {
  const studentTags = new Set(asStringArray(student.favor_item_tags))
  const studentUnique = new Set(asStringArray(student.favor_item_unique_tags))
  const itemTags = new Set(asStringArray(item.tags))
  let count = 0
  for (const tag of itemTags) {
    if (studentTags.has(tag) || studentUnique.has(tag)) {
      count += 1
    }
  }
  return count
}

function baseGiftEffect(student: Partial<StudentRecord>, item: Partial<ItemRecord>): string {
  if (isBouquet(item)) {
    return 'bouquet'
  }
  if (isUniversalFavoriteGift(item)) {
    return 'large'
  }

  const rarity = giftRarity(item)
  const matchedCount = matchedPreferenceCount(student, item)
  if (rarity === 'SSR') {
    if (matchedCount >= 2) {
      return 'extra_large'
    }
    if (matchedCount === 1) {
      return 'large'
    }
    return 'medium'
  }
  if (matchedCount >= 3) {
    return 'extra_large'
  }
  if (matchedCount === 2) {
    return 'large'
  }
  if (matchedCount === 1) {
    return 'medium'
  }
  return 'small'
}

function baseGiftExp(student: Partial<StudentRecord>, item: Partial<ItemRecord>): [string, number] {
  const effect = baseGiftEffect(student, item)
  if (effect === 'bouquet') {
    return [effect, bouquetFixedExp(item)]
  }
  const rarity = giftRarity(item)
  const fixedExp = GIFT_EXP_VALUES[rarity]?.[effect]
  if (fixedExp !== undefined) {
    return [effect, fixedExp]
  }
  return [effect, Math.max(0, Number(item.exp_value || 0))]
}

function bestSelectableBoxExp(
  student: Partial<StudentRecord>,
  itemsById?: Record<number, ItemRecord>,
): [string, number] {
  if (!itemsById) {
    return ['large', GIFT_EXP_VALUES.SR.large]
  }
  let bestEffect = 'small'
  let bestExp = GIFT_EXP_VALUES.SR.small
  let bestKey: [number, number, string] = [EFFECT_ORDER[bestEffect], bestExp, '']

  for (const candidate of Object.values(itemsById)) {
    if (isBouquet(candidate) || isSelectableBox(candidate) || giftRarity(candidate) !== 'SR') {
      continue
    }
    const [effect, gainedExp] = baseGiftExp(student, candidate)
    const key: [number, number, string] = [
      EFFECT_ORDER[effect] || 0,
      gainedExp,
      String(candidate.name || ''),
    ]
    if (key[0] > bestKey[0] ||
      (key[0] === bestKey[0] && key[1] > bestKey[1]) ||
      (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] > bestKey[2])) {
      bestKey = key
      bestEffect = effect
      bestExp = gainedExp
    }
  }

  return [bestEffect, bestExp]
}

export function getGiftEffect(
  student: Partial<StudentRecord>,
  item: Partial<ItemRecord>,
  itemsById?: Record<number, ItemRecord>,
): string {
  if (isSelectableBox(item)) {
    return bestSelectableBoxExp(student, itemsById)[0]
  }
  return baseGiftEffect(student, item)
}

export function calculateGiftExp(
  student: Partial<StudentRecord>,
  item: Partial<ItemRecord>,
  itemsById?: Record<number, ItemRecord>,
): [string, number] {
  if (isSelectableBox(item)) {
    return bestSelectableBoxExp(student, itemsById)
  }
  return baseGiftExp(student, item)
}

export function sortMatchingItems(
  student: StudentRecord,
  items: ItemRecord[],
  inventory: Record<number, number>,
  visibleOnly = false,
): Array<ItemRecord & {
  effect: string
  effect_label: string
  gained_exp: number
  display_group: string
}> {
  const ranked = items.flatMap((item) => {
    const [effect, gainedExp] = calculateGiftExp(student, item)
    if (visibleOnly && !isSearchVisibleMatch(item, effect)) {
      return []
    }
    return [{
      ...item,
      effect,
      effect_label: EFFECT_LABELS[effect],
      gained_exp: gainedExp,
      quantity: Number(inventory[item.id] || 0),
      display_group: getMatchDisplayGroup(item),
    }]
  })

  ranked.sort((left, right) => {
    const effectDiff = (EFFECT_ORDER[right.effect] || 0) - (EFFECT_ORDER[left.effect] || 0)
    if (effectDiff !== 0) {
      return effectDiff
    }
    const expDiff = right.gained_exp - left.gained_exp
    if (expDiff !== 0) {
      return expDiff
    }
    const quantityDiff = right.quantity - left.quantity
    if (quantityDiff !== 0) {
      return quantityDiff
    }
    return left.name.localeCompare(right.name, 'ja')
  })

  return ranked
}

function buildPlanState(
  plan: PlanRecord,
  student: StudentRecord | undefined,
  dailyCafeTaps = 0,
  dailySchedules = 0,
  today = new Date(),
): OptimizeStudentResult {
  let passiveExp = 0
  let daysUntilBirthday = 0
  if (student) {
    ;[passiveExp, daysUntilBirthday] = plannedPassiveExp(
      student,
      dailyCafeTaps,
      dailySchedules,
      today,
    )
  }
  const requiredExp = Number(plan.required_exp || 0)
  return {
    id: plan.id,
    student_id: plan.student_id,
    student_name: plan.student_name,
    birthday: student ? studentBirthday(student) : '',
    days_until_birthday: daysUntilBirthday,
    priority: plan.priority,
    notes: plan.notes,
    current_bond_level: plan.current_bond_level,
    current_bond_exp: plan.current_bond_exp,
    target_bond_level: plan.target_bond_level,
    required_exp: plan.required_exp,
    progress: plan.progress,
    passive_exp: passiveExp,
    remaining_exp: Math.max(0, requiredExp - passiveExp),
    allocated_exp: 0,
    allocated_items: [],
    predicted_level: plan.current_bond_level,
    predicted_level_exp: plan.current_bond_exp,
  }
}

function prioritySortKey(plan: OptimizeStudentResult): [number, number, string] {
  return [
    -(PRIORITY_ORDER[String(plan.priority || 'priority')] || 0),
    -Number(plan.remaining_exp || 0),
    String(plan.student_name || ''),
  ]
}

type ItemEvaluation = {
  effect: string
  effect_label: string
  gained_exp: number
  visible: boolean
}

type EvaluationCache = Record<number, Record<number, ItemEvaluation>>

type CompatibilityStat = {
  compatible_count: number
  priority_weight: number
}

type CompatibilityStats = Record<number, CompatibilityStat>

function canAllocateItemToPlan(
  planState: Partial<OptimizeStudentResult>,
  item: Partial<ItemRecord>,
): boolean {
  if (isSelectableBox(item)) {
    return String(planState.priority || 'priority') === 'top_priority' &&
      Number(planState.target_bond_level || 0) === 100
  }
  return true
}

function buildEvaluationCache(
  states: OptimizeStudentResult[],
  studentsById: Record<number, StudentRecord>,
  itemsById: Record<number, ItemRecord>,
): EvaluationCache {
  const cache: EvaluationCache = {}
  for (const state of states) {
    const student = studentsById[state.student_id]
    if (!student || cache[state.student_id]) {
      continue
    }
    const evaluations: Record<number, ItemEvaluation> = {}
    for (const [itemIdText, item] of Object.entries(itemsById)) {
      const itemId = Number(itemIdText)
      const [effect, gainedExp] = calculateGiftExp(student, item, itemsById)
      evaluations[itemId] = {
        effect,
        effect_label: EFFECT_LABELS[effect],
        gained_exp: gainedExp,
        visible: isOptimizationVisibleMatch(item, effect),
      }
    }
    cache[state.student_id] = evaluations
  }
  return cache
}

function buildCompatibilityStats(
  states: OptimizeStudentResult[],
  stock: Record<number, number>,
  evaluations: EvaluationCache,
  itemsById: Record<number, ItemRecord>,
): CompatibilityStats {
  const stats: CompatibilityStats = {}
  for (const [itemIdText, quantityValue] of Object.entries(stock)) {
    const itemId = Number(itemIdText)
    const quantity = Number(quantityValue)
    if (quantity <= 0) {
      continue
    }
    let compatibleCount = 0
    let priorityWeight = 0
    const item = itemsById[itemId]
    for (const state of states) {
      if (Number(state.remaining_exp || 0) <= 0) {
        continue
      }
      if (item && !canAllocateItemToPlan(state, item)) {
        continue
      }
      const evaluation = evaluations[state.student_id]?.[itemId]
      if (!evaluation?.visible) {
        continue
      }
      compatibleCount += 1
      priorityWeight += PRIORITY_ORDER[String(state.priority || 'priority')] || 0
    }
    stats[itemId] = {
      compatible_count: compatibleCount,
      priority_weight: priorityWeight,
    }
  }
  return stats
}

function itemFlexibilityPenalty(
  item: Partial<ItemRecord>,
  compatibility: CompatibilityStat | undefined,
  reserveMode = false,
): number {
  if (isSelectableBox(item)) {
    return 0
  }
  const compatibleCount = compatibility?.compatible_count ?? 0
  const priorityWeight = compatibility?.priority_weight ?? 0
  let penalty = reserveMode
    ? (compatibleCount * 6) + (priorityWeight * 2)
    : (compatibleCount * 2) + priorityWeight
  if (isBouquet(item)) {
    penalty += reserveMode ? 6 : 2
  }
  return penalty
}

function strategicItemValue(
  usefulExp: number,
  item: Partial<ItemRecord>,
  compatibility: CompatibilityStat | undefined,
  priorityRank: number,
  reserveMode = false,
): number {
  let value = usefulExp - itemFlexibilityPenalty(item, compatibility, reserveMode)
  if (isSelectableBox(item) && !reserveMode) {
    value += priorityRank * 20
  }
  return value
}

function bestAlternativeMetrics(
  planState: OptimizeStudentResult,
  stock: Record<number, number>,
  itemsById: Record<number, ItemRecord>,
  evaluations: EvaluationCache,
  compatibilityStats: CompatibilityStats,
  excludedItemId: number,
): {
  best_value: number
  option_count: number
} {
  const remainingExp = Number(planState.remaining_exp || 0)
  const studentEvaluations = evaluations[planState.student_id] || {}
  let bestValue = Number.NEGATIVE_INFINITY
  let optionCount = 0

  for (const [itemIdText, quantityValue] of Object.entries(stock)) {
    const itemId = Number(itemIdText)
    const quantity = Number(quantityValue)
    if (quantity <= 0 || itemId === excludedItemId) {
      continue
    }
    const evaluation = studentEvaluations[itemId]
    const item = itemsById[itemId]
    if (!evaluation?.visible || !item || !canAllocateItemToPlan(planState, item)) {
      continue
    }
    optionCount += 1
    const usefulExp = Math.min(evaluation.gained_exp, remainingExp)
    const candidateValue = strategicItemValue(
      usefulExp,
      item,
      compatibilityStats[itemId],
      0,
      true,
    )
    if (candidateValue > bestValue) {
      bestValue = candidateValue
    }
  }

  return {
    best_value: bestValue,
    option_count: optionCount,
  }
}

function appendAllocation(
  planState: OptimizeStudentResult,
  item: ItemRecord & { effect: string; effect_label: string; gained_exp: number },
): void {
  const existing = planState.allocated_items.find(
    (allocation) => allocation.item_id === item.id && allocation.effect === item.effect,
  )
  if (existing) {
    existing.count += 1
    existing.total_exp += item.gained_exp
    return
  }
  const allocation: AllocationRecord = {
    item_id: item.id,
    item_name: item.name,
    icon_path: item.icon_path,
    rarity: item.rarity,
    gift_kind: item.gift_kind,
    count: 1,
    effect: item.effect,
    effect_label: item.effect_label,
    exp_per_item: item.gained_exp,
    total_exp: item.gained_exp,
  }
  planState.allocated_items.push(allocation)
}

function buildCandidate(
  planState: OptimizeStudentResult,
  itemId: number,
  stock: Record<number, number>,
  itemsById: Record<number, ItemRecord>,
  strategy: string,
  evaluations: EvaluationCache,
  compatibilityStats: CompatibilityStats,
): {
  plan_state: OptimizeStudentResult
  item: ItemRecord & { effect: string; effect_label: string; gained_exp: number }
  score: number[]
} | null {
  const item = itemsById[itemId]
  const evaluation = evaluations[planState.student_id]?.[itemId]
  if (!item || !evaluation?.visible || !canAllocateItemToPlan(planState, item)) {
    return null
  }
  const remainingExp = Number(planState.remaining_exp || 0)
  if (remainingExp <= 0) {
    return null
  }
  const usefulExp = Math.min(evaluation.gained_exp, remainingExp)
  const waste = Math.max(0, evaluation.gained_exp - remainingExp)
  const priorityRank = PRIORITY_ORDER[String(planState.priority || 'priority')] || 0
  const requiredExp = Math.max(1, Number(planState.required_exp || 0))
  const completionRatio = Number(planState.allocated_exp || 0) / requiredExp
  const compatibility = compatibilityStats[itemId]
  const compatibilityCount = compatibility?.compatible_count ?? 0
  const candidateValue = strategicItemValue(usefulExp, item, compatibility, priorityRank)
  const alternative = bestAlternativeMetrics(
    planState,
    stock,
    itemsById,
    evaluations,
    compatibilityStats,
    itemId,
  )
  const regret = alternative.option_count > 0
    ? candidateValue - alternative.best_value
    : Number.POSITIVE_INFINITY

  const score = strategy === 'focus'
    ? [
        candidateValue,
        regret,
        -alternative.option_count,
        usefulExp,
        -waste,
        -compatibilityCount,
        EFFECT_ORDER[evaluation.effect] || 0,
      ]
    : strategy === 'balanced'
      ? [
          regret,
          candidateValue,
          -alternative.option_count,
          usefulExp,
          -completionRatio,
          priorityRank,
          -waste,
          -compatibilityCount,
          EFFECT_ORDER[evaluation.effect] || 0,
        ]
      : [
          regret,
          priorityRank,
          candidateValue,
          -alternative.option_count,
          usefulExp,
          -waste,
          -compatibilityCount,
          EFFECT_ORDER[evaluation.effect] || 0,
          -completionRatio,
        ]

  return {
    plan_state: planState,
    item: {
      ...item,
      effect: evaluation.effect,
      effect_label: evaluation.effect_label,
      gained_exp: evaluation.gained_exp,
    },
    score,
  }
}

function pickBestItem(
  planState: OptimizeStudentResult,
  stock: Record<number, number>,
  itemsById: Record<number, ItemRecord>,
  evaluations: EvaluationCache,
  compatibilityStats: CompatibilityStats,
): [number, ItemRecord & { effect: string; effect_label: string; gained_exp: number }] | null {
  let best:
    | [number, ItemRecord & { effect: string; effect_label: string; gained_exp: number }]
    | null = null
  let bestScore: number[] | null = null

  for (const [itemIdText, quantityValue] of Object.entries(stock)) {
    const itemId = Number(itemIdText)
    const quantity = Number(quantityValue)
    if (quantity <= 0) {
      continue
    }
    const candidate = buildCandidate(
      planState,
      itemId,
      stock,
      itemsById,
      'focus',
      evaluations,
      compatibilityStats,
    )
    if (!candidate) {
      continue
    }
    if (!bestScore || compareScores(candidate.score, bestScore) > 0) {
      bestScore = candidate.score
      best = [itemId, candidate.item]
    }
  }

  return best
}

function allocateToPlan(
  planState: OptimizeStudentResult,
  stock: Record<number, number>,
  itemsById: Record<number, ItemRecord>,
  evaluations: EvaluationCache,
  compatibilityStats: CompatibilityStats,
): boolean {
  const best = pickBestItem(
    planState,
    stock,
    itemsById,
    evaluations,
    compatibilityStats,
  )
  if (!best) {
    return false
  }
  const [itemId, item] = best
  stock[itemId] -= 1
  planState.allocated_exp += item.gained_exp
  planState.remaining_exp = Math.max(0, Number(planState.remaining_exp || 0) - item.gained_exp)
  appendAllocation(planState, item)
  return true
}

function compareScores(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0)
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

function pickBestCandidateForItem(
  itemId: number,
  states: OptimizeStudentResult[],
  stock: Record<number, number>,
  itemsById: Record<number, ItemRecord>,
  strategy: string,
  evaluations: EvaluationCache,
  compatibilityStats: CompatibilityStats,
): {
  plan_state: OptimizeStudentResult
  item: ItemRecord & { effect: string; effect_label: string; gained_exp: number }
  score: number[]
} | null {
  const item = itemsById[itemId]
  if (!item) {
    return null
  }
  let bestCandidate:
    | {
        plan_state: OptimizeStudentResult
        item: ItemRecord & { effect: string; effect_label: string; gained_exp: number }
        score: number[]
      }
    | null = null
  let bestScore: number[] | null = null

  for (const state of states) {
    if (Number(state.remaining_exp || 0) <= 0) {
      continue
    }
    const candidate = buildCandidate(
      state,
      itemId,
      stock,
      itemsById,
      strategy,
      evaluations,
      compatibilityStats,
    )
    if (!candidate) {
      continue
    }
    if (!bestScore || compareScores(candidate.score, bestScore) > 0) {
      bestCandidate = candidate
      bestScore = candidate.score
    }
  }

  return bestCandidate
}

function pickNextGlobalCandidate(
  states: OptimizeStudentResult[],
  stock: Record<number, number>,
  itemsById: Record<number, ItemRecord>,
  strategy: string,
  evaluations: EvaluationCache,
  compatibilityStats: CompatibilityStats,
): {
  plan_state: OptimizeStudentResult
  item: ItemRecord & { effect: string; effect_label: string; gained_exp: number }
  score: number[]
} | null {
  let bestCandidate:
    | {
        plan_state: OptimizeStudentResult
        item: ItemRecord & { effect: string; effect_label: string; gained_exp: number }
        score: number[]
      }
    | null = null
  let bestScore: number[] | null = null

  for (const [itemIdText, quantity] of Object.entries(stock)) {
    if (Number(quantity) <= 0) {
      continue
    }
    const candidate = pickBestCandidateForItem(
      Number(itemIdText),
      states,
      stock,
      itemsById,
      strategy,
      evaluations,
      compatibilityStats,
    )
    if (!candidate) {
      continue
    }
    if (!bestScore || compareScores(candidate.score, bestScore) > 0) {
      bestCandidate = candidate
      bestScore = candidate.score
    }
  }

  return bestCandidate
}
function applyCandidate(
  candidate: {
    plan_state: OptimizeStudentResult
    item: ItemRecord & { effect: string; effect_label: string; gained_exp: number }
  },
  stock: Record<number, number>,
): void {
  const planState = candidate.plan_state
  const item = candidate.item
  stock[item.id] -= 1
  planState.allocated_exp += item.gained_exp
  planState.remaining_exp = Math.max(0, Number(planState.remaining_exp || 0) - item.gained_exp)
  appendAllocation(planState, item)
}

function allocateStateGroup(
  states: OptimizeStudentResult[],
  stock: Record<number, number>,
  itemsById: Record<number, ItemRecord>,
  strategy: string,
  evaluations: EvaluationCache,
): void {
  if (!states.length) {
    return
  }

  if (strategy === 'focus') {
    const orderedStates = [...states].sort((left, right) => {
      const priorityDiff =
        (PRIORITY_ORDER[String(right.priority || 'priority')] || 0) -
        (PRIORITY_ORDER[String(left.priority || 'priority')] || 0)
      if (priorityDiff !== 0) {
        return priorityDiff
      }
      return left.student_name.localeCompare(right.student_name, 'ja')
    })

    for (const state of orderedStates) {
      while (state.remaining_exp > 0) {
        const compatibilityStats = buildCompatibilityStats(states, stock, evaluations, itemsById)
        if (!allocateToPlan(state, stock, itemsById, evaluations, compatibilityStats)) {
          break
        }
      }
    }
    return
  }

  while (true) {
    const compatibilityStats = buildCompatibilityStats(states, stock, evaluations, itemsById)
    const candidate = pickNextGlobalCandidate(
      states,
      stock,
      itemsById,
      strategy,
      evaluations,
      compatibilityStats,
    )
    if (!candidate) {
      break
    }
    applyCandidate(candidate, stock)
  }
}

function craftableSelectableBoxCount(
  leftoverRows: OptimizeResultRecord['leftovers'],
): [number, number] {
  let orangeItemTotal = 0
  for (const item of leftoverRows) {
    if (item.item_id === SELECTABLE_BOX_ITEM_ID || item.gift_kind === 'bouquet') {
      continue
    }
    if (String(item.rarity || '').toUpperCase() !== 'SR') {
      continue
    }
    if (String(item.gift_kind || 'gift').toLowerCase() !== 'gift') {
      continue
    }
    orangeItemTotal += Math.max(0, Number(item.quantity || 0))
  }
  return [Math.floor(orangeItemTotal / 2), orangeItemTotal]
}

function leftoverSortKey(itemId: number, item: Partial<ItemRecord>): [number, string] {
  let groupRank = 4
  if (giftRarity(item) === 'SSR' && !isBouquet(item)) {
    groupRank = 0
  } else if (giftRarity(item) === 'SR' && !isBouquet(item) && !isSelectableBox(item)) {
    groupRank = 1
  } else if (isBouquet(item)) {
    groupRank = 2
  } else if (isSelectableBox(item)) {
    groupRank = 3
  }
  return [groupRank, String(item.name || `Item ${itemId}`)]
}

export function optimizeAllocation(
  plans: PlanRecord[],
  inventory: Record<number, number>,
  studentsById: Record<number, StudentRecord>,
  itemsById: Record<number, ItemRecord>,
  strategy = 'priority',
  dailyCafeTaps = 0,
  dailySchedules = 0,
): OptimizeResultRecord {
  const stock = Object.fromEntries(
    Object.entries(inventory)
      .map(([itemId, quantity]) => [Number(itemId), Number(quantity)])
      .filter(([, quantity]) => quantity > 0),
  ) as Record<number, number>
  const today = new Date()
  const states = plans
    .filter((plan) => Number(plan.required_exp || 0) > 0)
    .map((plan) =>
      buildPlanState(
        plan,
        studentsById[plan.student_id],
        dailyCafeTaps,
        dailySchedules,
        today,
      ),
    )
    .sort((left, right) => {
      const leftKey = prioritySortKey(left)
      const rightKey = prioritySortKey(right)
      for (let index = 0; index < leftKey.length; index += 1) {
        const leftValue = leftKey[index]
        const rightValue = rightKey[index]
        if (typeof leftValue === 'number' && typeof rightValue === 'number') {
          if (leftValue !== rightValue) {
            return leftValue - rightValue
          }
        } else if (String(leftValue) !== String(rightValue)) {
          return String(leftValue).localeCompare(String(rightValue), 'ja')
        }
      }
      return 0
    })

  const evaluations = buildEvaluationCache(states, studentsById, itemsById)
  const primaryStates = states.filter((state) => {
    const priority = String(state.priority || 'priority')
    return priority === 'top_priority' || priority === 'priority'
  })
  const semiPriorityStates = states.filter(
    (state) => String(state.priority || 'priority') === 'semi_priority',
  )

  allocateStateGroup(primaryStates, stock, itemsById, strategy, evaluations)
  allocateStateGroup(semiPriorityStates, stock, itemsById, strategy, evaluations)
  let totalRequired = 0
  let totalAllocated = 0
  let totalPassive = 0

  const results = states.map((state) => {
    const currentLevel = Number(state.current_bond_level || 1)
    const currentExp = Number(state.current_bond_exp || 0)
    const passiveExp = Number(state.passive_exp || 0)
    const [predictedLevel, predictedExp] = projectLevelAfterGain(
      currentLevel,
      currentExp,
      Number(state.allocated_exp || 0) + passiveExp,
    )
    totalRequired += Number(state.required_exp || 0)
    totalAllocated += Number(state.allocated_exp || 0)
    totalPassive += passiveExp
    return {
      ...state,
      predicted_level: predictedLevel,
      predicted_level_exp: predictedExp,
    }
  })

  const leftovers = Object.entries(stock)
    .filter(([, quantity]) => Number(quantity) > 0)
    .sort((left, right) => {
      const leftKey = leftoverSortKey(Number(left[0]), itemsById[Number(left[0])] || {})
      const rightKey = leftoverSortKey(Number(right[0]), itemsById[Number(right[0])] || {})
      if (leftKey[0] !== rightKey[0]) {
        return leftKey[0] - rightKey[0]
      }
      return leftKey[1].localeCompare(rightKey[1], 'ja')
    })
    .map(([itemIdText, quantity]) => {
      const itemId = Number(itemIdText)
      const item = itemsById[itemId] || ({} as ItemRecord)
      return {
        item_id: itemId,
        item_name: String(item.name || `Item ${itemId}`),
        icon_path: String(item.icon_path || ''),
        rarity: String(item.rarity || ''),
        gift_kind: String(item.gift_kind || 'gift'),
        quantity: Number(quantity),
      }
    })

  const [boxCount, sourceItemCount] = craftableSelectableBoxCount(leftovers)

  return {
    strategy,
    results,
    summary: {
      total_required_exp: totalRequired,
      total_allocated_exp: totalAllocated,
      total_passive_exp: totalPassive,
      completion_rate:
        totalRequired === 0
          ? 0
          : Math.min(1, (totalAllocated + totalPassive) / totalRequired),
    },
    leftovers,
    craftable_boxes: {
      box_count: boxCount,
      source_item_count: sourceItemCount,
    },
  }
}

export function buildPlanRecords(rawPlans: PlanRecord[]): PlanRecord[] {
  return rawPlans.map((plan) => ({
    ...plan,
    required_exp: calcRequiredExp(
      Number(plan.current_bond_level || 1),
      Number(plan.current_bond_exp || 0),
      Number(plan.target_bond_level || 1),
    ),
  }))
}








