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
