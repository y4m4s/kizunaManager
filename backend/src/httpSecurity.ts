import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

export function authorizeRequest(request: IncomingMessage, response: ServerResponse): boolean {
  const port = request.socket.localPort
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
  if (!hosts.has(request.headers.host || '')) return false

  const origin = request.headers.origin
  const allowedOrigins = new Set([...hosts].map((host) => `http://${host}`))
  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.add('http://127.0.0.1:5173')
    allowedOrigins.add('http://localhost:5173')
  }
  if (origin !== undefined && !allowedOrigins.has(origin)) return false
  if (!origin && request.headers['sec-fetch-site'] === 'cross-site') return false

  const method = request.method || 'GET'
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) &&
      request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return false
  }
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  }
  response.setHeader('X-Content-Type-Options', 'nosniff')
  return true
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export function resolveSafePath(rootDir: string, relativePath: string): string | null {
  const root = path.resolve(rootDir)
  const resolved = path.resolve(root, relativePath)
  if (!isWithin(root, resolved)) return null
  // Also reject symlinks/junctions which leave the public directory.
  if (fs.existsSync(resolved) && !isWithin(fs.realpathSync(root), fs.realpathSync(resolved))) return null
  return resolved
}
