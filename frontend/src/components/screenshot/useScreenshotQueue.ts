import { useCallback, useEffect, useRef, useState } from 'react'
import { imageFilesFrom } from '../../lib/screenshotImport/files'

export type ShotState<R> = {
  id: number
  name: string
  previewUrl: string
  status: 'waiting' | 'reading' | 'done' | 'error'
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
  // 1 枚を読み取る。progress で途中経過の表示を更新できる。
  // ダイアログを閉じると signal が中断されるので、時間のかかる処理は途中で止める
  read: (file: File, progress: (message: string) => void, signal: AbortSignal) => Promise<ShotResult<R>>
  onClose: () => void
}

let nextShotId = 1

// スクショ取り込みダイアログ共通の処理: 画像の受け付け (選択・ドロップ・貼り付け)、
// 1 枚ずつ順番に読み取る待ち行列、閉じたときの中断とプレビュー URL の後始末、Esc で閉じる
export function useScreenshotQueue<R>({ initialFiles, read, onClose }: Options<R>) {
  const [shots, setShots] = useState<ShotState<R>[]>([])
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const readRef = useRef(read)
  const initialFilesRef = useRef(initialFiles)
  const startedRef = useRef(false)
  const previewUrlsRef = useRef<string[]>([])
  const aliveRef = useRef(false)
  const abortRef = useRef(new AbortController())

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
        const signal = abortRef.current.signal
        if (signal.aborted) return
        const update = (patch: Partial<ShotState<R>>) =>
          setShots((current) => current.map((row) => (row.id === shot.id ? { ...row, ...patch } : row)))
        update({ status: 'reading', message: '' })
        try {
          // 描画を止めないよう、読み取りの前に 1 フレーム譲る
          await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
          const result = await readRef.current(file, (message) => update({ message }), signal)
          if (signal.aborted) return
          update({ status: result.error ? 'error' : 'done', message: result.message, reading: result.reading })
        } catch (error) {
          if (signal.aborted) return
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

  // 閉じたら読み取りを止め、プレビュー用の URL を解放する。
  // StrictMode の仮のアンマウントでは止めないよう、次のタスクで生きているか確かめる。
  useEffect(() => {
    aliveRef.current = true
    const urls = previewUrlsRef.current
    const controller = abortRef.current
    return () => {
      aliveRef.current = false
      setTimeout(() => {
        if (aliveRef.current) return
        controller.abort()
        urls.forEach((url) => URL.revokeObjectURL(url))
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
    // ダイアログのどこに画像を落としても取り込む (ブラウザが画像を開いて画面を離れないようにする)
    const handleDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    const handleDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      addFiles(imageFilesFrom(event.dataTransfer.files))
    }
    window.addEventListener('paste', handlePaste)
    window.addEventListener('keydown', handleKey)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('paste', handlePaste)
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [addFiles, onClose])

  const busy = shots.some((shot) => shot.status === 'waiting' || shot.status === 'reading')
  return { shots, addFiles, busy }
}
