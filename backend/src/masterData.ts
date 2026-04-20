import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { BOND_EXP_TABLE, cumulativeExpToLevel } from './bondCalculator.ts'
import {
  CACHE_DIR,
  CACHE_META_PATH,
  ITEM_IMAGE_DIR,
  MASTER_FALLBACK_BASE_URL,
  MASTER_LANG,
  MASTER_PRIMARY_BASE_URL,
  MASTER_RESOURCES,
  MASTER_RESOURCE_LABELS,
  MASTER_SOURCE_LABELS,
  STUDENT_IMAGE_DIR,
  isHiddenItem,
  normalizeSchoolName,
} from './config.ts'
import type { Database } from './database.ts'

export type ProgressCallback = (message: string, current: number, total: number) => void

type CacheMeta = {
  fetched_at?: string
  source?: string
  resources?: Record<string, string>
  urls?: Record<string, string>
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.mkdir(STUDENT_IMAGE_DIR, { recursive: true })
  await fs.mkdir(ITEM_IMAGE_DIR, { recursive: true })
}

async function loadJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T
}

async function saveJson(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8')
}

async function loadCacheMeta(): Promise<CacheMeta> {
  try {
    return await loadJson<CacheMeta>(CACHE_META_PATH)
  } catch {
    return {}
  }
}

async function saveCacheMeta(payload: CacheMeta): Promise<void> {
  await saveJson(CACHE_META_PATH, payload)
}

function utcNowIso(): string {
  return new Date().toISOString()
}

function emitProgress(
  progressCallback: ProgressCallback | undefined,
  message: string,
  current: number,
  total: number,
): void {
  if (!progressCallback) {
    return
  }
  const safeTotal = Math.max(1, total)
  const safeCurrent = Math.max(0, Math.min(current, safeTotal))
  progressCallback(message, safeCurrent, safeTotal)
}

function masterUrlCandidates(resource: string): Array<{ source: string; url: string }> {
  return [
    {
      source: MASTER_SOURCE_LABELS.web,
      url: `${MASTER_PRIMARY_BASE_URL}/data/${MASTER_LANG}/${resource}.min.json`,
    },
    {
      source: MASTER_SOURCE_LABELS.github,
      url: `${MASTER_FALLBACK_BASE_URL}/data/${MASTER_LANG}/${resource}.min.json`,
    },
  ]
}

function iterRecords(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter(
      (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
    )
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (Array.isArray(record.data)) {
      return record.data.filter(
        (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
      )
    }
    const values = Object.values(record)
    if (values.length && values.every((row) => typeof row === 'object' && row !== null)) {
      return values as Array<Record<string, unknown>>
    }
  }
  return []
}

function normalizeStudent(record: Record<string, unknown>): Record<string, unknown> | null {
  const studentId = record.Id ?? record.id
  const name = record.Name ?? record.name
  if (!studentId || !name) {
    return null
  }

  const normalizedId = Number(studentId)
  return {
    id: normalizedId,
    name: String(name),
    school: normalizeSchoolName(String(record.School ?? record.school ?? '')),
    icon_path: String(record.icon_path ?? path.join(STUDENT_IMAGE_DIR, `${normalizedId}.webp`)),
    favor_item_tags: Array.isArray(record.FavorItemTags ?? record.favor_item_tags)
      ? [...((record.FavorItemTags ?? record.favor_item_tags) as unknown[])]
      : [],
    favor_item_unique_tags: Array.isArray(
      record.FavorItemUniqueTags ?? record.favor_item_unique_tags,
    )
      ? [...((record.FavorItemUniqueTags ?? record.favor_item_unique_tags) as unknown[])]
      : [],
    raw_json: record,
  }
}

function normalizeItem(record: Record<string, unknown>): Record<string, unknown> | null {
  const itemId = record.Id ?? record.id
  const name = record.Name ?? record.name
  if (!itemId || !name) {
    return null
  }

  let giftKind = String(record.gift_kind ?? '').toLowerCase()
  if (!giftKind) {
    const rarity = String(record.Rarity ?? record.rarity ?? '').toLowerCase()
    const category = String(record.Category ?? record.category ?? '').toLowerCase()
    giftKind = rarity === 'bouquet' || category === 'bouquet' ? 'bouquet' : 'gift'
  }

  const iconName = String(record.Icon ?? record.icon_name ?? '')
  const iconPath = String(
    record.icon_path ?? (iconName ? path.join(ITEM_IMAGE_DIR, `${iconName}.webp`) : ''),
  )

  return {
    id: Number(itemId),
    name: String(name),
    tags: Array.isArray(record.Tags ?? record.tags)
      ? [...((record.Tags ?? record.tags) as unknown[])]
      : [],
    rarity: String(record.Rarity ?? record.rarity ?? ''),
    category: String(record.Category ?? record.category ?? ''),
    exp_value: Number(record.ExpValue ?? record.exp_value ?? 0),
    gift_kind: giftKind,
    icon_name: iconName,
    icon_path: iconPath,
    raw_json: record,
  }
}

function extractStudents(rawPayload: unknown): Array<Record<string, unknown>> {
  return iterRecords(rawPayload)
    .map((record) => normalizeStudent(record))
    .filter((record): record is Record<string, unknown> => Boolean(record))
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'ja'))
}

function extractItems(rawPayload: unknown): Array<Record<string, unknown>> {
  return iterRecords(rawPayload)
    .map((record) => normalizeItem(record))
    .filter((record): record is Record<string, unknown> => Boolean(record))
    .filter((record) => !isHiddenItem(String(record.name || ''), String(record.icon_name || '')))
    .filter((record) => {
      const giftKind = String(record.gift_kind || '').toLowerCase()
      const category = String(record.category || '')
      return category === 'Favor' || giftKind === 'bouquet'
    })
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'ja'))
}

async function fetchRemoteJson(url: string, timeout = 30): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout * 1000)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BlueArchiveBondManager/0.1 (+https://schaledb.com)',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function downloadMasterData(
  timeout = 30,
  progressCallback?: ProgressCallback,
  progressTotal?: number,
): Promise<Record<string, unknown>> {
  await ensureDirs()

  const payloads: Record<string, unknown> = {}
  const resolvedSources: Record<string, string> = {}
  const resolvedUrls: Record<string, string> = {}
  const totalSteps = progressTotal ?? MASTER_RESOURCES.length

  for (let index = 0; index < MASTER_RESOURCES.length; index += 1) {
    const name = MASTER_RESOURCES[index]
    const label = MASTER_RESOURCE_LABELS[name] || name
    emitProgress(progressCallback, `${label}を取得しています...`, index, totalSteps)

    let lastError: Error | null = null
    for (const candidate of masterUrlCandidates(name)) {
      try {
        const payload = await fetchRemoteJson(candidate.url, timeout)
        payloads[name] = payload
        resolvedSources[name] = candidate.source
        resolvedUrls[name] = candidate.url
        await saveJson(path.join(CACHE_DIR, `${name}.json`), payload)
        emitProgress(progressCallback, `${label}を取得しました。`, index + 1, totalSteps)
        lastError = null
        break
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }

    if (lastError) {
      throw lastError
    }
  }

  const sources = Object.values(resolvedSources)
  let primarySource: string = MASTER_SOURCE_LABELS.cache
  if (sources.length) {
    if (sources.every((source) => source === MASTER_SOURCE_LABELS.web)) {
      primarySource = MASTER_SOURCE_LABELS.web
    } else if (sources.some((source) => source === MASTER_SOURCE_LABELS.web)) {
      primarySource = `${MASTER_SOURCE_LABELS.web}_mixed`
    } else {
      primarySource = MASTER_SOURCE_LABELS.github
    }
  }

  await saveCacheMeta({
    fetched_at: utcNowIso(),
    source: primarySource,
    resources: resolvedSources,
    urls: resolvedUrls,
  })

  return payloads
}

export async function syncCacheToDatabase(database: Database): Promise<string> {
  const students = extractStudents(await loadJson(path.join(CACHE_DIR, 'students.json')))
  const items = extractItems(await loadJson(path.join(CACHE_DIR, 'items.json')))
  const cacheMeta = await loadCacheMeta()
  const source = String(cacheMeta.source || MASTER_SOURCE_LABELS.cache)
  database.replaceMasterData(students, items, source)
  if (cacheMeta.fetched_at) {
    database.setMeta('master_refreshed_at', String(cacheMeta.fetched_at))
  }
  return source
}

export async function ensureBootstrapData(database: Database): Promise<string> {
  await ensureDirs()

  database.seedBondExpTable(
    Object.entries(BOND_EXP_TABLE).map(([level, expRequired]) => ({
      level: Number(level),
      exp_required: Number(expRequired),
      cumulative_exp: cumulativeExpToLevel(Number(level)),
    })),
  )

  if (database.hasMasterData()) {
    return database.getMeta('master_source') || 'database'
  }

  return syncCacheToDatabase(database)
}

function studentIconUrl(studentId: number): string {
  return `${MASTER_PRIMARY_BASE_URL}/images/student/icon/${studentId}.webp`
}

function itemIconUrl(iconName: string): string {
  return `${MASTER_PRIMARY_BASE_URL}/images/item/icon/${iconName}.webp`
}

async function cacheBinary(url: string, targetPath: string, timeout = 30): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout * 1000)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BlueArchiveBondManager/0.1 (+https://schaledb.com)',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, buffer)
  } finally {
    clearTimeout(timer)
  }
}

function buildIconJobs(
  database: Database,
  force = false,
): Array<{ kind: 'student' | 'item'; name: string; url: string; path: string }> {
  const jobs: Array<{ kind: 'student' | 'item'; name: string; url: string; path: string }> = []

  for (const student of database.searchStudents()) {
    const iconPath = String(student.icon_path || '')
    if (!iconPath) {
      continue
    }
    if (!force && fsSync.existsSync(iconPath)) {
      continue
    }
    jobs.push({
      kind: 'student',
      name: student.name,
      url: studentIconUrl(student.id),
      path: iconPath,
    })
  }

  for (const item of database.listItems()) {
    const iconName = String(item.icon_name || '')
    const iconPath = String(item.icon_path || '')
    if (!iconName || !iconPath) {
      continue
    }
    if (!force && fsSync.existsSync(iconPath)) {
      continue
    }
    jobs.push({
      kind: 'item',
      name: item.name,
      url: itemIconUrl(iconName),
      path: iconPath,
    })
  }

  return jobs
}

export async function cacheIcons(
  database: Database,
  timeout = 30,
  progressCallback?: ProgressCallback,
  force = false,
  progressStart = 0,
  progressTotal?: number,
  jobs?: Array<{ kind: 'student' | 'item'; name: string; url: string; path: string }>,
): Promise<Record<string, number>> {
  await ensureDirs()

  let downloadedStudents = 0
  let downloadedItems = 0
  let failed = 0
  let skipped = 0

  const iconJobs = jobs ?? buildIconJobs(database, force)
  const totalJobs = iconJobs.length
  const effectiveTotal = progressTotal ?? (progressStart + Math.max(1, totalJobs))

  emitProgress(progressCallback, 'アイコン一覧を確認しています...', progressStart, effectiveTotal)

  for (let index = 0; index < iconJobs.length; index += 1) {
    const job = iconJobs[index]
    const message = `${job.name} の画像を取得しています...`

    if (!force && fsSync.existsSync(job.path)) {
      skipped += 1
      emitProgress(progressCallback, message, progressStart + index + 1, effectiveTotal)
      continue
    }

    try {
      await cacheBinary(job.url, job.path, timeout)
      if (job.kind === 'student') {
        downloadedStudents += 1
      } else {
        downloadedItems += 1
      }
    } catch {
      failed += 1
    } finally {
      emitProgress(progressCallback, message, progressStart + index + 1, effectiveTotal)
    }
  }

  if (!iconJobs.length) {
    emitProgress(progressCallback, 'ダウンロード対象の画像はありません。', Math.min(progressStart + 1, effectiveTotal), effectiveTotal)
  }

  return {
    students: downloadedStudents,
    items: downloadedItems,
    downloaded: downloadedStudents + downloadedItems,
    failed,
    skipped,
    total: totalJobs,
  }
}

export async function updateMasterData(
  database: Database,
  timeout = 30,
  progressCallback?: ProgressCallback,
): Promise<Record<string, unknown>> {
  const totalSteps = MASTER_RESOURCES.length + 1
  const payloads = await downloadMasterData(timeout, progressCallback, totalSteps)
  emitProgress(progressCallback, '取得したデータをデータベースへ反映しています...', totalSteps - 1, totalSteps)
  const source = await syncCacheToDatabase(database)
  const counts = database.getMasterCounts()
  emitProgress(progressCallback, '最新データの反映が完了しました。', totalSteps, totalSteps)
  return { payloads, source, counts }
}

export async function updateMasterDataWithIcons(
  database: Database,
  timeout = 30,
  progressCallback?: ProgressCallback,
  forceIcons = false,
): Promise<Record<string, unknown>> {
  const masterResult = await updateMasterData(database, timeout, progressCallback)
  const baseSteps = MASTER_RESOURCES.length + 1
  const iconJobs = buildIconJobs(database, forceIcons)
  const totalSteps = baseSteps + Math.max(1, iconJobs.length)

  emitProgress(progressCallback, '画像ダウンロードの準備をしています...', baseSteps, totalSteps)
  const iconResult = await cacheIcons(
    database,
    timeout,
    progressCallback,
    forceIcons,
    baseSteps,
    totalSteps,
    iconJobs,
  )
  emitProgress(progressCallback, '最新データと画像の更新が完了しました。', totalSteps, totalSteps)

  return {
    ...masterResult,
    icons: iconResult,
  }
}
