import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { URL } from 'node:url'

import { DATA_DIR, DEFAULT_PORT, FRONTEND_DIST_DIR, BASE_DIR, PRIORITY_LABELS } from './config.ts'
import { Database } from './database.ts'
import {
  cacheIcons,
  ensureBootstrapData,
  updateMasterDataWithIcons,
} from './masterData.ts'
import {
  EFFECT_ORDER,
  getGiftEffect,
  isSearchVisibleMatch,
  optimizeAllocation,
  sortMatchingItems,
} from './optimizer.ts'
import { TaskStore } from './tasks.ts'
import type {
  ItemRecord,
  PlanRecord,
  SearchResultRecord,
  SlimItemRecord,
  StudentRecord,
} from './types.ts'

const TABLE_EFFECTS = ['extra_large', 'large', 'medium'] as const
const API_PREFIX = '/api'
const ASSET_PREFIX = '/assets/'

const database = new Database()
const tasks = new TaskStore()

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  setCorsHeaders(response)
  response.end(JSON.stringify(payload))
}

function sendText(response: ServerResponse, statusCode: number, payload: string): void {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'text/plain; charset=utf-8')
  response.end(payload)
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw.trim()) {
    return {} as T
  }
  return JSON.parse(raw) as T
}

function slimItem(item: {
  id: number
  name: string
  rarity: string
  icon_path: string
  effect: string
  effect_label: string
  gained_exp: number
  quantity: number
  gift_kind: string
}): SlimItemRecord {
  return {
    id: item.id,
    name: item.name,
    rarity: item.rarity,
    icon_path: item.icon_path,
    effect: item.effect,
    effect_label: item.effect_label,
    gained_exp: item.gained_exp,
    quantity: item.quantity,
    gift_kind: item.gift_kind,
  }
}

function runGiftSearch(giftIds: number[]): SearchResultRecord[] {
  const allStudents = database.searchStudents('', '', false, 'name')
  const allItemsRaw = database.listItems()
  const itemsById = Object.fromEntries(allItemsRaw.map((item) => [item.id, item])) as Record<
    number,
    ItemRecord
  >
  const selectedItems = giftIds.map((giftId) => itemsById[giftId]).filter(Boolean)

  const results = allStudents.flatMap((student) => {
    const grouped: SearchResultRecord['effects'] = {
      extra_large: [],
      large: [],
      medium: [],
    }

    for (const item of selectedItems) {
      const effect = getGiftEffect(student, item)
      if (TABLE_EFFECTS.includes(effect as (typeof TABLE_EFFECTS)[number]) && isSearchVisibleMatch(item, effect)) {
        grouped[effect as keyof typeof grouped].push(
          slimItem({
            ...item,
            effect,
            effect_label:
              effect === 'extra_large' ? '特大' : effect === 'large' ? '大' : '中',
            gained_exp: 0,
            quantity: item.quantity,
          }),
        )
      }
    }

    if (!grouped.extra_large.length && !grouped.large.length && !grouped.medium.length) {
      return []
    }

    return [{
      student_id: student.id,
      student_name: student.name,
      icon_path: student.icon_path,
      effects: grouped,
    }]
  })

  results.sort((left, right) => {
    const bestLeft = Math.max(
      ...Object.entries(left.effects)
        .filter(([, items]) => items.length)
        .map(([effect]) => EFFECT_ORDER[effect] || 0),
      0,
    )
    const bestRight = Math.max(
      ...Object.entries(right.effects)
        .filter(([, items]) => items.length)
        .map(([effect]) => EFFECT_ORDER[effect] || 0),
      0,
    )
    if (bestRight !== bestLeft) {
      return bestRight - bestLeft
    }
    if (right.effects.extra_large.length !== left.effects.extra_large.length) {
      return right.effects.extra_large.length - left.effects.extra_large.length
    }
    if (right.effects.large.length !== left.effects.large.length) {
      return right.effects.large.length - left.effects.large.length
    }
    if (right.effects.medium.length !== left.effects.medium.length) {
      return right.effects.medium.length - left.effects.medium.length
    }
    return left.student_name.localeCompare(right.student_name, 'ja')
  })

  return results
}

function runStudentSearch(studentIds: number[]): SearchResultRecord[] {
  const allStudents = Object.fromEntries(
    database.searchStudents('', '', false, 'name').map((student) => [student.id, student]),
  ) as Record<number, StudentRecord>
  const allItems = database.listItems()
  const inventory = database.getInventoryMap()

  return studentIds.flatMap((studentId) => {
    const student = allStudents[studentId]
    if (!student) {
      return []
    }
    const grouped: SearchResultRecord['effects'] = {
      extra_large: [],
      large: [],
      medium: [],
    }
    for (const item of sortMatchingItems(student, allItems, inventory, true)) {
      const effect = String(item.effect || '')
      if (TABLE_EFFECTS.includes(effect as (typeof TABLE_EFFECTS)[number])) {
        grouped[effect as keyof typeof grouped].push(slimItem(item))
      }
    }
    if (!grouped.extra_large.length && !grouped.large.length && !grouped.medium.length) {
      return []
    }
    return [{
      student_id: student.id,
      student_name: student.name,
      icon_path: student.icon_path,
      effects: grouped,
    }]
  })
}

function listPlansWithLabels(): Array<PlanRecord & { priority_label: string }> {
  return database.listPlans().map((plan) => ({
    ...plan,
    priority_label: PRIORITY_LABELS[plan.priority] || plan.priority,
  }))
}

function contentTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase()
  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    case '.ico':
      return 'image/x-icon'
    default:
      return 'application/octet-stream'
  }
}

async function serveFile(response: ServerResponse, filePath: string): Promise<void> {
  const stat = await fsp.stat(filePath)
  response.statusCode = 200
  response.setHeader('Content-Type', contentTypeFor(filePath))
  response.setHeader('Content-Length', String(stat.size))
  setCorsHeaders(response)
  fs.createReadStream(filePath).pipe(response)
}

function resolveSafePath(rootDir: string, relativePath: string): string | null {
  const sanitized = relativePath.replace(/^[/\\]+/, '')
  const resolved = path.resolve(rootDir, sanitized)
  const rootResolved = path.resolve(rootDir)
  if (!resolved.startsWith(rootResolved)) {
    return null
  }
  return resolved
}

async function handleAssetRequest(url: URL, response: ServerResponse): Promise<boolean> {
  if (!url.pathname.startsWith(ASSET_PREFIX)) {
    return false
  }
  const relativePath = decodeURIComponent(url.pathname.slice(ASSET_PREFIX.length))
  // data/ 配下は DATA_DIR から配信する (KIZUNA_DATA_DIR でデータ領域が
  // リポジトリ外に移動していても画像等を解決できるようにするため)
  const dataMatch = relativePath.match(/^data[/\\](.+)$/)
  const filePath = dataMatch
    ? resolveSafePath(DATA_DIR, dataMatch[1])
    : resolveSafePath(BASE_DIR, relativePath)
  if (!filePath) {
    sendJson(response, 403, { error: 'Forbidden' })
    return true
  }
  try {
    await serveFile(response, filePath)
  } catch {
    sendJson(response, 404, { error: 'Not found' })
  }
  return true
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (!url.pathname.startsWith(API_PREFIX)) {
    return false
  }
  setCorsHeaders(response)
  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return true
  }

  const { pathname, searchParams } = url
  const method = request.method || 'GET'

  if (pathname === '/api/health' && method === 'GET') {
    sendJson(response, 200, { ok: true })
    return true
  }

  if (pathname === '/api/master/status' && method === 'GET') {
    sendJson(response, 200, {
      counts: database.getMasterCounts(),
      source: database.getMeta('master_source') || 'unknown',
      refreshed_at: database.getMeta('master_refreshed_at') || '',
    })
    return true
  }

  if (pathname === '/api/master/update' && method === 'POST') {
    try {
      const task = tasks.start('master_update', async ({ update }) => {
        return updateMasterDataWithIcons(database, 30, (message, current, total) => {
          update({ message, current, total })
        })
      })
      sendJson(response, 202, { task_id: task.id })
    } catch (error) {
      sendJson(response, 409, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return true
  }

  if (pathname === '/api/master/icons' && method === 'POST') {
    try {
      const task = tasks.start('icon_download', async ({ update }) => {
        return cacheIcons(database, 30, (message, current, total) => {
          update({ message, current, total })
        })
      })
      sendJson(response, 202, { task_id: task.id })
    } catch (error) {
      sendJson(response, 409, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return true
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/)
  if (taskMatch && method === 'GET') {
    const task = tasks.get(taskMatch[1])
    if (!task) {
      sendJson(response, 404, { error: 'Task not found' })
      return true
    }
    sendJson(response, 200, task)
    return true
  }

  if (pathname === '/api/students' && method === 'GET') {
    sendJson(
      response,
      200,
      database.searchStudents(
        searchParams.get('query') || '',
        searchParams.get('school') || '',
        false,
        searchParams.get('sort_by') || 'name',
      ),
    )
    return true
  }

  if (pathname === '/api/schools' && method === 'GET') {
    sendJson(response, 200, database.listSchools())
    return true
  }

  const studentMatch = pathname.match(/^\/api\/students\/(\d+)$/)
  if (studentMatch && method === 'GET') {
    sendJson(response, 200, database.getStudent(Number(studentMatch[1])))
    return true
  }

  const userStudentMatch = pathname.match(/^\/api\/user-students\/(\d+)$/)
  if (userStudentMatch && method === 'PUT') {
    const body = await readJsonBody<{
      current_bond_level: number
      current_bond_exp: number
      notes?: string
    }>(request)
    database.upsertUserStudent(
      Number(userStudentMatch[1]),
      Number(body.current_bond_level || 1),
      Number(body.current_bond_exp || 0),
      String(body.notes || ''),
    )
    sendJson(response, 200, { ok: true })
    return true
  }
  if (userStudentMatch && method === 'DELETE') {
    database.deleteUserStudent(Number(userStudentMatch[1]))
    sendJson(response, 200, { ok: true })
    return true
  }

  if (pathname === '/api/items' && method === 'GET') {
    sendJson(response, 200, database.listItems(searchParams.get('query') || ''))
    return true
  }

  if (pathname === '/api/inventory' && method === 'GET') {
    sendJson(response, 200, database.getInventoryMap())
    return true
  }

  const inventoryMatch = pathname.match(/^\/api\/inventory\/(-?\d+)$/)
  if (inventoryMatch && method === 'PUT') {
    const body = await readJsonBody<{ quantity: number }>(request)
    database.setInventoryQuantity(Number(inventoryMatch[1]), Number(body.quantity || 0))
    sendJson(response, 200, { ok: true })
    return true
  }

  if (pathname === '/api/boxes' && method === 'GET') {
    sendJson(response, 200, database.listBoxes())
    return true
  }

  const boxMatch = pathname.match(/^\/api\/boxes\/([^/]+)$/)
  if (boxMatch && method === 'PUT') {
    const body = await readJsonBody<{ quantity: number }>(request)
    database.setBoxQuantity(boxMatch[1], Number(body.quantity || 0))
    sendJson(response, 200, { ok: true })
    return true
  }

  if (pathname === '/api/search/gifts' && method === 'POST') {
    const body = await readJsonBody<{ gift_ids: number[] }>(request)
    sendJson(response, 200, runGiftSearch(Array.isArray(body.gift_ids) ? body.gift_ids : []))
    return true
  }

  if (pathname === '/api/search/students' && method === 'POST') {
    const body = await readJsonBody<{ student_ids: number[] }>(request)
    sendJson(
      response,
      200,
      runStudentSearch(Array.isArray(body.student_ids) ? body.student_ids : []),
    )
    return true
  }

  if (pathname === '/api/plans' && method === 'GET') {
    sendJson(response, 200, listPlansWithLabels())
    return true
  }

  if (pathname === '/api/plans' && method === 'PUT') {
    const body = await readJsonBody<{
      student_id: number
      target_bond_level: number
      priority: string
      notes?: string
      plan_id?: number | null
    }>(request)
    const requestedPlanId = body.plan_id == null ? null : Number(body.plan_id)
    const normalizedPlanId =
      requestedPlanId !== null && Number.isFinite(requestedPlanId) && requestedPlanId > 0
        ? requestedPlanId
        : null
    const planId = database.savePlan(
      Number(body.student_id),
      Number(body.target_bond_level),
      String(body.priority || 'priority'),
      String(body.notes || ''),
      normalizedPlanId,
    )
    sendJson(response, 200, { ok: true, plan_id: planId })
    return true
  }

  const planMatch = pathname.match(/^\/api\/plans\/(\d+)$/)
  if (planMatch && method === 'DELETE') {
    database.deletePlan(Number(planMatch[1]))
    sendJson(response, 200, { ok: true })
    return true
  }

  if (pathname === '/api/optimize' && method === 'POST') {
    const body = await readJsonBody<{
      daily_cafe_taps?: number
      daily_top_priority_cafe_taps?: number
      daily_other_cafe_taps?: number
      daily_schedules?: number
      include_semi_priority?: boolean
      use_leftover_ssr_for_top?: boolean
    }>(request)
    const legacyCafeTaps = Number(body.daily_cafe_taps || 0)
    const dailyTopPriorityCafeTaps =
      body.daily_top_priority_cafe_taps === undefined
        ? legacyCafeTaps
        : Number(body.daily_top_priority_cafe_taps || 0)
    const dailyOtherCafeTaps =
      body.daily_other_cafe_taps === undefined
        ? legacyCafeTaps
        : Number(body.daily_other_cafe_taps || 0)
    const [plans, inventory, students, items] = database.snapshotForOptimizer()
    sendJson(
      response,
      200,
      optimizeAllocation(
        plans,
        inventory,
        students,
        items,
        dailyTopPriorityCafeTaps,
        dailyOtherCafeTaps,
        Number(body.daily_schedules || 0),
        body.include_semi_priority !== false,
        body.use_leftover_ssr_for_top === true,
      ),
    )
    return true
  }

  const UI_SETTING_KEYS = new Set([
    'ui.optimize.daily_top_priority_cafe_taps',
    'ui.optimize.daily_other_cafe_taps',
    'ui.optimize.daily_schedules',
    'ui.optimize.use_leftover_ssr',
  ])

  if (pathname === '/api/ui-settings' && method === 'GET') {
    const settings: Record<string, string> = {}
    for (const key of UI_SETTING_KEYS) {
      const value = database.getMeta(key)
      if (value !== null) {
        settings[key] = value
      }
    }
    sendJson(response, 200, settings)
    return true
  }

  const uiSettingMatch = pathname.match(/^\/api\/ui-settings\/([a-z0-9._-]+)$/)
  if (uiSettingMatch && method === 'PUT') {
    const key = uiSettingMatch[1]
    if (!UI_SETTING_KEYS.has(key)) {
      sendJson(response, 400, { error: 'Unknown setting key' })
      return true
    }
    const body = await readJsonBody<{ value: string }>(request)
    database.setMeta(key, String(body.value ?? ''))
    sendJson(response, 200, { ok: true })
    return true
  }

  sendJson(response, 404, { error: 'Not found' })
  return true
}

async function handleFrontendRequest(url: URL, response: ServerResponse): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') {
    return false
  }
  const relativePath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '')
  const resolved = resolveSafePath(FRONTEND_DIST_DIR, relativePath)
  if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    await serveFile(response, resolved)
    return true
  }

  const indexPath = path.join(FRONTEND_DIST_DIR, 'index.html')
  if (fs.existsSync(indexPath)) {
    await serveFile(response, indexPath)
    return true
  }

  sendText(response, 500, 'frontend/dist/index.html not found. Run `npm run build` first.')
  return true
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)

  if (await handleApiRequest(request, response, url)) {
    return
  }
  if (await handleAssetRequest(url, response)) {
    return
  }
  if (await handleFrontendRequest(url, response)) {
    return
  }

  sendJson(response, 404, { error: 'Not found' })
}

async function start(): Promise<void> {
  database.initialize()
  await ensureBootstrapData(database)

  const server = http.createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      })
    })
  })

  server.listen(DEFAULT_PORT, '127.0.0.1', () => {
    console.log(`Backend server listening on http://127.0.0.1:${DEFAULT_PORT}`)
  })

  const shutdown = () => {
    server.close(() => {
      database.close()
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

await start()
