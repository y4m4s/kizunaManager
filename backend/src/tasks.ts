import crypto from 'node:crypto'

import type { TaskSnapshot } from './types.ts'

export class TaskStore {
  private readonly tasks = new Map<string, TaskSnapshot>()
  private activeTaskId: string | null = null

  get(taskId: string): TaskSnapshot | null {
    return this.tasks.get(taskId) ?? null
  }

  hasRunningTask(): boolean {
    if (!this.activeTaskId) {
      return false
    }
    const task = this.tasks.get(this.activeTaskId)
    return task?.status === 'running'
  }

  start(
    kind: string,
    runner: (helpers: {
      update: (patch: Partial<TaskSnapshot>) => void
    }) => Promise<Record<string, unknown>>,
  ): TaskSnapshot {
    if (this.hasRunningTask()) {
      throw new Error('別の更新処理が進行中です。完了してから再度お試しください。')
    }

    const taskId = crypto.randomUUID()
    const snapshot: TaskSnapshot = {
      id: taskId,
      kind,
      status: 'running',
      message: '',
      current: 0,
      total: 1,
      started_at: new Date().toISOString(),
    }
    this.tasks.set(taskId, snapshot)
    this.activeTaskId = taskId

    void runner({
      update: (patch) => {
        const current = this.tasks.get(taskId)
        if (!current) {
          return
        }
        this.tasks.set(taskId, { ...current, ...patch })
      },
    })
      .then((result) => {
        const current = this.tasks.get(taskId)
        if (!current) {
          return
        }
        this.tasks.set(taskId, {
          ...current,
          status: 'done',
          finished_at: new Date().toISOString(),
          result,
          current: current.total,
        })
      })
      .catch((error) => {
        const current = this.tasks.get(taskId)
        if (!current) {
          return
        }
        this.tasks.set(taskId, {
          ...current,
          status: 'error',
          finished_at: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        if (this.activeTaskId === taskId) {
          this.activeTaskId = null
        }
      })

    return snapshot
  }
}
