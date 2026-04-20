const BOND_EXP_TABLE: Record<number, number> = {
  1: 15,
  2: 30,
  3: 30,
  4: 35,
  5: 35,
  6: 35,
  7: 40,
  8: 40,
  9: 40,
  10: 60,
  11: 90,
  12: 105,
  13: 120,
  14: 140,
  15: 160,
  16: 180,
  17: 205,
  18: 230,
  19: 255,
  20: 285,
  21: 315,
  22: 345,
  23: 375,
  24: 410,
  25: 445,
  26: 480,
  27: 520,
  28: 560,
  29: 600,
  30: 645,
  31: 690,
  32: 735,
  33: 780,
  34: 830,
  35: 880,
  36: 930,
  37: 985,
  38: 1040,
  39: 1095,
  40: 1155,
  41: 1215,
  42: 1275,
  43: 1335,
  44: 1400,
  45: 1465,
  46: 1530,
  47: 1600,
  48: 1670,
  49: 1740,
  50: 1815,
  51: 1890,
  52: 1965,
  53: 2040,
  54: 2120,
  55: 2200,
  56: 2280,
  57: 2365,
  58: 2450,
  59: 2535,
  60: 2625,
  61: 2715,
  62: 2805,
  63: 2895,
  64: 2990,
  65: 3085,
  66: 3180,
  67: 3280,
  68: 3380,
  69: 3480,
  70: 3585,
  71: 3690,
  72: 3795,
  73: 3900,
  74: 4010,
  75: 4120,
  76: 4230,
  77: 4345,
  78: 4460,
  79: 4575,
  80: 4695,
  81: 4815,
  82: 4935,
  83: 5055,
  84: 5180,
  85: 5305,
  86: 5430,
  87: 5560,
  88: 5690,
  89: 5820,
  90: 5955,
  91: 6090,
  92: 6225,
  93: 6360,
  94: 6500,
  95: 6640,
  96: 6780,
  97: 6925,
  98: 7070,
  99: 7215,
  100: 7365,
}

const MAX_BOND_LEVEL = 100

export function clampLevel(level: number): number {
  return Math.max(1, Math.min(MAX_BOND_LEVEL, Math.trunc(level)))
}

export function clampCurrentExp(level: number, currentExp: number): number {
  const required = BOND_EXP_TABLE[clampLevel(level)] ?? 0
  if (required <= 0) {
    return 0
  }
  return Math.max(0, Math.min(Math.trunc(currentExp), required - 1))
}

export function cumulativeExpToLevel(level: number): number {
  const normalized = clampLevel(level)
  let total = 0
  for (let rank = 1; rank < normalized; rank += 1) {
    total += BOND_EXP_TABLE[rank] ?? 0
  }
  return total
}

export function calcRequiredExp(
  currentLevel: number,
  currentExp: number,
  targetLevel: number,
): number {
  const current = clampLevel(currentLevel)
  const target = clampLevel(targetLevel)
  if (target <= current) {
    return 0
  }
  const normalizedExp = clampCurrentExp(current, currentExp)
  const currentTotal = cumulativeExpToLevel(current) + normalizedExp
  const targetTotal = cumulativeExpToLevel(target)
  return Math.max(0, targetTotal - currentTotal)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value)
}
