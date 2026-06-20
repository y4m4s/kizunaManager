const { app, BrowserWindow, dialog, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')

const DEBUG_LOG = path.join(os.tmpdir(), 'kizuna-desktop-debug.log')
function debugLog(message) {
  try {
    fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${message}\n`)
  } catch {
    // ignore
  }
}
try {
  fs.writeFileSync(DEBUG_LOG, '')
} catch {
  // ignore
}
debugLog(`boot pid=${process.pid} packaged=${app.isPackaged} execPath=${process.execPath}`)
process.on('uncaughtException', (error) => {
  debugLog(`uncaughtException: ${error.stack || error}`)
})

const rootDir = path.join(__dirname, '..')
const backendEntry = path.join(rootDir, 'backend', 'src', 'server.ts')

const HEALTH_TIMEOUT_MS = 120_000
const HEALTH_INTERVAL_MS = 300

let backendProcess = null
let mainWindow = null
let quitting = false

const LOADING_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>Kizuna Manager</title><style>
  html,body{height:100%;margin:0;display:flex;align-items:center;justify-content:center;
    background:#1b1d2a;color:#e8e9f0;font-family:'Segoe UI',sans-serif}
  .box{text-align:center}
  .spinner{width:40px;height:40px;margin:0 auto 16px;border:4px solid #3a3d55;
    border-top-color:#8ab4ff;border-radius:50%;animation:spin 0.9s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  p{margin:4px 0;font-size:14px;color:#aab}
</style></head><body><div class="box">
  <div class="spinner"></div>
  <h1 style="font-size:18px;margin:0 0 8px">Kizuna Manager を起動しています…</h1>
  <p>初回起動時はマスターデータの取得に時間がかかることがあります</p>
</div></body></html>`)}`

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

// データディレクトリの解決順:
//   1. KIZUNA_DATA_DIR 環境変数 (明示指定)
//   2. パッケージ版: exe と同じ場所にある data フォルダ
//   3. パッケージ版: exe の一つ上の階層にある data フォルダ
//      (release/ サブディレクトリから実行した場合にプロジェクトの data/ を参照できる)
//   4. パッケージ版: %APPDATA%/<app>/data
//   5. 開発起動: リポジトリの data/ (Web 版と共通)
function dataDir() {
  if (process.env.KIZUNA_DATA_DIR) {
    return path.resolve(process.env.KIZUNA_DATA_DIR)
  }
  if (app.isPackaged) {
    // ポータブル exe は一時フォルダに展開されて実行されるため、
    // 元の exe の場所は PORTABLE_EXECUTABLE_DIR で知る
    const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)
    const portableData = path.join(exeDir, 'data')
    if (fs.existsSync(portableData)) {
      return portableData
    }
    const parentData = path.resolve(exeDir, '..', 'data')
    if (fs.existsSync(parentData)) {
      return parentData
    }
    return path.join(app.getPath('userData'), 'data')
  }
  return path.join(rootDir, 'data')
}

function startBackend(port) {
  backendProcess = spawn(
    process.execPath,
    ['--no-warnings', '--experimental-strip-types', backendEntry],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        PORT: String(port),
        KIZUNA_DATA_DIR: dataDir(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )

  backendProcess.stdout.on('data', (chunk) => process.stdout.write(`[backend] ${chunk}`))
  backendProcess.stderr.on('data', (chunk) => process.stderr.write(`[backend] ${chunk}`))

  backendProcess.on('exit', (code) => {
    debugLog(`backend exited code=${code} quitting=${quitting}`)
    backendProcess = null
    if (!quitting) {
      dialog.showErrorBox(
        'Kizuna Manager',
        `バックエンドが予期せず終了しました (exit code: ${code})`,
      )
      app.quit()
    }
  })
}

function checkHealth(port) {
  return new Promise((resolve) => {
    const request = http.get(
      { host: '127.0.0.1', port, path: '/api/health', timeout: 2_000 },
      (response) => {
        response.resume()
        resolve(response.statusCode === 200)
      },
    )
    request.on('error', () => resolve(false))
    request.on('timeout', () => {
      request.destroy()
      resolve(false)
    })
  })
}

async function waitForBackend(port) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (quitting || !backendProcess) {
      return false
    }
    if (await checkHealth(port)) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_INTERVAL_MS))
  }
  return false
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: '#1b1d2a',
    title: 'Kizuna Manager',
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.loadURL(LOADING_HTML)
}

async function start() {
  createWindow()

  const port = await findFreePort()
  debugLog(`backend port=${port} dataDir=${dataDir()}`)
  startBackend(port)

  const healthy = await waitForBackend(port)
  debugLog(`backend healthy=${healthy}`)
  if (quitting) {
    return
  }
  if (!healthy) {
    dialog.showErrorBox('Kizuna Manager', 'バックエンドの起動がタイムアウトしました。')
    app.quit()
    return
  }
  if (mainWindow) {
    await mainWindow.loadURL(`http://127.0.0.1:${port}/`)
    debugLog('app page loaded')
  }
}

const gotLock = app.requestSingleInstanceLock()
debugLog(`gotLock=${gotLock}`)
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    debugLog('app ready')
    void start()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', () => {
    quitting = true
  })

  app.on('will-quit', () => {
    if (backendProcess) {
      backendProcess.kill()
      backendProcess = null
    }
  })
}
