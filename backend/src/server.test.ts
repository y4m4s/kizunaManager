import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { Database } from './database.ts'
import { resolveSafePath } from './httpSecurity.ts'

for (const environment of ['production', 'development']) {
  test(`HTTP access and graceful shutdown (${environment})`, { timeout: 15000 }, async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kizuna-http-test-'))
    const dbPath = path.join(directory, 'bond_manager.db')
    const db = new Database(dbPath)
    assert.equal(db.dbPath, dbPath)
    db.initialize()
    db.replaceMasterData([{ id: 1, name: 'Test' }], [{ id: 101, name: 'Gift' }], 'test')
    db.close()
    fs.mkdirSync(path.join(directory, 'images/items'), { recursive: true })
    fs.writeFileSync(path.join(directory, 'images/items/test.png'), 'test image')
    const child = spawn(process.execPath, ['--no-warnings', '--experimental-strip-types', fileURLToPath(new URL('./server.ts', import.meta.url))], {
      env: { ...process.env, KIZUNA_DATA_DIR: directory, PORT: '0', NODE_ENV: environment },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
    })
    const exited = once(child, 'exit')
    t.after(async () => {
      if (child.exitCode === null) child.kill()
      await exited
      assert.equal(path.dirname(directory), path.resolve(os.tmpdir()))
      assert.ok(path.basename(directory).startsWith('kizuna-http-test-'))
      fs.rmSync(directory, { recursive: true, force: true })
    })
    const { stdout, stderr } = child
    assert.ok(stdout && stderr)
    let output = ''
    const origin = await new Promise<string>((resolve, reject) => {
      child.on('error', reject)
      child.on('exit', () => reject(new Error(`Server exited before startup: ${output}`)))
      stderr.on('data', (chunk) => { output += chunk })
      stdout.on('data', (chunk) => {
        output += chunk
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/)
        if (match) resolve(match[0])
      })
    })
    assert.equal((await fetch(`${origin}/api/health`)).status, 200)
    for (const badOrigin of ['https://untrusted.example', 'null', 'http://127.0.0.1:9999']) {
      const response = await fetch(`${origin}/api/inventory/101`, { method: 'PUT', headers: { Origin: badOrigin, 'Content-Type': 'application/json' }, body: '{"quantity":99}' })
      assert.equal(response.status, 403)
      assert.equal(response.headers.get('access-control-allow-origin'), null)
    }
    const options = await fetch(`${origin}/api/inventory/101`, { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'PUT' } })
    assert.equal(options.status, 403)
    assert.equal((await fetch(`${origin}/api/inventory/101`, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: '{"quantity":99}' })).status, 403)
    const write = await fetch(`${origin}/api/inventory/101`, { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"quantity":7}' })
    assert.equal(write.status, 200)
    assert.deepEqual(await (await fetch(`${origin}/api/inventory`)).json(), { 101: 7 })
    const dev = await fetch(`${origin}/api/health`, { headers: { Origin: 'http://127.0.0.1:5173' } })
    assert.equal(dev.status, environment === 'development' ? 200 : 403)
    if (environment === 'development') assert.equal(dev.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173')
    const badHost = await new Promise<number | undefined>((resolve, reject) => {
      const request = http.get(`${origin}/api/health`, { headers: { Host: 'untrusted.example' } }, (response) => { response.resume(); resolve(response.statusCode) })
      request.on('error', reject)
    })
    assert.equal(badHost, 403)
    for (const url of ['/assets/data/bond_manager.db', '/assets/backend/src/config.ts', '/assets/data/..%5cdata-sibling%5cprobe.txt', '/assets/data/images/items/..%5c..%5cbond_manager.db']) {
      assert.equal((await fetch(`${origin}${url}`)).status, 403, url)
    }
    assert.equal(await (await fetch(`${origin}/assets/data/images/items/test.png`)).text(), 'test image')
    assert.equal(resolveSafePath(path.join(directory, 'data'), '../data-sibling/probe.txt'), null)
    child.send('shutdown')
    const [code] = await exited
    assert.equal(code, 0)
    const saved = new DatabaseSync(dbPath, { readOnly: true })
    try {
      assert.equal(saved.prepare('SELECT quantity FROM user_inventory WHERE item_id=101').get()?.quantity, 7)
      assert.equal(saved.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok')
    } finally { saved.close() }
  })
}
