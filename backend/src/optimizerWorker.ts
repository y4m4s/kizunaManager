// 分配計算専用のワーカースレッド。
// メインスレッド (HTTP サーバー) を塞がないよう optimizeAllocation をここで実行する。
import { parentPort } from 'node:worker_threads'

import { optimizeAllocation } from './optimizer.ts'
import type { OptimizeJob, OptimizeWorkerResponse } from './optimizerRunner.ts'

if (!parentPort) {
  throw new Error('optimizerWorker.ts must be started as a worker thread')
}

const port = parentPort

port.on('message', (job: OptimizeJob) => {
  let response: OptimizeWorkerResponse
  try {
    response = { id: job.id, ok: true, result: optimizeAllocation(...job.args) }
  } catch (error) {
    response = {
      id: job.id,
      ok: false,
      error: error instanceof Error ? (error.stack || error.message) : String(error),
    }
  }
  port.postMessage(response)
})
