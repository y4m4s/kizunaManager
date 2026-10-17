// スクショ読み取りで共通に使う、文字 (数字) の切り出しと照合の処理
import { DIGIT_GLYPH_HEIGHT, DIGIT_GLYPH_WIDTH } from './digitTemplates'

export type Component = {
  x0: number
  y0: number
  x1: number
  y1: number
  pixels: Array<[number, number]>
}

// 8 近傍でつながった画素の塊を、左から順に返す
export function connectedComponents(mask: Uint8Array, width: number, height: number, minPixels: number): Component[] {
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
    if (component.pixels.length >= minPixels) components.push(component)
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

const HOLE_PENALTY = 0.08

// 数字 1 文字を見本と照合する。margin は 1 位と 2 位の差 (大きいほど確か)。
export function classifyDigit(
  component: Component,
  templates: Record<string, number[]>,
  holesByDigit: Record<string, number>,
): { digit: string; margin: number } {
  const { bitmap, width, height } = componentBitmap(component)
  const glyph = boxResize(bitmap, width, height)
  const holes = countHoles(bitmap, width, height)
  const scores = Object.entries(templates).map(([digit, template]) => {
    let sum = 0
    for (let index = 0; index < glyph.length; index += 1) {
      sum += Math.abs(glyph[index] - template[index] / 100)
    }
    const penalty = holesByDigit[digit] === holes ? 0 : HOLE_PENALTY
    return { digit, score: sum / glyph.length + penalty }
  }).sort((a, b) => a.score - b.score)
  return { digit: scores[0].digit, margin: scores[1].score - scores[0].score }
}
