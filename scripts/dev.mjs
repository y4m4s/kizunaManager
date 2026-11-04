import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_BACKEND_PORT, DEFAULT_FRONTEND_PORT, parseDevPort } from '../shared/ports.ts'

const scriptPath = fileURLToPath(import.meta.url)
const defaultRootDir = path.resolve(path.dirname(scriptPath), '..')

async function checkPort(port, label) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', (error) => {
      reject(error.code === 'EADDRINUSE'
        ? new Error(`${label}用のポート ${port} は使用中です。既存の開発サーバーを Ctrl+C で終了してから、再実行してください。`)
        : error)
    })
    probe.listen(port, '127.0.0.1', () => probe.close(resolve))
  })
}

export async function startDev({
  rootDir = defaultRootDir,
  frontendPort = Number(process.env.FRONTEND_PORT || DEFAULT_FRONTEND_PORT),
} = {}) {
  const backendPort = parseDevPort(process.env.PORT, DEFAULT_BACKEND_PORT, 'バックエンド')
  frontendPort = parseDevPort(frontendPort, DEFAULT_FRONTEND_PORT, 'フロントエンド')
  if (backendPort === frontendPort) {
    throw new Error('バックエンドとフロントエンドには異なるポートを指定してください。')
  }
  const frontendDir = path.join(rootDir, 'frontend')
  const backendEntry = path.join(rootDir, 'backend', 'src', 'server.ts')
  const viteEntry = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(viteEntry)) {
    throw new Error('Vite が見つかりません。npm --prefix frontend install を実行してください。')
  }
  await Promise.all([
    checkPort(backendPort, 'バックエンド'),
    checkPort(frontendPort, 'フロントエンド'),
  ])

  const children = []
  let closing = false
  let finish
  const done = new Promise((resolve) => { finish = resolve })

  function stopChild(record) {
    if (record.closed) return Promise.resolve()
    return new Promise((resolve) => {
      const timer = setTimeout(() => record.child.kill('SIGKILL'), 3000)
      record.child.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
      if (record.child.connected) {
        record.child.send('shutdown', (error) => {
          if (error && !record.closed) record.child.kill('SIGTERM')
        })
      } else {
        record.child.kill('SIGTERM')
      }
    })
  }

  async function shutdown(code = 0) {
    if (closing) return
    closing = true
    await Promise.all(children.map(stopChild))
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    process.off('message', onMessage)
    process.off('disconnect', onSignal)
    finish(code)
  }

  function startProcess(label, args, cwd, ipc = false) {
    // .cmd やシェルを挟まず、終了対象となる Node プロセスを直接保持する。
    const child = spawn(process.execPath, args, {
      cwd,
      env: {
        ...process.env,
        PORT: String(backendPort),
        FRONTEND_PORT: String(frontendPort),
        VITE_DEFAULT_API_BASE: `http://127.0.0.1:${backendPort}`,
      },
      stdio: ipc ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit',
      shell: false,
      windowsHide: true,
    })
    const record = { child, closed: false }
    children.push(record)
    child.once('error', (error) => {
      console.error(`[dev] ${label}を起動できません: ${error.message}`)
      void shutdown(1)
    })
    child.once('close', (code) => {
      record.closed = true
      if (!closing) {
        console.error(`[dev] ${label}が終了したため、開発サーバーを停止します。`)
        void shutdown(code || 1)
      }
    })
  }

  const onSignal = () => { void shutdown() }
  const onMessage = (message) => { if (message === 'shutdown') void shutdown() }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  process.on('message', onMessage)
  process.on('disconnect', onSignal)

  startProcess('バックエンド', ['--no-warnings', '--experimental-strip-types', backendEntry], rootDir, true)
  startProcess('フロントエンド', [viteEntry, '--port', String(frontendPort)], frontendDir)
  return done
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    process.exitCode = await startDev()
  } catch (error) {
    console.error(`[dev] ${error.message}`)
    process.exitCode = 1
  }
}
