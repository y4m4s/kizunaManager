// ブルーアーカイブ PC 版「生徒リスト」画面のスクリーンショットから、生徒ごとの絆ランクを読み取る。
//
// 座標はすべて 1920x1080 に揃えた画像での値。
//  1. カード下端と名前欄の間にある背景色の帯から、カードの行位置を求める (列は固定、行はスクロール次第)
//  2. 生徒アイコン (顔まわりの切り抜き) とカードの絵を照合して生徒を特定する
//     - カードへの収まり方が生徒ごとに少し違うので、まず決まった位置で全員と粗く比べて候補を絞り、
//       上位の候補だけ大きさと位置を細かく合わせて比べる
//  3. ハートの右の白い数字を切り出し、数字の見本と照合して絆ランクを読む
// 上下が画面外に切れたカードも、数字が見えていて絵が十分写っていれば読む。
import { BOND_DIGIT_HOLES, BOND_DIGIT_TEMPLATES } from './bondDigitTemplates'
import { classifyDigit, connectedComponents, type Component } from './glyphs'
import { NORMALIZED_HEIGHT, NORMALIZED_WIDTH, type RgbaImage } from './recognize'

const BACKGROUND = [243, 251, 253]
const BACKGROUND_TOLERANCE = 12
const COLUMN_X0 = 79
const COLUMN_PITCH = 294.4
const COLUMN_COUNT = 6
const ROW_PITCH = 402
const VIEW_TOP = 262
const VIEW_BOTTOM = 1031
// カード下の帯の始まり (アンカー) から見た、カードの絵の位置
const CARD_IMAGE_WIDTH = 265
const CARD_IMAGE_HEIGHT = 296
const IMAGE_TOP_FROM_ANCHOR = 306
// 絵の下部はハートと数字の帯。アイコン照合には帯より上だけ使う
const ICON_AREA_BOTTOM = 240
const MIN_VISIBLE_HEIGHT = 120

// アイコンのおおよその収まり方 (粗い比較用)。生徒ごとの差を吸収するため 2 通り試して良い方を採る
const COARSE_PLACEMENTS = [
  { size: 223, x: 22, y: 16 },
  { size: 206, x: 30, y: 26 },
]
const COARSE_STEP = 6
const CANDIDATE_COUNT = 5
const REFINE_SIZES = [192, 198, 204, 210, 216, 222, 228, 234]
const REFINE_X = [8, 12, 16, 20, 24, 28, 32, 36, 40]
const REFINE_Y = [0, 4, 8, 12, 16, 20, 24, 28, 32]

// 絆ランクの数字 (アンカーからの相対位置)
const DIGIT_LEFT = 110
const DIGIT_RIGHT = 230
const DIGIT_TOP = -62
const DIGIT_BOTTOM = -12
const DIGIT_MIN_MARGIN = 0.03

// 判定のしきい値 (4 枚のスクショで、正解の誤差は最大 22、次点との比は最小 1.58)
const ICON_MAX_ERROR = 32
const ICON_MIN_RATIO = 1.3

export type StudentIconSource = {
  studentId: number
  // 元のアイコン画像 (正方形)。大きさを変えた版はここから作る
  bitmap: ImageBitmap
  // 粗い比較用: COARSE_PLACEMENTS ごとに、カード上の COARSE_STEP 間隔の点に重なるアイコンの画素 (RGBA)
  coarse: Uint8ClampedArray[]
}

const COARSE_ROWS = Math.ceil(CARD_IMAGE_HEIGHT / COARSE_STEP)
const COARSE_COLUMNS = Math.ceil(CARD_IMAGE_WIDTH / COARSE_STEP)

// 粗い比較用の点の画素を、配置ごとに取り出す (アイコン全体は保持しない)
export function sampleCoarsePlacements(drawn: (size: number) => RgbaImage): Uint8ClampedArray[] {
  return COARSE_PLACEMENTS.map(({ size, x: offsetX, y: offsetY }) => {
    const icon = drawn(size)
    const samples = new Uint8ClampedArray(COARSE_ROWS * COARSE_COLUMNS * 4)
    for (let row = 0; row < COARSE_ROWS; row += 1) {
      const iy = row * COARSE_STEP - offsetY
      if (iy < 0 || iy >= icon.height) continue
      for (let column = 0; column < COARSE_COLUMNS; column += 1) {
        const ix = column * COARSE_STEP - offsetX
        if (ix < 0 || ix >= icon.width) continue
        const from = (iy * icon.width + ix) * 4
        const to = (row * COARSE_COLUMNS + column) * 4
        samples[to] = icon.data[from]
        samples[to + 1] = icon.data[from + 1]
        samples[to + 2] = icon.data[from + 2]
        samples[to + 3] = icon.data[from + 3]
      }
    }
    return samples
  })
}

export type StudentCardReading = {
  studentId: number | null
  level: number | null
  confident: boolean
  note: string
}

export type StudentScreenshotReading = {
  cards: StudentCardReading[]
  error: string | null
}

type CardSlot = {
  left: number
  top: number
  anchor: number
  visibleFrom: number
}

function isBackground(data: Uint8ClampedArray, offset: number): boolean {
  return Math.abs(data[offset] - BACKGROUND[0]) +
    Math.abs(data[offset + 1] - BACKGROUND[1]) +
    Math.abs(data[offset + 2] - BACKGROUND[2]) < BACKGROUND_TOLERANCE
}

function columnX(column: number): number {
  return COLUMN_X0 + Math.round(column * COLUMN_PITCH)
}

function backgroundRatioOfRow(image: RgbaImage, y: number): number {
  const left = columnX(0)
  const right = columnX(COLUMN_COUNT - 1) + CARD_IMAGE_WIDTH
  let count = 0
  for (let x = left; x < right; x += 1) {
    if (isBackground(image.data, (y * image.width + x) * 4)) count += 1
  }
  return count / (right - left)
}

// カード下端の直下にある背景色の帯 (高さ 8〜16px) の開始 y を、行の間隔に合うものだけ返す
function findCardAnchors(image: RgbaImage): number[] {
  const ratios = new Map<number, number>()
  const ratio = (y: number) => {
    let value = ratios.get(y)
    if (value === undefined) {
      value = backgroundRatioOfRow(image, y)
      ratios.set(y, value)
    }
    return value
  }
  const found: number[] = []
  for (let y = VIEW_TOP; y < Math.min(VIEW_BOTTOM + 20, image.height - 1); y += 1) {
    if (ratio(y) <= 0.9 || ratio(y - 1) > 0.9) continue
    const start = y
    while (y < image.height - 1 && ratio(y) > 0.9) y += 1
    const length = y - start
    if (length >= 8 && length <= 16 && ratio(start - 15) < 0.75) found.push(start)
  }
  let best: number[] = []
  for (const base of found) {
    const group = found.filter((anchor) => {
      const rows = (anchor - base) / ROW_PITCH
      return Math.abs(rows - Math.round(rows)) * ROW_PITCH <= 3
    })
    if (group.length > best.length) best = group
  }
  return best
}

function findCardSlots(image: RgbaImage): CardSlot[] {
  const slots: CardSlot[] = []
  for (const anchor of findCardAnchors(image)) {
    const top = anchor - IMAGE_TOP_FROM_ANCHOR
    const bottom = top + CARD_IMAGE_HEIGHT
    if (bottom > VIEW_BOTTOM) continue
    const visibleTop = Math.max(top, VIEW_TOP)
    if (bottom - visibleTop < MIN_VISIBLE_HEIGHT) continue
    for (let column = 0; column < COLUMN_COUNT; column += 1) {
      const left = columnX(column)
      // 最終行の空きマス
      let background = 0
      let total = 0
      for (let y = anchor - 100; y < anchor - 20; y += 4) {
        for (let x = left + 20; x < left + 240; x += 4) {
          total += 1
          if (isBackground(image.data, (y * image.width + x) * 4)) background += 1
        }
      }
      if (background / total >= 0.5) continue
      slots.push({ left, top, anchor, visibleFrom: visibleTop - top })
    }
  }
  return slots
}

// 照合に使う画素か (カード内の座標)。左上のピン、右下の武器マーク、数字の帯は使わない
function usable(y: number, x: number, visibleFrom: number): boolean {
  if (y < visibleFrom || y >= ICON_AREA_BOTTOM) return false
  if (y < 44 && x < 44) return false
  if (y >= 188 && x >= 212) return false
  return true
}

function iconError(
  image: RgbaImage,
  slot: CardSlot,
  icon: RgbaImage,
  offsetX: number,
  offsetY: number,
  step: number,
): number {
  let sum = 0
  let count = 0
  for (let y = 0; y < CARD_IMAGE_HEIGHT; y += step) {
    const iy = y - offsetY
    if (iy < 0 || iy >= icon.height) continue
    for (let x = 0; x < CARD_IMAGE_WIDTH; x += step) {
      if (!usable(y, x, slot.visibleFrom)) continue
      const ix = x - offsetX
      if (ix < 0 || ix >= icon.width) continue
      const io = (iy * icon.width + ix) * 4
      if (icon.data[io + 3] <= 230) continue
      const so = ((slot.top + y) * image.width + slot.left + x) * 4
      sum += Math.abs(image.data[so] - icon.data[io]) +
        Math.abs(image.data[so + 1] - icon.data[io + 1]) +
        Math.abs(image.data[so + 2] - icon.data[io + 2])
      count += 3
    }
  }
  return count >= 300 ? sum / count : Number.POSITIVE_INFINITY
}

function coarseError(image: RgbaImage, slot: CardSlot, samples: Uint8ClampedArray): number {
  let sum = 0
  let count = 0
  for (let row = 0; row < COARSE_ROWS; row += 1) {
    const y = row * COARSE_STEP
    for (let column = 0; column < COARSE_COLUMNS; column += 1) {
      const x = column * COARSE_STEP
      if (!usable(y, x, slot.visibleFrom)) continue
      const io = (row * COARSE_COLUMNS + column) * 4
      if (samples[io + 3] <= 230) continue
      const so = ((slot.top + y) * image.width + slot.left + x) * 4
      sum += Math.abs(image.data[so] - samples[io]) +
        Math.abs(image.data[so + 1] - samples[io + 1]) +
        Math.abs(image.data[so + 2] - samples[io + 2])
      count += 3
    }
  }
  return count >= 150 ? sum / count : Number.POSITIVE_INFINITY
}

export type ScaledIconProvider = (source: StudentIconSource, size: number) => RgbaImage

function refineIcon(
  image: RgbaImage,
  slot: CardSlot,
  source: StudentIconSource,
  scaledIcon: ScaledIconProvider,
): number {
  let best = { error: Number.POSITIVE_INFINITY, size: COARSE_PLACEMENTS[0].size, x: COARSE_PLACEMENTS[0].x, y: COARSE_PLACEMENTS[0].y }
  for (const size of REFINE_SIZES) {
    const icon = scaledIcon(source, size)
    for (const x of REFINE_X) {
      for (const y of REFINE_Y) {
        const error = iconError(image, slot, icon, x, y, 4)
        if (error < best.error) best = { error, size, x, y }
      }
    }
  }
  const coarse = best
  for (let size = coarse.size - 4; size <= coarse.size + 4; size += 2) {
    const icon = scaledIcon(source, size)
    for (let x = coarse.x - 2; x <= coarse.x + 2; x += 1) {
      for (let y = coarse.y - 2; y <= coarse.y + 2; y += 1) {
        const error = iconError(image, slot, icon, x, y, 3)
        if (error < best.error) best = { error, size, x, y }
      }
    }
  }
  return best.error
}

function readLevel(image: RgbaImage, slot: CardSlot): { level: number | null; confident: boolean } {
  const width = DIGIT_RIGHT - DIGIT_LEFT
  const height = DIGIT_BOTTOM - DIGIT_TOP
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = ((slot.anchor + DIGIT_TOP + y) * image.width + slot.left + DIGIT_LEFT + x) * 4
      const r = image.data[o]
      const g = image.data[o + 1]
      const b = image.data[o + 2]
      const min = Math.min(r, g, b)
      const max = Math.max(r, g, b)
      if (min > 200 && max - min < 40) mask[y * width + x] = 1
    }
  }
  const digits = connectedComponents(mask, width, height, 40).filter((c: Component) => {
    const w = c.x1 - c.x0 + 1
    const h = c.y1 - c.y0 + 1
    return h >= 22 && h <= 30 && w >= 6 && w <= 20
  })
  if (!digits.length || digits.length > 3) return { level: null, confident: false }
  let text = ''
  let confident = true
  for (const component of digits) {
    const { digit, margin } = classifyDigit(component, BOND_DIGIT_TEMPLATES, BOND_DIGIT_HOLES)
    text += digit
    if (margin < DIGIT_MIN_MARGIN) confident = false
  }
  const level = Number(text)
  if (level < 1 || level > 100) return { level: null, confident: false }
  return { level, confident }
}

export async function readStudentScreenshot(
  image: RgbaImage,
  sources: StudentIconSource[],
  scaledIcon: ScaledIconProvider,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<StudentScreenshotReading> {
  if (image.width !== NORMALIZED_WIDTH || image.height !== NORMALIZED_HEIGHT) {
    return { cards: [], error: '画像の大きさが想定と違います。' }
  }
  const slots = findCardSlots(image)
  if (!slots.length) {
    return { cards: [], error: '生徒リストが見つかりませんでした。PC 版の「生徒」画面全体のスクショを使ってください。' }
  }

  const cards: StudentCardReading[] = []
  for (let index = 0; index < slots.length; index += 1) {
    // ダイアログが閉じられたら、残りのカードは読まずにやめる
    signal?.throwIfAborted()
    const slot = slots[index]
    // 1 段目: 決まった位置で全員と粗く比べる
    const coarse = sources
      .map((source) => ({
        source,
        error: Math.min(...source.coarse.map((samples) => coarseError(image, slot, samples))),
      }))
      .sort((a, b) => a.error - b.error)
      .slice(0, CANDIDATE_COUNT)
    // 2 段目: 上位の候補だけ、大きさと位置を合わせて比べる
    const refined = coarse
      .map(({ source }) => ({ source, error: refineIcon(image, slot, source, scaledIcon) }))
      .sort((a, b) => a.error - b.error)
    const best = refined[0]
    const second = refined[1]?.error ?? Number.POSITIVE_INFINITY
    const iconOk = best.error <= ICON_MAX_ERROR && second / best.error >= ICON_MIN_RATIO
    const { level, confident } = readLevel(image, slot)
    cards.push({
      studentId: best.error <= ICON_MAX_ERROR * 1.6 ? best.source.studentId : null,
      level,
      confident: iconOk && confident && level !== null,
      note: level === null
        ? '絆ランクが読めません'
        : !iconOk
          ? '生徒の判定に自信がありません'
          : !confident
            ? '数字の判定に自信がありません'
            : '',
    })
    onProgress?.(index + 1, slots.length)
    // 1 枚ごとに描画へ譲り、画面が固まらないようにする
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { cards, error: null }
}

export type MergedStudentReading = {
  studentId: number
  level: number | null
  confident: boolean
  note: string
}

// 複数枚に同じ生徒が写っていたら 1 つにまとめる。読みが食い違えば要確認にする。
export function mergeStudentReadings(readings: StudentScreenshotReading[]): MergedStudentReading[] {
  const byStudent = new Map<number, StudentCardReading[]>()
  for (const reading of readings) {
    for (const card of reading.cards) {
      if (card.studentId === null) continue
      const list = byStudent.get(card.studentId) ?? []
      list.push(card)
      byStudent.set(card.studentId, list)
    }
  }
  const merged: MergedStudentReading[] = []
  for (const [studentId, cards] of byStudent) {
    const values = [...new Set(cards.map((card) => card.level).filter((v): v is number => v !== null))]
    const confident = cards.some((card) => card.confident) && values.length === 1
    merged.push({
      studentId,
      level: values[0] ?? null,
      confident,
      note: values.length > 1
        ? `スクショ間で読みが違います (${values.join(' / ')})`
        : confident ? '' : cards.find((card) => card.note)?.note ?? '要確認',
    })
  }
  return merged
}
