import assert from 'node:assert/strict'
import test from 'node:test'

import { optimizeAllocation } from './optimizer.ts'
import { OptimizerRunner, type OptimizeArgs } from './optimizerRunner.ts'
import type { ItemRecord, PlanRecord, StudentRecord } from './types.ts'

function heavyArgs(studentCount: number, itemCount: number): OptimizeArgs {
  let seed = 20261009
  const random = (limit: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % limit
  }
  const tags = 'abcdefghij'.split('')
  const priorities = ['top_priority', 'priority', 'semi_priority']
  const plans: PlanRecord[] = []
  const students: Record<number, StudentRecord> = {}
  const items: Record<number, ItemRecord> = {}
  const inventory: Record<number, number> = {}
  for (let id = 1; id <= studentCount; id += 1) {
    students[id] = {
      id, name: `S${id}`, school: '', icon_path: '', birthday: '', favor_item_tags: tags.filter(() => random(3) === 0),
      favor_item_unique_tags: [], raw_json: {}, current_bond_level: 1, current_bond_exp: 0, star_rank: 5, notes: '', is_owned: true,
    }
    plans.push({
      id, student_id: id, student_name: `S${id}`, school: '', current_bond_level: 1, current_bond_exp: 0, target_bond_level: 2,
      priority: priorities[random(3)], notes: '', required_exp: 1000 + random(8000), progress: 0,
    })
  }
  for (let id = 101; id < 101 + itemCount; id += 1) {
    items[id] = {
      id, name: `I${id}`, tags: tags.filter(() => random(3) === 0), rarity: random(4) ? 'SR' : 'SSR', category: 'Favor',
      exp_value: 0, gift_kind: 'gift', icon_name: '', icon_path: '', raw_json: {}, quantity: 0,
    }
    inventory[id] = random(30)
  }
  return [plans, inventory, students, items]
}

test('runs the optimizer in a worker and returns the same result as inline', async (t) => {
  const runner = new OptimizerRunner()
  t.after(() => runner.close())
  const args = heavyArgs(8, 20)
  assert.deepEqual(await runner.run(...args), optimizeAllocation(...args))
  assert.equal(runner.isWorkerActive, true)
})

test('keeps the main thread responsive while optimizing', async (t) => {
  const runner = new OptimizerRunner()
  t.after(() => runner.close())
  await runner.run(...heavyArgs(2, 2))
  assert.equal(runner.isWorkerActive, true)
  const args = heavyArgs(25, 60)

  const inlineStart = performance.now()
  optimizeAllocation(...args)
  const inlineMs = performance.now() - inlineStart

  let ticks = 0
  const timer = setInterval(() => { ticks += 1 }, 5)
  try {
    await runner.run(...args)
  } finally {
    clearInterval(timer)
  }
  // 計算が十分長いときだけ判定する (遅い環境での誤検知を避ける)
  if (inlineMs >= 100) {
    assert.ok(ticks >= 5, `event loop was blocked: ticks=${ticks}, inline=${Math.round(inlineMs)}ms`)
  }
})

test('rejects only the failing job and keeps serving later jobs', async (t) => {
  const runner = new OptimizerRunner()
  t.after(() => runner.close())
  const broken = [null, {}, {}, {}] as unknown as OptimizeArgs
  const args = heavyArgs(3, 4)
  const results = await Promise.allSettled([runner.run(...broken), runner.run(...args)])
  assert.equal(results[0].status, 'rejected')
  assert.equal(results[1].status, 'fulfilled')
  assert.deepEqual(results[1].status === 'fulfilled' ? results[1].value : null, optimizeAllocation(...args))
})

test('falls back to inline execution when the worker cannot start', async (t) => {
  const runner = new OptimizerRunner(new URL('./missing-optimizer-worker.ts', import.meta.url))
  t.after(() => runner.close())
  const args = heavyArgs(3, 4)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.deepEqual(await runner.run(...args), optimizeAllocation(...args))
  }
  assert.equal(runner.isWorkerActive, false)
})

test('rejects queued jobs after close', async () => {
  const runner = new OptimizerRunner()
  await runner.close()
  await assert.rejects(runner.run(...heavyArgs(2, 2)), /closed/)
})
