// ブルーアーカイブ PC 版「アイテム」画面のスクリーンショットから、贈り物の所持数を読み取る。
//
// 前提: 16:9 の画面全体のスクショ。処理の前に 1920x1080 へ縮小 (拡大) してから扱うので、
// 以下の座標はすべて 1080p 換算の値。
//  1. 右側の「リスト」枠の中で、カード間の灰色の隙間からカードの行位置を求める
//     (列位置は固定、行はスクロール量によって変わる)
//  2. 各カードのアイコンを、アプリが持っている贈り物アイコンと照合してアイテムを特定する
//  3. 右下の「x52」の紺色の文字を切り出し、数字の見本と照合して所持数を読む
import { DIGIT_HOLES, DIGIT_TEMPLATES } from './digitTemplates'
import { classifyDigit, connectedComponents, type Component } from './glyphs'

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
const SCROLLBAR_TRACK_COLOR = [177, 191, 202]
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
  // アイテムの特定に自信があるか (数字の読みとは別)
  iconConfident: boolean
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
function findCardTops(image: RgbaImage): number[] {
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

  return connectedComponents(mask, width, height, 25)
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
    const { digit, margin } = classifyDigit(component, DIGIT_TEMPLATES, DIGIT_HOLES)
    text += digit
    if (margin < DIGIT_MIN_MARGIN) confident = false
  }
  return { quantity: Number(text), confident }
}

function colorDistance(data: Uint8ClampedArray, offset: number, color: number[]): number {
  return Math.abs(data[offset] - color[0]) +
    Math.abs(data[offset + 1] - color[1]) +
    Math.abs(data[offset + 2] - color[2])
}

function readScrollPosition(image: RgbaImage): { atTop: boolean; atEnd: boolean } {
  let first = -1
  let last = -1
  let trackFound = false
  for (let y = SCROLLBAR_TRACK_TOP - 10; y <= SCROLLBAR_TRACK_BOTTOM + 10; y += 1) {
    const o = (y * image.width + SCROLLBAR_X) * 4
    if (colorDistance(image.data, o, SCROLLBAR_THUMB_COLOR) < 25) {
      if (first < 0) first = y
      last = y
    } else if (colorDistance(image.data, o, SCROLLBAR_TRACK_COLOR) < 15) {
      trackFound = true
    }
  }
  if (first < 0) {
    // つまみもレールも無い = スクロールしなくても全部見えている。
    // レールだけ見えてつまみが見つからないときは、位置が分からないので撮れていない扱いにする。
    return trackFound ? { atTop: false, atEnd: false } : { atTop: true, atEnd: true }
  }
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
        cards.push({ itemId: null, quantity: null, confident: false, iconConfident: false, note: '不明なアイテム' })
        continue
      }
      const { quantity, confident } = readQuantity(image, left, top)
      cards.push({
        itemId: best.itemId,
        quantity,
        confident: iconOk && confident && quantity !== null,
        iconConfident: iconOk,
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
      merged.push({ itemId, quantity: confidentValues[0], confident: true, note: '' })
    } else if (values.length > 1) {
      merged.push({
        itemId,
        quantity: confidentValues[0] ?? values[0],
        confident: false,
        note: `スクショ間で読みが違います (${values.join(' / ')})`,
      })
    } else {
      merged.push({
        itemId,
        quantity: values[0] ?? null,
        confident: false,
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
  // 判定できなかった (または自信のない) カードが入りうる範囲。中の未検出アイテムは 0 と言い切れない
  const unsureRanges: Array<[number, number]> = []
  let orderOk = true

  for (const reading of readings) {
    if (reading.error) continue
    const indexes: number[] = []
    let pendingUnsure = false
    let lastSureIndex = -1
    for (const card of reading.cards) {
      const index = card.itemId === null ? undefined : indexOf.get(card.itemId)
      if (index !== undefined) {
        seen.add(orderedItemIds[index])
        indexes.push(index)
      }
      if (index === undefined || !card.iconConfident) {
        pendingUnsure = true
        continue
      }
      if (pendingUnsure) {
        unsureRanges.push([lastSureIndex + 1, index - 1])
        pendingUnsure = false
      }
      lastSureIndex = index
    }
    if (pendingUnsure) unsureRanges.push([lastSureIndex + 1, orderedItemIds.length - 1])
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
      warnings: [
        '並び順がアイテム ID 順になっていないため、写っていない贈り物は 0 にしていません。',
        'ゲームの並び替えが「デフォルト」か確かめてください。判定を誤ったカードがある場合も、この表示になります。',
      ],
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
  const unsure = (index: number) => unsureRanges.some(([start, end]) => index >= start && index <= end)

  const certainZero: number[] = []
  const uncertain: number[] = []
  let protectedCount = 0
  for (const itemId of unseen) {
    const index = indexOf.get(itemId) as number
    if (covered(index) && !unsure(index)) {
      certainZero.push(itemId)
    } else {
      uncertain.push(itemId)
      if (covered(index)) protectedCount += 1
    }
  }

  const warnings: string[] = []
  if (protectedCount) {
    warnings.push('判定できなかったカードがあるため、その近くの写っていない贈り物は 0 にしていません。')
  }
  if (merged.length) {
    if (merged[0][0] > 0) warnings.push('一覧の先頭 (スクロールバーが一番上) が写っていません。')
    if (merged[merged.length - 1][1] < orderedItemIds.length - 1) warnings.push('一覧の末尾 (スクロールバーが一番下) が写っていません。')
    if (merged.length > 1) warnings.push('スクショ同士が重なっていない箇所があり、その間が撮れていません。')
  }
  return { certainZero, uncertain, complete: merged.length === 1 && !warnings.length, warnings }
}
