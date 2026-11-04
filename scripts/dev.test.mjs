import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const launcherUrl = new URL('./dev.mjs', import.meta.url).href

async function listen() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server
}

async function freePort() {
  const server = await listen()
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

function fixture(t, useEnvPort = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kizuna-dev-test with spaces-'))
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()))
    assert.ok(path.basename(directory).startsWith('kizuna-dev-test with spaces-'))
    fs.rmSync(directory, { recursive: true, force: true })
  })
  const backend = path.join(directory, 'backend/src')
  const vite = path.join(directory, 'frontend/node_modules/vite/bin')
  fs.mkdirSync(backend, { recursive: true })
  fs.mkdirSync(vite, { recursive: true })
  fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}')
  const serverCode = `
    import net from 'node:net';
    const frontend = process.argv[1].endsWith('vite.js');
    const server = net.createServer();
    const shutdown = () => server.close(() => process.exit(0));
    process.on('message', m => { if (m === 'shutdown') shutdown(); });
    process.on('disconnect', shutdown);
    server.listen(Number(frontend ? process.env.TEST_FRONTEND_PORT : process.env.PORT), '127.0.0.1', () => {
      console.log('CONFIG frontendPort=' + process.env.FRONTEND_PORT + ' API_BASE=' + (process.env.VITE_API_BASE ?? process.env.VITE_DEFAULT_API_BASE));
      console.log(frontend ? 'READY frontend' : 'READY backend');
      if (frontend && process.env.TEST_EXIT_CODE) setTimeout(() => process.exit(Number(process.env.TEST_EXIT_CODE)), 100);
    });
  `
  fs.writeFileSync(path.join(backend, 'server.ts'), serverCode)
  fs.writeFileSync(path.join(vite, 'vite.js'), serverCode)
  const entry = path.join(directory, 'run.mjs')
  fs.writeFileSync(entry, `
    import { startDev } from ${JSON.stringify(launcherUrl)};
    try {
      process.exitCode = await startDev({ rootDir: ${JSON.stringify(directory)}, frontendPort: ${useEnvPort ? 'undefined' : 'Number(process.env.TEST_FRONTEND_PORT)'} });
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  `)
  return entry
}

function launch(t, entry, backendPort, frontendPort, extraEnv = {}) {
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: String(backendPort), TEST_FRONTEND_PORT: String(frontendPort), ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  })
  let output = ''
  const exited = once(child, 'exit')
  let ready
  const started = new Promise((resolve, reject) => {
    ready = resolve
    child.once('error', reject)
    child.once('exit', () => reject(new Error(`Exited before ready: ${output}`)))
  })
  // Conflict tests wait for exit rather than readiness.
  started.catch(() => {})
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
    output += chunk
    if (output.includes('READY frontend') && output.includes('READY backend')) ready()
  })
  t.after(async () => {
    if (child.exitCode === null && child.connected) child.send('shutdown')
    await exited
  })
  return { child, started, exited, output: () => output }
}

test('starts and stops both children twice without shell warnings or occupied ports', { timeout: 15000 }, async (t) => {
  const entry = fixture(t)
  const backendPort = await freePort()
  const frontendPort = await freePort()
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const run = launch(t, entry, backendPort, frontendPort)
    await run.started
    run.child.send('shutdown')
    assert.equal((await run.exited)[0], 0)
    assert.doesNotMatch(run.output(), /DEP0190|DeprecationWarning/)
  }
})

for (const apiOverride of [undefined, 'http://127.0.0.1:43899']) {
  test(`synchronizes custom ports with CORS and API settings (${apiOverride ? 'explicit API' : 'derived API'})`, { timeout: 15000 }, async (t) => {
    const entry = fixture(t, true)
    const backendPort = await freePort()
    const frontendPort = await freePort()
    const run = launch(t, entry, backendPort, frontendPort, {
      FRONTEND_PORT: String(frontendPort),
      VITE_API_BASE: apiOverride,
    })
    await run.started
    assert.ok(run.output().includes(`CONFIG frontendPort=${frontendPort} API_BASE=${apiOverride ?? `http://127.0.0.1:${backendPort}`}`))
    run.child.send('shutdown')
    assert.equal((await run.exited)[0], 0)
  })
}

for (const busy of ['backend', 'frontend']) {
  test(`rejects occupied ${busy} port before starting children`, { timeout: 10000 }, async (t) => {
    const entry = fixture(t)
    const occupied = await listen()
    t.after(() => new Promise((resolve) => occupied.close(resolve)))
    const port = occupied.address().port
    const free = await freePort()
    const run = launch(t, entry, busy === 'backend' ? port : free, busy === 'frontend' ? port : free)
    assert.equal((await run.exited)[0], 1)
    assert.match(run.output(), new RegExp(`ポート ${port} は使用中`))
    assert.doesNotMatch(run.output(), /READY|Unhandled|DEP0190/)
  })
}

for (const ports of [[0, 43188], [43187, 0], [43187, 43187]]) {
  test(`rejects unusable dev port configuration ${ports.join('/')}`, { timeout: 10000 }, async (t) => {
    const entry = fixture(t)
    const run = launch(t, entry, ...ports)
    assert.equal((await run.exited)[0], 1)
    assert.match(run.output(), /0 は開発起動では使用できません|異なるポートを指定/)
    assert.doesNotMatch(run.output(), /READY/)
  })
}

for (const exitCode of ['0', '2']) {
  test(`cleans up the backend when the frontend exits with code ${exitCode}`, { timeout: 15000 }, async (t) => {
    const entry = fixture(t)
    const backendPort = await freePort()
    const frontendPort = await freePort()
    const failed = launch(t, entry, backendPort, frontendPort, { TEST_EXIT_CODE: exitCode })
    assert.equal((await failed.exited)[0], Number(exitCode) || 1)
    const restarted = launch(t, entry, backendPort, frontendPort)
    await restarted.started
    restarted.child.send('shutdown')
    assert.equal((await restarted.exited)[0], 0)
  })
}
