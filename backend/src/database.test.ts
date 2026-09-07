import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Database } from './database.ts'

test('master refresh rejects incomplete data, backs up and preserves user data', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kizuna-db-test-'))
  // Always pass an explicit disposable DB path, independently of config imports.
  const dbPath = path.join(directory, 'test.db')
  const db = new Database(dbPath)
  assert.equal(db.dbPath, dbPath)
  t.after(() => {
    db.close()
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()))
    assert.ok(path.basename(directory).startsWith('kizuna-db-test-'))
    fs.rmSync(directory, { recursive: true, force: true })
  })
  db.initialize()
  const students = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, name: `S${index + 1}` }))
  const items = Array.from({ length: 10 }, (_, index) => ({ id: index + 101, name: `I${index + 101}` }))
  db.replaceMasterData(students, items, 'initial')
  db.upsertUserStudent(1, 20, 10, 'saved')
  db.savePlan(1, 100, 'top_priority')
  db.setInventoryQuantity(101, 7)
  const before = db.snapshotForOptimizer()
  for (const [nextStudents, nextItems] of [
    [[], items], [students, []], [students.slice(0, 1), items],
    [[...students.slice(0, 9), students[0]], items],
    [[...students.slice(0, 9), { id: 10, name: '' }], items],
  ]) {
    assert.throws(() => db.replaceMasterData(nextStudents, nextItems, 'invalid'))
    assert.deepEqual(db.snapshotForOptimizer(), before)
    assert.equal(db.getMeta('master_source'), 'initial')
  }
  db.replaceMasterData(students.slice(1), items.slice(1), 'updated')
  assert.equal(db.getStudent(1)?.current_bond_level, 20)
  assert.equal(db.listPlans().length, 1)
  assert.equal(db.getInventoryMap()[101], 7)
  const backups = fs.readdirSync(path.join(directory, 'backups'))
  assert.equal(backups.length, 1)
  const backup = new DatabaseSync(path.join(directory, 'backups', backups[0]), { readOnly: true })
  try {
    assert.equal(backup.prepare('SELECT quantity FROM user_inventory WHERE item_id=101').get()?.quantity, 7)
    assert.equal(backup.prepare("SELECT value FROM app_meta WHERE key='master_source'").get()?.value, 'initial')
    assert.equal(backup.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok')
  } finally { backup.close() }
  const check = new DatabaseSync(dbPath, { readOnly: true })
  try {
    assert.equal(check.prepare('PRAGMA journal_mode').get()?.journal_mode, 'delete')
    assert.deepEqual(check.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { check.close() }
})
