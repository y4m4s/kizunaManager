import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

import {
  DB_PATH,
  HIDDEN_ITEM_ICON_NAMES,
  HIDDEN_ITEM_NAMES,
  ITEM_IMAGE_DIR,
  RECOVERED_DB_PATH,
  SCHOOL_NAME_MAP,
  SELECTABLE_BOX_ICON_FILE,
  SELECTABLE_BOX_ITEM_ID,
  SELECTABLE_BOX_KEY,
  SELECTABLE_BOX_NAME,
  isHiddenItem,
  normalizeSchoolName,
} from './config.ts'
import {
  calcRequiredExp,
  progressRatio,
} from './bondCalculator.ts'
import type { ItemRecord, PlanRecord, StudentRecord } from './types.ts'

type SqlParams = Record<string, SQLInputValue> | SQLInputValue[] | undefined
type RowRecord = Record<string, unknown>

export class Database {
  private readonly primaryDbPath: string
  readonly dbPath: string
  private readonly db: DatabaseSync

  constructor(dbPath: string = DB_PATH) {
    this.primaryDbPath = path.resolve(dbPath)
    this.dbPath = this.preferredDbPath(this.primaryDbPath)
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
    this.db = this.openConnection(this.dbPath)
  }

  private preferredDbPath(requested: string): string {
    if (path.resolve(requested) !== path.resolve(DB_PATH)) {
      return requested
    }

    const candidates = [
      RECOVERED_DB_PATH,
      ...fs.readdirSync(path.dirname(requested))
        .filter((name: string) => /^bond_manager\.recovered-\d+\.db$/i.test(name))
        .sort()
        .reverse()
        .map((name: string) => path.join(path.dirname(requested), name)),
      requested,
    ]

    for (const candidate of candidates) {
      if (this.isSqliteUsable(candidate)) {
        return candidate
      }
    }

    return requested
  }

  private isSqliteUsable(targetPath: string): boolean {
    if (!fs.existsSync(targetPath)) {
      return false
    }
    try {
      const db = new DatabaseSync(targetPath)
      db.exec('PRAGMA journal_mode = MEMORY;')
      db.prepare('SELECT COUNT(*) AS count FROM sqlite_master').get()
      db.close()
      return true
    } catch {
      return false
    }
  }

  private openConnection(targetPath: string): DatabaseSync {
    const db = new DatabaseSync(targetPath)
    db.exec('PRAGMA journal_mode = MEMORY;')
    db.exec('PRAGMA foreign_keys = ON;')
    return db
  }

  private all<T extends RowRecord = RowRecord>(sql: string, params?: SqlParams): T[] {
    const statement = this.db.prepare(sql)
    if (params === undefined) {
      return statement.all() as T[]
    }
    if (Array.isArray(params)) {
      return statement.all(...params) as T[]
    }
    return statement.all(params) as T[]
  }

  private get<T extends RowRecord = RowRecord>(sql: string, params?: SqlParams): T | undefined {
    const statement = this.db.prepare(sql)
    if (params === undefined) {
      return statement.get() as T | undefined
    }
    if (Array.isArray(params)) {
      return statement.get(...params) as T | undefined
    }
    return statement.get(params) as T | undefined
  }

  private run(sql: string, params?: SqlParams): void {
    const statement = this.db.prepare(sql)
    if (params === undefined) {
      statement.run()
      return
    }
    if (Array.isArray(params)) {
      statement.run(...params)
      return
    }
    statement.run(params)
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN')
    try {
      const result = work()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private json(value: unknown): string {
    return JSON.stringify(value ?? null)
  }

  private loads<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined || value === '') {
      return fallback
    }
    if (typeof value !== 'string') {
      return value as T
    }
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }

  private studentFromRow(row: RowRecord): StudentRecord {
    const rawJson = this.loads<Record<string, unknown>>(row.raw_json, {})
    const birthday = String(rawJson.Birthday || rawJson.BirthDay || '')
    return {
      id: Number(row.id),
      name: String(row.name || ''),
      school: normalizeSchoolName(String(row.school || '')),
      icon_path: String(row.icon_path || ''),
      birthday,
      favor_item_tags: this.loads<string[]>(row.favor_item_tags, []),
      favor_item_unique_tags: this.loads<string[]>(row.favor_item_unique_tags, []),
      raw_json: rawJson,
      current_bond_level: Number(row.current_bond_level || 1),
      current_bond_exp: Number(row.current_bond_exp || 0),
      star_rank: Number(row.star_rank || 5),
      notes: String(row.notes || ''),
      is_owned: Boolean(row.is_owned),
    }
  }

  private itemFromRow(row: RowRecord): ItemRecord {
    return {
      id: Number(row.id),
      name: String(row.name || ''),
      tags: this.loads<string[]>(row.tags, []),
      rarity: String(row.rarity || ''),
      category: String(row.category || ''),
      exp_value: Number(row.exp_value || 0),
      gift_kind: String(row.gift_kind || 'gift'),
      icon_name: String(row.icon_name || ''),
      icon_path: String(row.icon_path || ''),
      raw_json: this.loads<Record<string, unknown>>(row.raw_json, {}),
      quantity: Number(row.quantity || 0),
      box_type: row.box_type ? String(row.box_type) : undefined,
    }
  }

  initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS master_students (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        school TEXT,
        icon_path TEXT,
        favor_item_tags TEXT,
        favor_item_unique_tags TEXT,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS master_items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        tags TEXT,
        rarity TEXT,
        category TEXT,
        exp_value INTEGER,
        gift_kind TEXT DEFAULT 'gift',
        icon_name TEXT,
        icon_path TEXT,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS master_bond_exp (
        level INTEGER PRIMARY KEY,
        exp_required INTEGER NOT NULL,
        cumulative_exp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_students (
        student_id INTEGER PRIMARY KEY REFERENCES master_students(id),
        current_bond_level INTEGER DEFAULT 1,
        current_bond_exp INTEGER DEFAULT 0,
        star_rank INTEGER DEFAULT 5,
        notes TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_inventory (
        item_id INTEGER PRIMARY KEY REFERENCES master_items(id),
        quantity INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_gift_boxes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        box_type TEXT NOT NULL UNIQUE,
        quantity INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES master_students(id),
        target_bond_level INTEGER NOT NULL,
        priority TEXT DEFAULT 'priority',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)
    this.migrateLegacyData()
  }

  private migrateLegacyData(): void {
    this.transaction(() => {
      for (const [englishName, japaneseName] of Object.entries(SCHOOL_NAME_MAP)) {
        this.run('UPDATE master_students SET school = ? WHERE school = ?', [
          japaneseName,
          englishName,
        ])
      }

      this.run('UPDATE user_students SET star_rank = 5 WHERE COALESCE(star_rank, 5) != 5')
      this.run("UPDATE user_plans SET priority = 'priority' WHERE priority = 'high'")
      this.run("UPDATE user_plans SET priority = 'defer' WHERE priority = 'medium'")
      this.run("UPDATE user_plans SET priority = 'done' WHERE priority = 'low'")
      this.run(
        "UPDATE user_plans SET priority = 'priority' WHERE COALESCE(priority, '') NOT IN ('top_priority', 'priority', 'semi_priority', 'defer', 'done')",
      )

      if (HIDDEN_ITEM_NAMES.size || HIDDEN_ITEM_ICON_NAMES.size) {
        const conditions: string[] = []
        const params: string[] = []

        if (HIDDEN_ITEM_NAMES.size) {
          conditions.push(`name IN (${[...HIDDEN_ITEM_NAMES].map(() => '?').join(', ')})`)
          params.push(...[...HIDDEN_ITEM_NAMES].sort())
        }
        if (HIDDEN_ITEM_ICON_NAMES.size) {
          conditions.push(
            `icon_name IN (${[...HIDDEN_ITEM_ICON_NAMES].map(() => '?').join(', ')})`,
          )
          params.push(...[...HIDDEN_ITEM_ICON_NAMES].sort())
        }
        const whereClause = conditions.join(' OR ')
        this.run(
          `DELETE FROM user_inventory WHERE item_id IN (SELECT id FROM master_items WHERE ${whereClause})`,
          params,
        )
        this.run(`DELETE FROM master_items WHERE ${whereClause}`, params)
      }
    })
  }

  close(): void {
    this.db.close()
  }

  setMeta(key: string, value: string): void {
    this.run(
      `
        INSERT INTO app_meta(key, value)
        VALUES(?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      [key, value],
    )
  }

  getMeta(key: string): string | null {
    const row = this.get<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key])
    return row?.value ?? null
  }

  hasMasterData(): boolean {
    const row = this.get<{ count: number }>('SELECT COUNT(*) AS count FROM master_students')
    return Boolean(row && Number(row.count) > 0)
  }

  getMasterCounts(): { students: number; items: number } {
    const students = this.get<{ count: number }>('SELECT COUNT(*) AS count FROM master_students')
    const items = this.get<{ count: number }>('SELECT COUNT(*) AS count FROM master_items')
    return {
      students: Number(students?.count || 0),
      items: Number(items?.count || 0),
    }
  }

  seedBondExpTable(rows: Array<{ level: number; exp_required: number; cumulative_exp: number }>): void {
    this.transaction(() => {
      this.run('DELETE FROM master_bond_exp')
      const statement = this.db.prepare(`
        INSERT INTO master_bond_exp(level, exp_required, cumulative_exp)
        VALUES(?, ?, ?)
      `)
      for (const row of rows) {
        statement.run(row.level, row.exp_required, row.cumulative_exp)
      }
    })
  }

  replaceMasterData(
    students: Array<Record<string, unknown>>,
    items: Array<Record<string, unknown>>,
    source: string,
  ): void {
    this.transaction(() => {
      this.db.exec('PRAGMA foreign_keys = OFF')
      try {
        this.run('DELETE FROM master_students')
        this.run('DELETE FROM master_items')

        const studentInsert = this.db.prepare(`
          INSERT INTO master_students(
            id, name, school, icon_path, favor_item_tags, favor_item_unique_tags, raw_json
          )
          VALUES(?, ?, ?, ?, ?, ?, ?)
        `)
        for (const student of students) {
          studentInsert.run(
            Number(student.id),
            String(student.name || ''),
            normalizeSchoolName(String(student.school || '')),
            String(student.icon_path || ''),
            this.json(student.favor_item_tags || []),
            this.json(student.favor_item_unique_tags || []),
            this.json(student.raw_json || {}),
          )
        }

        const itemInsert = this.db.prepare(`
          INSERT INTO master_items(
            id, name, tags, rarity, category, exp_value, gift_kind, icon_name, icon_path, raw_json
          )
          VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const item of items) {
          itemInsert.run(
            Number(item.id),
            String(item.name || ''),
            this.json(item.tags || []),
            String(item.rarity || ''),
            String(item.category || ''),
            Number(item.exp_value || 0),
            String(item.gift_kind || 'gift'),
            String(item.icon_name || ''),
            String(item.icon_path || ''),
            this.json(item.raw_json || {}),
          )
        }

        this.run('DELETE FROM user_students WHERE student_id NOT IN (SELECT id FROM master_students)')
        this.run('DELETE FROM user_plans WHERE student_id NOT IN (SELECT id FROM master_students)')
        this.run('DELETE FROM user_inventory WHERE item_id NOT IN (SELECT id FROM master_items)')
      } finally {
        this.db.exec('PRAGMA foreign_keys = ON')
      }
    })
    this.setMeta('master_source', source)
  }

  searchStudents(
    query = '',
    school = '',
    ownedOnly = false,
    sortBy = 'owned',
  ): StudentRecord[] {
    let sql = `
      SELECT
        ms.*,
        COALESCE(us.current_bond_level, 1) AS current_bond_level,
        COALESCE(us.current_bond_exp, 0) AS current_bond_exp,
        COALESCE(us.star_rank, 5) AS star_rank,
        COALESCE(us.notes, '') AS notes,
        CASE WHEN us.student_id IS NULL THEN 0 ELSE 1 END AS is_owned
      FROM master_students ms
      LEFT JOIN user_students us ON us.student_id = ms.id
      WHERE (@query = '' OR ms.name LIKE '%' || @query || '%')
        AND (@school = '' OR ms.school = @school)
    `
    if (ownedOnly) {
      sql += ' AND us.student_id IS NOT NULL'
    }
    if (sortBy === 'school') {
      sql += ' ORDER BY CASE WHEN ms.school = \'\' THEN 1 ELSE 0 END, ms.school COLLATE NOCASE, ms.name COLLATE NOCASE'
    } else if (sortBy === 'name') {
      sql += ' ORDER BY ms.name COLLATE NOCASE'
    } else {
      sql += ' ORDER BY is_owned DESC, ms.name COLLATE NOCASE'
    }
    const rows = this.all(sql, { query: query.trim(), school: school.trim() })
    return rows.map((row) => this.studentFromRow(row))
  }

  getStudent(studentId: number): StudentRecord | null {
    const row = this.get(
      `
        SELECT
          ms.*,
          COALESCE(us.current_bond_level, 1) AS current_bond_level,
          COALESCE(us.current_bond_exp, 0) AS current_bond_exp,
          COALESCE(us.star_rank, 5) AS star_rank,
          COALESCE(us.notes, '') AS notes,
          CASE WHEN us.student_id IS NULL THEN 0 ELSE 1 END AS is_owned
        FROM master_students ms
        LEFT JOIN user_students us ON us.student_id = ms.id
        WHERE ms.id = ?
      `,
      [studentId],
    )
    return row ? this.studentFromRow(row) : null
  }

  listSchools(): string[] {
    const rows = this.all<{ school: string }>(
      "SELECT DISTINCT school FROM master_students WHERE school IS NOT NULL AND school != '' ORDER BY school",
    )
    return [...new Set(rows.map((row) => normalizeSchoolName(String(row.school || ''))))]
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'ja'))
  }

  listItems(query = ''): ItemRecord[] {
    const rows = this.all(
      `
        SELECT
          mi.*,
          COALESCE(ui.quantity, 0) AS quantity
        FROM master_items mi
        LEFT JOIN user_inventory ui ON ui.item_id = mi.id
        WHERE (@query = '' OR mi.name LIKE '%' || @query || '%')
        ORDER BY
          CASE mi.gift_kind WHEN 'bouquet' THEN 0 ELSE 1 END,
          mi.name COLLATE NOCASE
      `,
      { query: query.trim() },
    )
    return rows
      .map((row) => this.itemFromRow(row))
      .filter((item) => !isHiddenItem(item.name, item.icon_name))
  }

  upsertUserStudent(
    studentId: number,
    currentBondLevel: number,
    currentBondExp: number,
    notes = '',
  ): void {
    this.run(
      `
        INSERT INTO user_students(
          student_id, current_bond_level, current_bond_exp, star_rank, notes, updated_at
        )
        VALUES(?, ?, ?, 5, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(student_id) DO UPDATE SET
          current_bond_level = excluded.current_bond_level,
          current_bond_exp = excluded.current_bond_exp,
          star_rank = 5,
          notes = excluded.notes,
          updated_at = CURRENT_TIMESTAMP
      `,
      [studentId, currentBondLevel, currentBondExp, notes],
    )
  }

  deleteUserStudent(studentId: number): void {
    this.transaction(() => {
      this.run('DELETE FROM user_students WHERE student_id = ?', [studentId])
      this.run('DELETE FROM user_plans WHERE student_id = ?', [studentId])
    })
  }

  setInventoryQuantity(itemId: number, quantity: number): void {
    this.run(
      `
        INSERT INTO user_inventory(item_id, quantity, updated_at)
        VALUES(?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(item_id) DO UPDATE SET
          quantity = excluded.quantity,
          updated_at = CURRENT_TIMESTAMP
      `,
      [itemId, Math.max(0, Number(quantity) || 0)],
    )
  }

  getInventoryMap(): Record<number, number> {
    const rows = this.all<{ item_id: number; quantity: number }>(
      'SELECT item_id, quantity FROM user_inventory WHERE quantity > 0',
    )
    return Object.fromEntries(rows.map((row) => [Number(row.item_id), Number(row.quantity)]))
  }

  listBoxes(): Record<string, number> {
    const rows = this.all<{ box_type: string; quantity: number }>(
      'SELECT box_type, quantity FROM user_gift_boxes ORDER BY box_type COLLATE NOCASE',
    )
    return Object.fromEntries(rows.map((row) => [String(row.box_type), Number(row.quantity)]))
  }

  setBoxQuantity(boxType: string, quantity: number): void {
    this.run(
      `
        INSERT INTO user_gift_boxes(box_type, quantity, updated_at)
        VALUES(?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(box_type) DO UPDATE SET
          quantity = excluded.quantity,
          updated_at = CURRENT_TIMESTAMP
      `,
      [boxType, Math.max(0, Number(quantity) || 0)],
    )
  }

  listPlans(): PlanRecord[] {
    const rows = this.all(
      `
        SELECT
          up.id,
          up.student_id,
          up.target_bond_level,
          up.priority,
          COALESCE(up.notes, '') AS notes,
          ms.name AS student_name,
          ms.school AS school,
          COALESCE(us.current_bond_level, 1) AS current_bond_level,
          COALESCE(us.current_bond_exp, 0) AS current_bond_exp
        FROM user_plans up
        JOIN master_students ms ON ms.id = up.student_id
        LEFT JOIN user_students us ON us.student_id = up.student_id
        ORDER BY
          CASE up.priority
            WHEN 'top_priority' THEN 0
            WHEN 'priority' THEN 1
            WHEN 'semi_priority' THEN 2
            WHEN 'defer' THEN 3
            ELSE 4
          END,
          up.target_bond_level DESC,
          ms.name COLLATE NOCASE
      `,
    )

    return rows.map((row) => {
      const currentBondLevel = Number(row.current_bond_level || 1)
      const currentBondExp = Number(row.current_bond_exp || 0)
      const targetBondLevel = Number(row.target_bond_level || 1)
      return {
        id: Number(row.id),
        student_id: Number(row.student_id),
        student_name: String(row.student_name || ''),
        school: String(row.school || ''),
        current_bond_level: currentBondLevel,
        current_bond_exp: currentBondExp,
        target_bond_level: targetBondLevel,
        priority: String(row.priority || 'priority'),
        notes: String(row.notes || ''),
        required_exp: calcRequiredExp(currentBondLevel, currentBondExp, targetBondLevel),
        progress: progressRatio(currentBondLevel, currentBondExp, targetBondLevel),
      }
    })
  }

  savePlan(
    studentId: number,
    targetBondLevel: number,
    priority: string,
    notes = '',
    planId: number | null = null,
  ): number {
    let resolvedPlanId = planId
    if (resolvedPlanId === null) {
      const existing = this.get<{ id: number }>(
        'SELECT id FROM user_plans WHERE student_id = ? ORDER BY id LIMIT 1',
        [studentId],
      )
      if (existing) {
        resolvedPlanId = Number(existing.id)
      }
    }

    if (resolvedPlanId === null) {
      this.run(
        `
          INSERT INTO user_plans(student_id, target_bond_level, priority, notes, updated_at)
          VALUES(?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        [studentId, targetBondLevel, priority, notes],
      )
      const inserted = this.get<{ id: number }>('SELECT last_insert_rowid() AS id')
      return Number(inserted?.id || 0)
    }

    this.run(
      `
        UPDATE user_plans
        SET student_id = ?, target_bond_level = ?, priority = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [studentId, targetBondLevel, priority, notes, resolvedPlanId],
    )
    return resolvedPlanId
  }

  deletePlan(planId: number): void {
    this.run('DELETE FROM user_plans WHERE id = ?', [planId])
  }

  snapshotForOptimizer(): [
    PlanRecord[],
    Record<number, number>,
    Record<number, StudentRecord>,
    Record<number, ItemRecord>,
  ] {
    const plans = this.listPlans().filter((plan) =>
      ['top_priority', 'priority', 'semi_priority'].includes(String(plan.priority)),
    )
    const inventory = this.getInventoryMap()
    const boxes = this.listBoxes()
    const students = Object.fromEntries(
      this.searchStudents().map((student) => [student.id, student]),
    ) as Record<number, StudentRecord>
    const items = Object.fromEntries(
      this.listItems().map((item) => [item.id, item]),
    ) as Record<number, ItemRecord>
    const selectableBoxQuantity = Number(boxes[SELECTABLE_BOX_KEY] || 0)
    if (selectableBoxQuantity > 0) {
      inventory[SELECTABLE_BOX_ITEM_ID] =
        Number(inventory[SELECTABLE_BOX_ITEM_ID] || 0) + selectableBoxQuantity
      items[SELECTABLE_BOX_ITEM_ID] = {
        id: SELECTABLE_BOX_ITEM_ID,
        name: SELECTABLE_BOX_NAME,
        tags: [],
        rarity: 'SR',
        category: 'Favor',
        exp_value: 60,
        gift_kind: 'gift_box',
        box_type: SELECTABLE_BOX_KEY,
        icon_name: '',
        icon_path: path.join(ITEM_IMAGE_DIR, SELECTABLE_BOX_ICON_FILE),
        raw_json: { box_type: SELECTABLE_BOX_KEY },
        quantity: selectableBoxQuantity,
      }
    }
    return [plans, inventory, students, items]
  }

}
