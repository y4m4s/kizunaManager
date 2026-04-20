from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import date

from src.bond_calculator import calc_required_exp, project_level_after_gain
from src.config import PRIORITY_ORDER, SELECTABLE_BOX_ITEM_ID, SELECTABLE_BOX_KEY, SELECTABLE_BOX_NAME

EFFECT_ORDER = {
    "extra_large": 4,
    "large": 3,
    "medium": 2,
    "small": 1,
    "bouquet": 2,
}

EFFECT_LABELS = {
    "extra_large": "特大",
    "large": "大",
    "medium": "中",
    "small": "小",
    "bouquet": "固定",
}

GIFT_EXP_VALUES = {
    "SR": {
        "small": 20,
        "medium": 40,
        "large": 60,
        "extra_large": 80,
    },
    "SSR": {
        "medium": 120,
        "large": 180,
        "extra_large": 240,
    },
}

CAFE_TAP_BOND_EXP = 15
SCHEDULE_BOND_EXP = 25
SCHEDULE_BONUS_CHANCE = 0.25
SCHEDULE_BONUS_EXP = 25
BIRTHDAY_PATTERN = re.compile(r"(\d{1,2})\D+(\d{1,2})")


def _as_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item]
    if isinstance(value, str):
        try:
            loaded = json.loads(value)
        except json.JSONDecodeError:
            return [value] if value else []
        if isinstance(loaded, list):
            return [str(item) for item in loaded if item]
    return []


def _is_bouquet(item: dict) -> bool:
    return str(item.get("gift_kind", "")).lower() == "bouquet"


def _student_birthday(student: dict) -> str:
    birthday = student.get("birthday")
    if birthday:
        return str(birthday)
    raw_json = student.get("raw_json")
    if isinstance(raw_json, dict):
        return str(raw_json.get("Birthday") or raw_json.get("BirthDay") or "")
    return ""


def _parse_birthday(value: object) -> tuple[int, int] | None:
    text = str(value or "").strip()
    if not text:
        return None

    if text.isdigit() and len(text) == 4:
        month = int(text[:2])
        day = int(text[2:])
        if 1 <= month <= 12 and 1 <= day <= 31:
            return month, day

    match = BIRTHDAY_PATTERN.search(text)
    if match is None:
        return None

    month = int(match.group(1))
    day = int(match.group(2))
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return None
    return month, day


def _days_until_next_birthday(student: dict, today: date | None = None) -> int:
    parsed = _parse_birthday(_student_birthday(student))
    if parsed is None:
        return 0

    current_day = today or date.today()
    month, day = parsed
    year = current_day.year

    while True:
        try:
            birthday = date(year, month, day)
        except ValueError:
            year += 1
            continue
        if birthday < current_day:
            year += 1
            continue
        return (birthday - current_day).days


def _planned_passive_exp(
    student: dict,
    daily_cafe_taps: int,
    daily_schedules: int,
    today: date | None = None,
) -> tuple[int, int]:
    cafe_exp = max(0, int(daily_cafe_taps)) * CAFE_TAP_BOND_EXP
    schedule_count = max(0, int(daily_schedules))
    schedule_exp = schedule_count * (
        SCHEDULE_BOND_EXP + (SCHEDULE_BONUS_CHANCE * SCHEDULE_BONUS_EXP)
    )
    total_exp = cafe_exp + schedule_exp
    if total_exp <= 0:
        return 0, 0

    days_until_birthday = _days_until_next_birthday(student, today=today)
    # Schedule bonus is probabilistic, so we use expected value and round to
    # the nearest whole affection point for planning.
    return int((total_exp * days_until_birthday) + 0.5), days_until_birthday


def _is_selectable_box(item: dict) -> bool:
    try:
        if int(item.get("id", 0) or 0) == SELECTABLE_BOX_ITEM_ID:
            return True
    except (TypeError, ValueError):
        pass
    return (
        str(item.get("box_type", "")).lower() == SELECTABLE_BOX_KEY
        or str(item.get("gift_kind", "")).lower() == "gift_box"
        or str(item.get("name", "")) == SELECTABLE_BOX_NAME
    )


def _gift_rarity(item: dict) -> str:
    return str(item.get("rarity", "")).upper()


def _is_universal_favorite_gift(item: dict) -> bool:
    return _gift_rarity(item) == "SSR" and not _is_bouquet(item) and int(item.get("exp_value", 0) or 0) == 20


def _bouquet_fixed_exp(item: dict) -> int:
    base_exp = max(0, int(item.get("exp_value", 0) or 0))
    if base_exp == 20:
        return 180
    return base_exp


def get_match_display_group(item: dict) -> str:
    if _is_bouquet(item):
        return "bouquet"
    rarity = _gift_rarity(item)
    if rarity == "SSR":
        return "ssr"
    if rarity == "SR":
        return "sr"
    return "default"


def is_search_visible_match(item: dict, effect: str) -> bool:
    if _is_bouquet(item):
        return False

    rarity = _gift_rarity(item)
    if rarity == "SSR":
        return effect in {"large", "extra_large"}
    if rarity == "SR":
        return effect in {"medium", "large", "extra_large"}
    return False


def is_optimization_visible_match(item: dict, effect: str) -> bool:
    if _is_bouquet(item):
        return True

    rarity = _gift_rarity(item)
    if rarity == "SSR":
        return effect in {"large", "extra_large"}
    if rarity == "SR":
        return effect in {"medium", "large", "extra_large"}
    return False


def _matched_preference_count(student: dict, item: dict) -> int:
    student_tags = set(_as_list(student.get("favor_item_tags")))
    student_unique = set(_as_list(student.get("favor_item_unique_tags")))
    item_tags = set(_as_list(item.get("tags")))
    return len((student_tags | student_unique) & item_tags)


def _base_gift_effect(student: dict, item: dict) -> str:
    if _is_bouquet(item):
        return "bouquet"
    if _is_universal_favorite_gift(item):
        return "large"

    rarity = _gift_rarity(item)
    matched_count = _matched_preference_count(student, item)

    if rarity == "SSR":
        if matched_count >= 2:
            return "extra_large"
        if matched_count == 1:
            return "large"
        return "medium"

    if matched_count >= 3:
        return "extra_large"
    if matched_count == 2:
        return "large"
    if matched_count == 1:
        return "medium"
    return "small"


def _base_gift_exp(student: dict, item: dict) -> tuple[str, int]:
    effect = _base_gift_effect(student, item)

    if effect == "bouquet":
        return effect, _bouquet_fixed_exp(item)

    rarity = _gift_rarity(item)
    exp_by_effect = GIFT_EXP_VALUES.get(rarity, {})
    fixed_exp = exp_by_effect.get(effect)
    if fixed_exp is not None:
        return effect, fixed_exp

    base_exp = max(0, int(item.get("exp_value", 0) or 0))
    return effect, base_exp


def _best_selectable_box_exp(student: dict, items_by_id: dict[int, dict] | None) -> tuple[str, int]:
    if not items_by_id:
        return "large", GIFT_EXP_VALUES["SR"]["large"]

    best_effect = "small"
    best_exp = GIFT_EXP_VALUES["SR"]["small"]
    best_key = (EFFECT_ORDER[best_effect], best_exp, "")

    for candidate in items_by_id.values():
        if _is_bouquet(candidate) or _is_selectable_box(candidate) or _gift_rarity(candidate) != "SR":
            continue
        effect, gained_exp = _base_gift_exp(student, candidate)
        key = (EFFECT_ORDER.get(effect, 0), gained_exp, str(candidate.get("name", "")))
        if key > best_key:
            best_key = key
            best_effect = effect
            best_exp = gained_exp

    return best_effect, best_exp


def get_gift_effect(student: dict, item: dict, items_by_id: dict[int, dict] | None = None) -> str:
    if _is_selectable_box(item):
        effect, _ = _best_selectable_box_exp(student, items_by_id)
        return effect
    return _base_gift_effect(student, item)


def calculate_gift_exp(
    student: dict,
    item: dict,
    items_by_id: dict[int, dict] | None = None,
) -> tuple[str, int]:
    if _is_selectable_box(item):
        return _best_selectable_box_exp(student, items_by_id)
    return _base_gift_exp(student, item)


def sort_matching_items(
    student: dict,
    items: list[dict],
    inventory: dict[int, int],
    visible_only: bool = False,
) -> list[dict]:
    ranked: list[dict] = []
    for item in items:
        effect, gained_exp = calculate_gift_exp(student, item)
        if visible_only and not is_search_visible_match(item, effect):
            continue
        ranked.append(
            {
                **item,
                "effect": effect,
                "effect_label": EFFECT_LABELS[effect],
                "gained_exp": gained_exp,
                "quantity": int(inventory.get(int(item["id"]), 0)),
                "display_group": get_match_display_group(item),
            }
        )

    ranked.sort(
        key=lambda row: (
            -EFFECT_ORDER.get(row["effect"], 0),
            -row["gained_exp"],
            -row["quantity"],
            row["name"],
        )
    )
    return ranked


def _build_plan_state(
    plan: dict,
    student: dict | None,
    daily_cafe_taps: int = 0,
    daily_schedules: int = 0,
    today: date | None = None,
) -> dict:
    passive_exp = 0
    days_until_birthday = 0
    if student is not None:
        passive_exp, days_until_birthday = _planned_passive_exp(
            student,
            daily_cafe_taps=daily_cafe_taps,
            daily_schedules=daily_schedules,
            today=today,
        )
    required_exp = int(plan.get("required_exp", 0))
    return {
        **plan,
        "birthday": "" if student is None else _student_birthday(student),
        "days_until_birthday": days_until_birthday,
        "passive_exp": passive_exp,
        "remaining_exp": max(0, required_exp - passive_exp),
        "allocated_exp": 0,
        "allocated_items": [],
    }


def _priority_sort_key(plan: dict) -> tuple[int, int, str]:
    return (
        -PRIORITY_ORDER.get(str(plan.get("priority", "priority")), 0),
        -int(plan.get("remaining_exp", 0)),
        str(plan.get("student_name", "")),
    )


def _pick_best_item(
    student: dict,
    remaining_exp: int,
    stock: dict[int, int],
    items_by_id: dict[int, dict],
) -> tuple[int, dict] | None:
    best: tuple[int, dict] | None = None
    best_key: tuple[int, int, int, int, int, str] | None = None

    for item_id, quantity in stock.items():
        if quantity <= 0:
            continue
        item = items_by_id.get(item_id)
        if not item:
            continue
        effect, gained_exp = calculate_gift_exp(student, item, items_by_id)
        if not is_optimization_visible_match(item, effect):
            continue

        useful_exp = min(gained_exp, max(0, remaining_exp))
        waste = max(0, gained_exp - max(0, remaining_exp))
        key = (
            EFFECT_ORDER.get(effect, 0),
            useful_exp,
            -waste,
            gained_exp,
            quantity,
            str(item.get("name", "")),
        )
        if best_key is None or key > best_key:
            best_key = key
            best = (
                item_id,
                {
                    **item,
                    "effect": effect,
                    "effect_label": EFFECT_LABELS[effect],
                    "gained_exp": gained_exp,
                },
            )
    return best


def _append_allocation(plan_state: dict, item: dict) -> None:
    for allocation in plan_state["allocated_items"]:
        if allocation["item_id"] == item["id"] and allocation["effect"] == item["effect"]:
            allocation["count"] += 1
            allocation["total_exp"] += item["gained_exp"]
            return

    plan_state["allocated_items"].append(
        {
            "item_id": item["id"],
            "item_name": item["name"],
            "icon_path": item.get("icon_path", ""),
            "rarity": item.get("rarity", ""),
            "gift_kind": item.get("gift_kind", "gift"),
            "count": 1,
            "effect": item["effect"],
            "effect_label": item["effect_label"],
            "exp_per_item": item["gained_exp"],
            "total_exp": item["gained_exp"],
        }
    )


def _allocate_to_plan(plan_state: dict, student: dict, stock: dict[int, int], items_by_id: dict[int, dict]) -> bool:
    best = _pick_best_item(student, int(plan_state.get("remaining_exp", 0)), stock, items_by_id)
    if best is None:
        return False

    item_id, item = best
    stock[item_id] -= 1
    plan_state["allocated_exp"] += item["gained_exp"]
    plan_state["remaining_exp"] = max(0, plan_state["remaining_exp"] - item["gained_exp"])
    _append_allocation(plan_state, item)
    return True


def _build_candidate(
    plan_state: dict,
    student: dict,
    item: dict,
    items_by_id: dict[int, dict],
    strategy: str,
) -> dict | None:
    effect, gained_exp = calculate_gift_exp(student, item, items_by_id)
    if not is_optimization_visible_match(item, effect):
        return None

    remaining_exp = int(plan_state.get("remaining_exp", 0))
    if remaining_exp <= 0:
        return None

    useful_exp = min(gained_exp, remaining_exp)
    waste = max(0, gained_exp - remaining_exp)
    priority_rank = PRIORITY_ORDER.get(str(plan_state.get("priority", "priority")), 0)
    required_exp = max(1, int(plan_state.get("required_exp", 0)))
    completion_ratio = float(plan_state.get("allocated_exp", 0)) / required_exp

    if strategy == "balanced":
        score = (
            EFFECT_ORDER.get(effect, 0),
            useful_exp,
            -completion_ratio,
            priority_rank,
            -waste,
            remaining_exp,
            gained_exp,
        )
    else:
        score = (
            EFFECT_ORDER.get(effect, 0),
            priority_rank,
            useful_exp,
            -waste,
            remaining_exp,
            gained_exp,
        )

    return {
        "plan_state": plan_state,
        "item": {
            **item,
            "effect": effect,
            "effect_label": EFFECT_LABELS[effect],
            "gained_exp": gained_exp,
        },
        "score": score,
    }


def _pick_best_candidate_for_item(
    item_id: int,
    states: list[dict],
    students_by_id: dict[int, dict],
    items_by_id: dict[int, dict],
    strategy: str,
) -> dict | None:
    item = items_by_id.get(item_id)
    if item is None:
        return None

    best_candidate: dict | None = None
    best_score: tuple | None = None
    for state in states:
        if int(state.get("remaining_exp", 0)) <= 0:
            continue
        student = students_by_id.get(int(state.get("student_id", 0)))
        if student is None:
            continue
        candidate = _build_candidate(state, student, item, items_by_id, strategy)
        if candidate is None:
            continue
        score = candidate["score"]
        if best_score is None or score > best_score:
            best_candidate = candidate
            best_score = score

    return best_candidate


def _pick_next_global_candidate(
    states: list[dict],
    stock: dict[int, int],
    students_by_id: dict[int, dict],
    items_by_id: dict[int, dict],
    strategy: str,
) -> dict | None:
    best_candidate: dict | None = None
    best_score: tuple | None = None

    for item_id, quantity in stock.items():
        if quantity <= 0:
            continue
        candidate = _pick_best_candidate_for_item(item_id, states, students_by_id, items_by_id, strategy)
        if candidate is None:
            continue
        score = candidate["score"]
        if best_score is None or score > best_score:
            best_candidate = candidate
            best_score = score

    return best_candidate


def _apply_candidate(candidate: dict, stock: dict[int, int]) -> None:
    plan_state = candidate["plan_state"]
    item = candidate["item"]
    item_id = int(item["id"])
    stock[item_id] -= 1
    plan_state["allocated_exp"] += int(item["gained_exp"])
    plan_state["remaining_exp"] = max(0, int(plan_state["remaining_exp"]) - int(item["gained_exp"]))
    _append_allocation(plan_state, item)


def _craftable_selectable_box_count(leftover_rows: list[dict]) -> tuple[int, int]:
    orange_item_total = 0
    for item in leftover_rows:
        if _is_selectable_box(item) or _is_bouquet(item):
            continue
        if _gift_rarity(item) != "SR":
            continue
        if str(item.get("gift_kind", "gift")).lower() != "gift":
            continue
        orange_item_total += max(0, int(item.get("quantity", 0)))
    return orange_item_total // 2, orange_item_total


def _leftover_sort_key(item_id: int, item: dict) -> tuple[int, str]:
    if _gift_rarity(item) == "SSR" and not _is_bouquet(item):
        group_rank = 0
    elif _gift_rarity(item) == "SR" and not _is_bouquet(item) and not _is_selectable_box(item):
        group_rank = 1
    elif _is_bouquet(item):
        group_rank = 2
    elif _is_selectable_box(item):
        group_rank = 3
    else:
        group_rank = 4
    return group_rank, str(item.get("name", f"Item {item_id}"))


def optimize_allocation(
    plans: list[dict],
    inventory: dict[int, int],
    students_by_id: dict[int, dict],
    items_by_id: dict[int, dict],
    strategy: str = "priority",
    daily_cafe_taps: int = 0,
    daily_schedules: int = 0,
) -> dict:
    stock = {int(item_id): int(quantity) for item_id, quantity in inventory.items() if int(quantity) > 0}
    today = date.today()
    states = [
        _build_plan_state(
            plan,
            students_by_id.get(int(plan.get("student_id", 0))),
            daily_cafe_taps=daily_cafe_taps,
            daily_schedules=daily_schedules,
            today=today,
        )
        for plan in plans
        if int(plan.get("required_exp", 0)) > 0
    ]
    states.sort(key=_priority_sort_key)

    if strategy == "focus":
        ordered_states = sorted(
            states,
            key=lambda plan: (
                -PRIORITY_ORDER.get(str(plan.get("priority", "priority")), 0),
                str(plan.get("student_name", "")),
            ),
        )
        for state in ordered_states:
            student = students_by_id.get(int(state["student_id"]))
            if not student:
                continue
            while state["remaining_exp"] > 0:
                if not _allocate_to_plan(state, student, stock, items_by_id):
                    break
    else:
        while True:
            candidate = _pick_next_global_candidate(states, stock, students_by_id, items_by_id, strategy)
            if candidate is None:
                break
            _apply_candidate(candidate, stock)

    results: list[dict] = []
    total_required = 0
    total_allocated = 0
    total_passive = 0
    for state in states:
        current_level = int(state.get("current_bond_level", 1))
        current_exp = int(state.get("current_bond_exp", 0))
        passive_exp = int(state.get("passive_exp", 0))
        predicted_level, predicted_exp = project_level_after_gain(
            current_level,
            current_exp,
            state["allocated_exp"] + passive_exp,
        )
        total_required += int(state.get("required_exp", 0))
        total_allocated += state["allocated_exp"]
        total_passive += passive_exp
        results.append({**state, "predicted_level": predicted_level, "predicted_level_exp": predicted_exp})

    leftovers = defaultdict(int)
    for item_id, quantity in stock.items():
        if quantity > 0:
            leftovers[item_id] = quantity

    leftover_rows = [
        {
            "item_id": item_id,
            "item_name": items_by_id.get(item_id, {}).get("name", f"Item {item_id}"),
            "icon_path": items_by_id.get(item_id, {}).get("icon_path", ""),
            "rarity": items_by_id.get(item_id, {}).get("rarity", ""),
            "gift_kind": items_by_id.get(item_id, {}).get("gift_kind", "gift"),
            "quantity": quantity,
        }
        for item_id, quantity in sorted(
            leftovers.items(),
            key=lambda row: _leftover_sort_key(row[0], items_by_id.get(row[0], {})),
        )
    ]
    craftable_boxes, craft_source_count = _craftable_selectable_box_count(leftover_rows)

    return {
        "strategy": strategy,
        "results": results,
        "summary": {
            "total_required_exp": total_required,
            "total_allocated_exp": total_allocated,
            "total_passive_exp": total_passive,
            "completion_rate": (
                0.0
                if total_required == 0
                else min(1.0, (total_allocated + total_passive) / total_required)
            ),
        },
        "leftovers": leftover_rows,
        "craftable_boxes": {
            "box_count": craftable_boxes,
            "source_item_count": craft_source_count,
        },
    }


def build_plan_records(raw_plans: list[dict]) -> list[dict]:
    plans: list[dict] = []
    for plan in raw_plans:
        required_exp = calc_required_exp(
            int(plan.get("current_bond_level", 1)),
            int(plan.get("current_bond_exp", 0)),
            int(plan.get("target_bond_level", 1)),
        )
        plans.append({**plan, "required_exp": required_exp})
    return plans
