import { assetUrl } from '../../api'
import type { Item } from '../../types'
import {
  ICON_WIDTH,
  NORMALIZED_HEIGHT,
  NORMALIZED_WIDTH,
  isSupportedAspect,
  type IconReference,
  type RgbaImage,
} from './recognize'
import {
  sampleCoarsePlacements,
  type ScaledIconProvider,
  type StudentIconSource,
} from './studentRecognize'

function bitmapToRgba(bitmap: ImageBitmap): RgbaImage {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('画像を処理できませんでした。')
  context.drawImage(bitmap, 0, 0)
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height)
  return { width: bitmap.width, height: bitmap.height, data }
}

// スクショを 1920x1080 に揃えて読み込む。16:9 以外は対象外。
export async function loadScreenshot(blob: Blob): Promise<RgbaImage> {
  const original = await createImageBitmap(blob)
  try {
    if (!isSupportedAspect(original.width, original.height)) {
      throw new Error(`画面比率が 16:9 ではありません (${original.width}x${original.height})。PC 版の画面全体のスクショを使ってください。`)
    }
  } finally {
    original.close()
  }
  const resized = await createImageBitmap(blob, {
    resizeWidth: NORMALIZED_WIDTH,
    resizeHeight: NORMALIZED_HEIGHT,
    resizeQuality: 'high',
  })
  try {
    return bitmapToRgba(resized)
  } finally {
    resized.close()
  }
}

// 贈り物アイコンを、ゲーム内と同じ幅 (1080p 換算) に縮小して読み込む
export async function loadIconReferences(items: Item[]): Promise<IconReference[]> {
  const references = await Promise.all(items.map(async (item) => {
    const url = assetUrl(item.icon_path)
    if (!url) return null
    try {
      const response = await fetch(url, { mode: 'cors' })
      if (!response.ok) return null
      const blob = await response.blob()
      const original = await createImageBitmap(blob)
      const height = Math.round((ICON_WIDTH * original.height) / original.width)
      original.close()
      const resized = await createImageBitmap(blob, {
        resizeWidth: ICON_WIDTH,
        resizeHeight: height,
        resizeQuality: 'high',
      })
      try {
        return { itemId: item.id, image: bitmapToRgba(resized) }
      } finally {
        resized.close()
      }
    } catch {
      return null
    }
  }))
  return references.filter((reference): reference is IconReference => reference !== null)
}

function drawScaled(bitmap: ImageBitmap, size: number): RgbaImage {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('画像を処理できませんでした。')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, size, size)
  const { data } = context.getImageData(0, 0, size, size)
  return { width: size, height: size, data }
}

// 生徒アイコンを読み込み、粗い比較用の点の画素も取り出しておく
export async function loadStudentIconSources(
  students: Array<{ id: number; icon_path?: string | null }>,
): Promise<StudentIconSource[]> {
  const sources = await Promise.all(students.map(async (student) => {
    const url = assetUrl(student.icon_path)
    if (!url) return null
    try {
      const response = await fetch(url, { mode: 'cors' })
      if (!response.ok) return null
      const bitmap = await createImageBitmap(await response.blob())
      return { studentId: student.id, bitmap, coarse: sampleCoarsePlacements((size) => drawScaled(bitmap, size)) }
    } catch {
      return null
    }
  }))
  return sources.filter((source): source is StudentIconSource => source !== null)
}

// 細かい位置合わせで使う、大きさ違いのアイコン。同じ大きさは作り直さない
export function createScaledIconProvider(): ScaledIconProvider {
  const cache = new Map<string, RgbaImage>()
  return (source, size) => {
    const key = `${source.studentId}:${size}`
    let icon = cache.get(key)
    if (!icon) {
      if (cache.size > 400) cache.clear()
      icon = drawScaled(source.bitmap, size)
      cache.set(key, icon)
    }
    return icon
  }
}
