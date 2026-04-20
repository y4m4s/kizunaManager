from __future__ import annotations

from functools import lru_cache

BOND_EXP_TABLE: dict[int, int] = {
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

MAX_BOND_LEVEL = 100


def clamp_level(level: int) -> int:
    return max(1, min(MAX_BOND_LEVEL, int(level)))


def clamp_current_exp(level: int, current_exp: int) -> int:
    required = BOND_EXP_TABLE.get(clamp_level(level), 0)
    if required <= 0:
        return 0
    return max(0, min(int(current_exp), required - 1))


@lru_cache(maxsize=256)
def cumulative_exp_to_level(level: int) -> int:
    normalized = clamp_level(level)
    if normalized <= 1:
        return 0

    total = 0
    for rank in range(1, normalized):
        total += BOND_EXP_TABLE.get(rank, 0)
    return total


def calc_required_exp(current_level: int, current_exp: int, target_level: int) -> int:
    current = clamp_level(current_level)
    target = clamp_level(target_level)
    if target <= current:
        return 0

    normalized_exp = clamp_current_exp(current, current_exp)
    current_total = cumulative_exp_to_level(current) + normalized_exp
    target_total = cumulative_exp_to_level(target)
    return max(0, target_total - current_total)


def progress_ratio(current_level: int, current_exp: int, target_level: int) -> float:
    current = clamp_level(current_level)
    target = clamp_level(target_level)
    if target <= 1:
        return 1.0

    current_total = cumulative_exp_to_level(current) + clamp_current_exp(current, current_exp)
    target_total = cumulative_exp_to_level(target)
    if target_total <= 0:
        return 1.0
    return max(0.0, min(1.0, current_total / target_total))


def project_level_after_gain(current_level: int, current_exp: int, gained_exp: int) -> tuple[int, int]:
    level = clamp_level(current_level)
    exp_in_level = clamp_current_exp(level, current_exp)
    remaining_gain = max(0, int(gained_exp))

    while remaining_gain > 0 and level < MAX_BOND_LEVEL:
        required = BOND_EXP_TABLE.get(level, 0)
        needed = max(0, required - exp_in_level)
        if needed == 0:
            level += 1
            exp_in_level = 0
            continue
        if remaining_gain < needed:
            exp_in_level += remaining_gain
            remaining_gain = 0
            break
        remaining_gain -= needed
        level += 1
        exp_in_level = 0

    return level, exp_in_level


def remaining_exp_in_level(level: int, current_exp: int) -> int:
    normalized = clamp_level(level)
    required = BOND_EXP_TABLE.get(normalized, 0)
    return max(0, required - clamp_current_exp(normalized, current_exp))
