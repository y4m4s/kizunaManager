import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(currentDir, '..')
const frontendDir = path.join(rootDir, 'frontend')
const backendEntry = path.join(rootDir, 'backend', 'src', 'server.ts')

const children = []

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  children.push(child)
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown(code)
    }
  })
  return child
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

startProcess('node', ['--no-warnings', '--experimental-strip-types', backendEntry], {
  cwd: rootDir,
})

startProcess('npm', ['run', 'dev'], {
  cwd: frontendDir,
})
