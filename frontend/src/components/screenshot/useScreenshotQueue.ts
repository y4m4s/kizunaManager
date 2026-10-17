import { useCallback, useEffect, useRef, useState } from 'react'
import { imageFilesFrom } from '../../lib/screenshotImport/files'

export type ShotStatus = 'waiting' | 'reading' | 'done' | 'error'

export type ShotState<R> = {
  id: number
  name: string
  previewUrl: string
  status: ShotStatus
  message: string
  reading: R | null
}

export type ShotResult<R> = {
  reading: R | null
  message: string
  error?: boolean
}

type Options<R> = {
  initialFiles: File[]
  // 1 枚を読み取る。progress で途中経過の表示を更新できる
  read: (file: File, progress: (message: string) => void) => Promise<ShotResult<R>>
  onClose: () => void
}

let nextShotId = 1

// スクショ取り込みダイアログ共通の処理: 画像の受け付け (選択・ドロップ・貼り付け)、
// 1 枚ずつ順番に読み取る待ち行列、プレビュー URL の後始末、Esc で閉じる
export function useScreenshotQueue<R>({ initialFiles, read, onClose }: Options<R>) {
  const [shots, setShots] = useState<ShotState<R>[]>([])
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const readRef = useRef(read)
  const initialFilesRef = useRef(initialFiles)
  const startedRef = useRef(false)
  const previewUrlsRef = useRef<string[]>([])
  const aliveRef = useRef(false)

  useEffect(() => {
    readRef.current = read
  }, [read])

  const addFiles = useCallback((files: File[]) => {
    if (!files.length) return
    const added: ShotState<R>[] = files.map((file) => ({
      id: nextShotId++,
      name: file.name || 'クリップボードの画像',
      previewUrl: URL.createObjectURL(file),
      status: 'waiting',
      message: '',
      reading: null,
    }))
    previewUrlsRef.current.push(...added.map((shot) => shot.previewUrl))
    setShots((current) => [...current, ...added])

    added.forEach((shot, index) => {
      const file = files[index]
      queueRef.current = queueRef.current.then(async () => {
        const update = (patch: Partial<ShotState<R>>) =>
          setShots((current) => current.map((row) => (row.id === shot.id ? { ...row, ...patch } : row)))
        update({ status: 'reading', message: '' })
        try {
          // 描画を止めないよう、読み取りの前に 1 フレーム譲る
          await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
          const result = await readRef.current(file, (message) => update({ message }))
          update({ status: result.error ? 'error' : 'done', message: result.message, reading: result.reading })
        } catch (error) {
          update({ status: 'error', message: error instanceof Error ? error.message : String(error) })
        }
      })
    })
  }, [])

  useEffect(() => {
    // StrictMode で effect が 2 回走っても、最初の画像を二重に読まないようにする
    if (startedRef.current) return
    startedRef.current = true
    addFiles(initialFilesRef.current)
  }, [addFiles])

  // プレビュー用の URL は閉じたときに解放する。
  // StrictMode の仮のアンマウントでは解放しないよう、次のタスクで生きているか確かめる。
  useEffect(() => {
    aliveRef.current = true
    const urls = previewUrlsRef.current
    return () => {
      aliveRef.current = false
      setTimeout(() => {
        if (!aliveRef.current) urls.forEach((url) => URL.revokeObjectURL(url))
      }, 0)
    }
  }, [])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const files = imageFilesFrom(event.clipboardData?.items)
      if (files.length) {
        event.preventDefault()
        addFiles(files)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('paste', handlePaste)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('paste', handlePaste)
      window.removeEventListener('keydown', handleKey)
    }
  }, [addFiles, onClose])

  const busy = shots.some((shot) => shot.status === 'waiting' || shot.status === 'reading')
  return { shots, addFiles, busy }
}
