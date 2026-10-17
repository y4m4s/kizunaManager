// 所持数入力の解釈。
// - 全角数字・全角記号 (IME がオンのまま打った場合) も受け付ける
// - "12"      → 12 に置き換え
// - "+5" "-2" → 今の所持数に足す / 引く
// - "12+3-1"  → 計算結果
// - 空欄      → 0
// 解釈できない、または結果が負になる場合は null を返す。

const FULL_WIDTH_MAP: Record<string, string> = {
  '＋': '+',
  '－': '-',
  'ー': '-',
  '−': '-',
  '\u3000': ' ',
}

export function normalizeQuantityText(raw: string): string {
  return raw
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[＋－ー−\u3000]/g, (char) => FULL_WIDTH_MAP[char] ?? char)
    .trim()
}

const EXPRESSION_PATTERN = /^[+-]?\s*\d+(\s*[+-]\s*\d+)*$/

export function resolveQuantityInput(raw: string, current: number): number | null {
  const text = normalizeQuantityText(raw)
  if (text === '') {
    return 0
  }
  if (!EXPRESSION_PATTERN.test(text)) {
    return null
  }
  const relative = text.startsWith('+') || text.startsWith('-')
  let total = relative ? current : 0
  for (const match of text.matchAll(/([+-]?)\s*(\d+)/g)) {
    const value = Number(match[2])
    total += match[1] === '-' ? -value : value
  }
  if (!Number.isSafeInteger(total) || total < 0) {
    return null
  }
  return total
}

// 入力が「そのままの数値」ではなく、足し算・引き算として解釈されるときだけ true。
export function isQuantityExpression(raw: string): boolean {
  const text = normalizeQuantityText(raw)
  return text !== '' && !/^\d+$/.test(text)
}

// 貼り付けられたテキストが複数の数値 (改行・タブ・空白・カンマ区切り) なら配列で返す。
export function parseQuantityList(raw: string): number[] | null {
  const tokens = normalizeQuantityText(raw).split(/[\s,、]+/).filter(Boolean)
  if (tokens.length < 2 || !tokens.every((token) => /^\d+$/.test(token))) {
    return null
  }
  const values = tokens.map(Number)
  return values.every(Number.isSafeInteger) ? values : null
}
