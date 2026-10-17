// ブルーアーカイブ PC 版「アイテム」画面のスクリーンショットから、贈り物の所持数を読み取る。
//
// 前提: 16:9 の画面全体のスクショ。処理の前に 1920x1080 へ縮小 (拡大) してから扱うので、
// 以下の座標はすべて 1080p 換算の値。
//  1. 右側の「リスト」枠の中で、カード間の灰色の隙間からカードの行位置を求める
//     (列位置は固定、行はスクロール量によって変わる)
//  2. 各カードのアイコンを、アプリが持っている贈り物アイコンと照合してアイテムを特定する
//  3. 右下の「x52」の紺色の文字を切り出し、数字の見本と照合して所持数を読む
import {
  DIGIT_GLYPH_HEIGHT,
  DIGIT_GLYPH_WIDTH,
  DIGIT_HOLES,
  DIGIT_TEMPLATES,
} from './digitTemplates'

export const NORMALIZED_WIDTH = 1920
export const NORMALIZED_HEIGHT = 1080

const CARD_SIZE = 142
const COLUMN_X0 = 1051
const COLUMN_PITCH = 158.75
const COLUMN_COUNT = 5
const ROW_PITCH = 147.7
const VIEW_TOP = 233
const VIEW_BOTTOM = 912
const GAP_COLOR = [196, 207, 212]
const GAP_TOLERANCE = 18

// アイコンはカード左上から (-12, 4) の位置に幅 168px で描かれている
export const ICON_WIDTH = 168
const ICON_OFFSET_X = -12
const ICON_OFFSET_Y = 4
// 所持数の文字と重なる右下はアイコン照合に使わない
const NUMBER_AREA_TOP = 85
const NUMBER_AREA_LEFT = 40

// リスト右端のスクロールバー。つまみが上端・下端にあれば、一覧の先頭・末尾が写っている
const SCROLLBAR_X = 1864
const SCROLLBAR_THUMB_COLOR = [133, 151, 165]
const SCROLLBAR_TRACK_TOP = 237
const SCROLLBAR_TRACK_BOTTOM = 906
const SCROLLBAR_EDGE_TOLERANCE = 4

const TEXT_COLOR = [43, 68, 97]
const TEXT_TOLERANCE = 70
const TEXT_TOP = 96
const TEXT_LEFT = 30

// 判定のしきい値 (3 枚のスクショで、正解の誤差は最大 32、次点との比は最小 1.75)
const ICON_MAX_ERROR = 45
const ICON_MIN_RATIO = 1.35
const DIGIT_MIN_MARGIN = 0.03
const HOLE_PENALTY = 0.08

export type RgbaImage = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type IconReference = {
  itemId: number
  image: RgbaImage
}

export type CardReading = {
  itemId: number | null
  quantity: number | null
  confident: boolean
  iconError: number
  note: string
}

export type ScreenshotReading = {
  // 画面の並び順 (左上から右下)
  cards: CardReading[]
  // 一覧の先頭 / 末尾が写っているか
  atTop: boolean
  atEnd: boolean
  error: string | null
}

function isGap(data: Uint8ClampedArray, offset: number): boolean {
  return Math.abs(data[offset] - GAP_COLOR[0]) +
    Math.abs(data[offset + 1] - GAP_COLOR[1]) +
    Math.abs(data[offset + 2] - GAP_COLOR[2]) < GAP_TOLERANCE
}

function columnX(column: number): number {
  return COLUMN_X0 + Math.round(column * COLUMN_PITCH)
}

// カード間の隙間 (幅 3〜9px の灰色の帯) から、完全に見えているカードの上端 y を求める
export function findCardTops(image: RgbaImage): number[] {
  const left = columnX(0)
  const right = columnX(COLUMN_COUNT - 1) + CARD_SIZE
  const isGapRow: boolean[] = []
  for (let y = VIEW_TOP; y <= VIEW_BOTTOM; y += 1) {
    let count = 0
    for (let x = left; x < right; x += 1) {
      if (isGap(image.data, (y * image.width + x) * 4)) count += 1
    }
    isGapRow.push(count / (right - left) > 0.55)
  }

  const phases: number[] = []
  let start: number | null = null
  isGapRow.forEach((gap, index) => {
    if (gap && start === null) start = index
    if (!gap && start !== null) {
      const length = index - start
      if (length >= 3 && length <= 9) {
        const top = VIEW_TOP + index
        phases.push(((top - VIEW_TOP) % ROW_PITCH + ROW_PITCH) % ROW_PITCH)
      }
      start = null
    }
  })
  if (!phases.length) return []

  phases.sort((a, b) => a - b)
  const phase = phases[Math.floor(phases.length / 2)]
  const tops: number[] = []
  for (let top = VIEW_TOP + phase - ROW_PITCH * 6; top < VIEW_BOTTOM; top += ROW_PITCH) {
    const rounded = Math.round(top)
    if (rounded >= VIEW_TOP && rounded + CARD_SIZE <= VIEW_BOTTOM) tops.push(rounded)
  }
  return tops
}

function isEmptySlot(image: RgbaImage, left: number, top: number): boolean {
  let gap = 0
  let total = 0
  for (let y = top; y < top + CARD_SIZE; y += 4) {
    for (let x = left; x < left + CARD_SIZE; x += 4) {
      total += 1
      if (isGap(image.data, (y * image.width + x) * 4)) gap += 1
    }
  }
  return gap / total > 0.5
}

function iconError(image: RgbaImage, left: number, top: number, icon: RgbaImage): number {
  let sum = 0
  let count = 0
  for (let iy = 0; iy < icon.height; iy += 2) {
    const cy = ICON_OFFSET_Y + iy
    if (cy < 0 || cy >= CARD_SIZE) continue
    for (let ix = 0; ix < icon.width; ix += 2) {
      const cx = ICON_OFFSET_X + ix
      if (cx < 0 || cx >= CARD_SIZE) continue
      if (cy >= NUMBER_AREA_TOP && cx >= NUMBER_AREA_LEFT) continue
      const io = (iy * icon.width + ix) * 4
      if (icon.data[io + 3] <= 230) continue
      const so = ((top + cy) * image.width + left + cx) * 4
      sum += Math.abs(image.data[so] - icon.data[io]) +
        Math.abs(image.data[so + 1] - icon.data[io + 1]) +
        Math.abs(image.data[so + 2] - icon.data[io + 2])
      count += 3
    }
  }
  return count ? sum / count : Number.POSITIVE_INFINITY
}

type Component = {
  x0: number
  y0: number
  x1: number
  y1: number
  pixels: Array<[number, number]>
}

function textComponents(image: RgbaImage, left: number, top: number): Component[] {
  const width = CARD_SIZE - TEXT_LEFT
  const height = CARD_SIZE - TEXT_TOP
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = ((top + TEXT_TOP + y) * image.width + left + TEXT_LEFT + x) * 4
      const diff = Math.abs(image.data[o] - TEXT_COLOR[0]) +
        Math.abs(image.data[o + 1] - TEXT_COLOR[1]) +
        Math.abs(image.data[o + 2] - TEXT_COLOR[2])
      if (diff < TEXT_TOLERANCE) mask[y * width + x] = 1
    }
  }

  const seen = new Uint8Array(width * height)
  const components: Component[] = []
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue
    const stack = [start]
    seen[start] = 1
    const component: Component = { x0: width, y0: height, x1: -1, y1: -1, pixels: [] }
    while (stack.length) {
      const index = stack.pop() as number
      const x = index % width
      const y = (index - x) / width
      component.pixels.push([y, x])
      component.x0 = Math.min(component.x0, x)
      component.x1 = Math.max(component.x1, x)
      component.y0 = Math.min(component.y0, y)
      component.y1 = Math.max(component.y1, y)
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const next = ny * width + nx
          if (mask[next] && !seen[next]) {
            seen[next] = 1
            stack.push(next)
          }
        }
      }
    }
    if (component.pixels.length >= 25) components.push(component)
  }
  return components.sort((a, b) => a.x0 - b.x0)
}

function componentBitmap(component: Component): { bitmap: Uint8Array; width: number; height: number } {
  const width = component.x1 - component.x0 + 1
  const height = component.y1 - component.y0 + 1
  const bitmap = new Uint8Array(width * height)
  for (const [y, x] of component.pixels) {
    bitmap[(y - component.y0) * width + (x - component.x0)] = 1
  }
  return { bitmap, width, height }
}

// 縮小後の 1 マスに入る元画素の平均 (見本の作成と同じ方法)
export function boxResize(bitmap: Uint8Array, width: number, height: number): Float32Array {
  const out = new Float32Array(DIGIT_GLYPH_WIDTH * DIGIT_GLYPH_HEIGHT)
  for (let j = 0; j < DIGIT_GLYPH_HEIGHT; j += 1) {
    const y0 = Math.floor((j * height) / DIGIT_GLYPH_HEIGHT)
    const y1 = Math.max(y0 + 1, Math.ceil(((j + 1) * height) / DIGIT_GLYPH_HEIGHT))
    for (let i = 0; i < DIGIT_GLYPH_WIDTH; i += 1) {
      const x0 = Math.floor((i * width) / DIGIT_GLYPH_WIDTH)
      const x1 = Math.max(x0 + 1, Math.ceil(((i + 1) * width) / DIGIT_GLYPH_WIDTH))
      let sum = 0
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) sum += bitmap[y * width + x]
      }
      out[j * DIGIT_GLYPH_WIDTH + i] = sum / ((y1 - y0) * (x1 - x0))
    }
  }
  return out
}

export function countHoles(bitmap: Uint8Array, width: number, height: number): number {
  const paddedWidth = width + 2
  const paddedHeight = height + 2
  const filled = new Uint8Array(paddedWidth * paddedHeight)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (bitmap[y * width + x]) filled[(y + 1) * paddedWidth + x + 1] = 1
    }
  }
  let regions = 0
  for (let start = 0; start < filled.length; start += 1) {
    if (filled[start]) continue
    regions += 1
    const stack = [start]
    filled[start] = 1
    while (stack.length) {
      const index = stack.pop() as number
      const x = index % paddedWidth
      const y = (index - x) / paddedWidth
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < paddedWidth - 1 ? index + 1 : -1,
        y > 0 ? index - paddedWidth : -1,
        y < paddedHeight - 1 ? index + paddedWidth : -1,
      ]
      for (const next of neighbors) {
        if (next >= 0 && !filled[next]) {
          filled[next] = 1
          stack.push(next)
        }
      }
    }
  }
  return regions - 1
}

function classifyDigit(component: Component): { digit: string; margin: number } {
  const { bitmap, width, height } = componentBitmap(component)
  const glyph = boxResize(bitmap, width, height)
  const holes = countHoles(bitmap, width, height)
  const scores = Object.entries(DIGIT_TEMPLATES).map(([digit, template]) => {
    let sum = 0
    for (let index = 0; index < glyph.length; index += 1) {
      sum += Math.abs(glyph[index] - template[index] / 100)
    }
    const penalty = DIGIT_HOLES[digit] === holes ? 0 : HOLE_PENALTY
    return { digit, score: sum / glyph.length + penalty }
  }).sort((a, b) => a.score - b.score)
  return { digit: scores[0].digit, margin: scores[1].score - scores[0].score }
}

function readQuantity(image: RgbaImage, left: number, top: number): { quantity: number | null; confident: boolean } {
  const components = textComponents(image, left, top)
  const isMark = (c: Component) => {
    const w = c.x1 - c.x0 + 1
    const h = c.y1 - c.y0 + 1
    return h >= 14 && h <= 18 && w >= 16 && w <= 20 && c.y0 >= 15 && c.y0 <= 21
  }
  const marks = components.filter(isMark)
  if (!marks.length) return { quantity: null, confident: false }
  const mark = marks[marks.length - 1]
  const digits = components.filter((c) => {
    const w = c.x1 - c.x0 + 1
    const h = c.y1 - c.y0 + 1
    return c.x0 > mark.x1 - 3 && c.y0 >= 9 && c.y0 <= 16 && h >= 19 && h <= 25 && w >= 6 && w <= 20
  })
  if (!digits.length || digits.length > 5) return { quantity: null, confident: false }
  let text = ''
  let confident = true
  for (const component of digits) {
    const { digit, margin } = classifyDigit(component)
    text += digit
    if (margin < DIGIT_MIN_MARGIN) confident = false
  }
  return { quantity: Number(text), confident }
}

export function readScrollPosition(image: RgbaImage): { atTop: boolean; atEnd: boolean } {
  let first = -1
  let last = -1
  for (let y = SCROLLBAR_TRACK_TOP - 10; y <= SCROLLBAR_TRACK_BOTTOM + 10; y += 1) {
    const o = (y * image.width + SCROLLBAR_X) * 4
    const diff = Math.abs(image.data[o] - SCROLLBAR_THUMB_COLOR[0]) +
      Math.abs(image.data[o + 1] - SCROLLBAR_THUMB_COLOR[1]) +
      Math.abs(image.data[o + 2] - SCROLLBAR_THUMB_COLOR[2])
    if (diff < 25) {
      if (first < 0) first = y
      last = y
    }
  }
  // つまみが無い = スクロールしなくても全部見えている
  if (first < 0) return { atTop: true, atEnd: true }
  return {
    atTop: first <= SCROLLBAR_TRACK_TOP + SCROLLBAR_EDGE_TOLERANCE,
    atEnd: last >= SCROLLBAR_TRACK_BOTTOM - SCROLLBAR_EDGE_TOLERANCE,
  }
}

export function isSupportedAspect(width: number, height: number): boolean {
  return Math.abs(width / height - 16 / 9) < 0.02
}

export function readScreenshot(image: RgbaImage, icons: IconReference[]): ScreenshotReading {
  if (image.width !== NORMALIZED_WIDTH || image.height !== NORMALIZED_HEIGHT) {
    return { cards: [], atTop: false, atEnd: false, error: '画像の大きさが想定と違います。' }
  }
  const tops = findCardTops(image)
  if (!tops.length) {
    return { cards: [], atTop: false, atEnd: false, error: 'アイテム一覧が見つかりませんでした。PC 版の「アイテム」画面全体のスクショを使ってください。' }
  }

  const cards: CardReading[] = []
  for (const top of tops) {
    for (let column = 0; column < COLUMN_COUNT; column += 1) {
      const left = columnX(column)
      if (isEmptySlot(image, left, top)) continue
      let best = { itemId: 0, error: Number.POSITIVE_INFINITY }
      let second = Number.POSITIVE_INFINITY
      for (const icon of icons) {
        const error = iconError(image, left, top, icon.image)
        if (error < best.error) {
          second = best.error
          best = { itemId: icon.itemId, error }
        } else if (error < second) {
          second = error
        }
      }
      const iconOk = best.error <= ICON_MAX_ERROR && second / best.error >= ICON_MIN_RATIO
      if (best.error > ICON_MAX_ERROR * 1.6) {
        // 贈り物以外のアイテムなど、知らないアイコンは読み飛ばす
        cards.push({ itemId: null, quantity: null, confident: false, iconError: best.error, note: '不明なアイテム' })
        continue
      }
      const { quantity, confident } = readQuantity(image, left, top)
      cards.push({
        itemId: best.itemId,
        quantity,
        confident: iconOk && confident && quantity !== null,
        iconError: best.error,
        note: quantity === null
          ? '数が読めません'
          : !iconOk
            ? 'アイテムの判定に自信がありません'
            : !confident
              ? '数字の判定に自信がありません'
              : '',
      })
    }
  }
  return { cards, ...readScrollPosition(image), error: null }
}

export type MergedReading = {
  itemId: number
  quantity: number | null
  confident: boolean
  candidates: number[]
  note: string
}

// 複数枚のスクショで同じアイテムが写っていたら 1 つにまとめる。読みが食い違うときは要確認にする。
export function mergeReadings(readings: ScreenshotReading[]): MergedReading[] {
  const byItem = new Map<number, CardReading[]>()
  for (const reading of readings) {
    for (const card of reading.cards) {
      if (card.itemId === null) continue
      const list = byItem.get(card.itemId) ?? []
      list.push(card)
      byItem.set(card.itemId, list)
    }
  }
  const merged: MergedReading[] = []
  for (const [itemId, cards] of byItem) {
    const values = [...new Set(cards.map((card) => card.quantity).filter((v): v is number => v !== null))]
    const confidentValues = [...new Set(
      cards.filter((card) => card.confident).map((card) => card.quantity as number),
    )]
    if (confidentValues.length === 1 && values.length === 1) {
      merged.push({ itemId, quantity: confidentValues[0], confident: true, candidates: values, note: '' })
    } else if (values.length > 1) {
      merged.push({
        itemId,
        quantity: confidentValues[0] ?? values[0],
        confident: false,
        candidates: values,
        note: `スクショ間で読みが違います (${values.join(' / ')})`,
      })
    } else {
      merged.push({
        itemId,
        quantity: values[0] ?? null,
        confident: false,
        candidates: values,
        note: cards.find((card) => card.note)?.note ?? '要確認',
      })
    }
  }
  return merged
}

export type ZeroInference = {
  // 撮れている範囲の中で写っていない = 所持数 0 と言い切れるアイテム
  certainZero: number[]
  // 撮っていない範囲にあるため、0 かどうか分からないアイテム
  uncertain: number[]
  complete: boolean
  // 推定できない、または撮り漏れがある理由
  warnings: string[]
}

// ゲームの「デフォルト」の並びはアイテム ID 順で、所持数 0 のものは一覧に出ない。
// そのため、写っている範囲の中で欠けている ID は所持数 0 と判断できる。
//  - 同じスクショ内、または重なる (隣り合う) スクショ間で連続している範囲が「撮れている範囲」
//  - スクロールバーで先頭 / 末尾が写っていれば、その外側も範囲に含める
// orderedItemIds は、一覧に出うるアイテム ID を昇順に並べたもの (選択式ボックスなどは含めない)。
export function inferZeroItems(readings: ScreenshotReading[], orderedItemIds: number[]): ZeroInference {
  const indexOf = new Map(orderedItemIds.map((itemId, index) => [itemId, index]))
  const seen = new Set<number>()
  const intervals: Array<[number, number]> = []
  let orderOk = true

  for (const reading of readings) {
    if (reading.error) continue
    const indexes = reading.cards
      .map((card) => (card.itemId === null ? undefined : indexOf.get(card.itemId)))
      .filter((index): index is number => index !== undefined)
    indexes.forEach((index) => seen.add(orderedItemIds[index]))
    for (let i = 1; i < indexes.length; i += 1) {
      if (indexes[i] <= indexes[i - 1]) orderOk = false
    }
    if (!indexes.length && !(reading.atTop && reading.atEnd)) continue
    const start = reading.atTop ? 0 : Math.min(...indexes)
    const end = reading.atEnd ? orderedItemIds.length - 1 : Math.max(...indexes)
    intervals.push([start, end])
  }

  const unseen = orderedItemIds.filter((itemId) => !seen.has(itemId))
  if (!orderOk) {
    return {
      certainZero: [],
      uncertain: unseen,
      complete: false,
      warnings: ['並び順がアイテム ID 順になっていません。ゲームの並び替えを「デフォルト」にして撮ってください。'],
    }
  }

  intervals.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const [start, end] of intervals) {
    const last = merged[merged.length - 1]
    // 隣り合う ID 同士なら、その間に入るアイテムは無いので連続とみなせる
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  const covered = (index: number) => merged.some(([start, end]) => index >= start && index <= end)

  const certainZero: number[] = []
  const uncertain: number[] = []
  for (const itemId of unseen) {
    if (covered(indexOf.get(itemId) as number)) certainZero.push(itemId)
    else uncertain.push(itemId)
  }

  const warnings: string[] = []
  if (merged.length) {
    if (merged[0][0] > 0) warnings.push('一覧の先頭 (スクロールバーが一番上) が写っていません。')
    if (merged[merged.length - 1][1] < orderedItemIds.length - 1) warnings.push('一覧の末尾 (スクロールバーが一番下) が写っていません。')
    if (merged.length > 1) warnings.push('スクショ同士が重なっていない箇所があり、その間が撮れていません。')
  }
  return { certainZero, uncertain, complete: merged.length === 1 && !warnings.length, warnings }
}
