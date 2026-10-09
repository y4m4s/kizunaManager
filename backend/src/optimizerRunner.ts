// optimizeAllocation をワーカースレッドで実行するためのランナー。
// - ワーカーは 1 本を使い回し、ジョブは投入順に 1 件ずつ処理する
// - ワーカー内で起きた計算エラーは、そのジョブだけを失敗させる
// - ワーカー自体が起動できない・異常終了した場合は、そのジョブをメインスレッドで実行して結果を返す
//   (計算中は API が待たされるが、分配機能そのものは止めない)
// - ワーカーの失敗が続いた場合は、以後ワーカーを使わずメインスレッドで実行する
import { Worker } from 'node:worker_threads'

import { optimizeAllocation } from './optimizer.ts'
import type { OptimizeResultRecord } from './types.ts'

export type OptimizeArgs = Parameters<typeof optimizeAllocation>

export type OptimizeJob = {
  id: number
  args: OptimizeArgs
}

export type OptimizeWorkerResponse =
  | { id: number; ok: true; result: OptimizeResultRecord }
  | { id: number; ok: false; error: string }

type PendingJob = OptimizeJob & {
  resolve: (result: OptimizeResultRecord) => void
  reject: (error: Error) => void
}

const WORKER_URL = new URL('./optimizerWorker.ts', import.meta.url)
const MAX_CONSECUTIVE_WORKER_FAILURES = 3

export class OptimizerRunner {
  private worker: Worker | null = null
  private readonly queue: PendingJob[] = []
  private running: PendingJob | null = null
  private nextId = 1
  private closed = false
  private consecutiveWorkerFailures = 0
  private readonly workerUrl: URL

  constructor(workerUrl: URL = WORKER_URL) {
    this.workerUrl = workerUrl
  }

  /** 現在ワーカースレッドが稼働しているか (診断・テスト用) */
  get isWorkerActive(): boolean {
    return this.worker !== null
  }

  run(...args: OptimizeArgs): Promise<OptimizeResultRecord> {
    if (this.closed) {
      return Promise.reject(new Error('Optimizer runner is closed'))
    }
    return new Promise<OptimizeResultRecord>((resolve, reject) => {
      this.queue.push({ id: this.nextId++, args, resolve, reject })
      this.pump()
    })
  }

  async close(): Promise<void> {
    this.closed = true
    for (const job of this.queue.splice(0)) {
      job.reject(new Error('Optimizer runner is closed'))
    }
    const worker = this.worker
    this.worker = null
    if (worker) {
      await worker.terminate()
    }
  }

  private pump(): void {
    if (this.running || this.closed) {
      return
    }
    const job = this.queue.shift()
    if (!job) {
      return
    }
    this.running = job
    const worker = this.ensureWorker()
    if (!worker) {
      this.runInline(job)
      return
    }
    worker.ref()
    worker.postMessage({ id: job.id, args: job.args } satisfies OptimizeJob)
  }

  private ensureWorker(): Worker | null {
    if (this.worker) {
      return this.worker
    }
    if (this.consecutiveWorkerFailures >= MAX_CONSECUTIVE_WORKER_FAILURES) {
      return null
    }
    try {
      const worker = new Worker(this.workerUrl)
      // 待機中のワーカーがプロセス終了を妨げないようにする (計算中だけ ref する)
      worker.unref()
      worker.on('message', (response: OptimizeWorkerResponse) => this.handleResponse(worker, response))
      worker.on('error', (error) => this.handleWorkerFailure(worker, error))
      worker.on('exit', (code) => {
        if (this.worker === worker) {
          this.handleWorkerFailure(worker, new Error(`Optimizer worker exited (code: ${code})`))
        }
      })
      this.worker = worker
      return worker
    } catch (error) {
      this.consecutiveWorkerFailures += 1
      console.warn(`[optimizer] worker unavailable, running inline: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  private handleResponse(worker: Worker, response: OptimizeWorkerResponse): void {
    const job = this.running
    if (this.worker !== worker || !job || job.id !== response.id) {
      return
    }
    this.running = null
    this.consecutiveWorkerFailures = 0
    worker.unref()
    if (response.ok) {
      job.resolve(response.result)
    } else {
      job.reject(new Error(response.error))
    }
    this.pump()
  }

  private handleWorkerFailure(worker: Worker, error: Error): void {
    if (this.worker !== worker) {
      return
    }
    this.worker = null
    worker.removeAllListeners()
    void worker.terminate().catch(() => undefined)
    if (this.closed) {
      return
    }
    this.consecutiveWorkerFailures += 1
    console.warn(`[optimizer] worker failed, running job inline: ${error.message}`)
    const job = this.running
    if (job) {
      // 実行中だったジョブはメインスレッドで実行し直す。次のジョブではワーカーを再生成する。
      this.runInline(job)
    }
  }

  private runInline(job: PendingJob): void {
    try {
      job.resolve(optimizeAllocation(...job.args))
    } catch (error) {
      job.reject(error instanceof Error ? error : new Error(String(error)))
    } finally {
      this.running = null
      this.pump()
    }
  }
}
