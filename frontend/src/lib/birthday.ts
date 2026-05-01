const BIRTHDAY_PATTERN = /(\d{1,2})[/\-月](\d{1,2})/

function parseBirthday(value: string): [number, number] | null {
  const text = value.trim()
  if (!text) return null

  if (/^\d{4}$/.test(text)) {
    const month = Number(text.slice(0, 2))
    const day = Number(text.slice(2))
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return [month, day]
  }

  const matched = text.match(BIRTHDAY_PATTERN)
  if (!matched) return null
  const month = Number(matched[1])
  const day = Number(matched[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return [month, day]
}

export function daysUntilBirthday(birthday: string, today = new Date()): number | null {
  const parsed = parseBirthday(birthday)
  if (!parsed) return null
  const [month, day] = parsed
  const year = today.getFullYear()
  let candidate = new Date(year, month - 1, day)
  if (Number.isNaN(candidate.getTime())) return null
  const todayMidnight = new Date(year, today.getMonth(), today.getDate())
  if (candidate < todayMidnight) candidate = new Date(year + 1, month - 1, day)
  return Math.max(0, Math.round((candidate.getTime() - todayMidnight.getTime()) / 86400000))
}

export function formatBirthday(birthday: string): string {
  const parsed = parseBirthday(birthday)
  if (!parsed) return '-'
  const [month, day] = parsed
  return `${month}/${day}`
}
