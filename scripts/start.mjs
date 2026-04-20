import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(currentDir, '..')
const backendEntry = path.join(rootDir, 'backend', 'src', 'server.ts')

process.env.NODE_ENV = 'production'
await import(pathToFileURL(backendEntry).href)
