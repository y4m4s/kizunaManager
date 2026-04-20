from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Callable

import requests

from src.bond_calculator import BOND_EXP_TABLE, cumulative_exp_to_level
from src.config import (
    CACHE_DIR,
    CACHE_META_PATH,
    is_hidden_item,
    ITEM_IMAGE_DIR,
    MASTER_FALLBACK_BASE_URL,
    MASTER_LANG,
    MASTER_PRIMARY_BASE_URL,
    MASTER_RESOURCES,
    MASTER_RESOURCE_LABELS,
    MASTER_SOURCE_LABELS,
    STUDENT_IMAGE_DIR,
    normalize_school_name,
)

ProgressCallback = Callable[[str, int, int], None]

SAMPLE_STUDENTS: list[dict[str, Any]] = [
    {
        "id": 10000,
        "name": "アル",
        "school": "Gehenna",
        "favor_item_tags": ["Luxury", "Music"],
        "favor_item_unique_tags": ["Headphones"],
    },
    {
        "id": 10001,
        "name": "ヒナ",
        "school": "Gehenna",
        "favor_item_tags": ["Military", "Sweet"],
        "favor_item_unique_tags": ["Explosive"],
    },
    {
        "id": 10002,
        "name": "シロコ",
        "school": "Abydos",
        "favor_item_tags": ["Sports", "Outdoor"],
        "favor_item_unique_tags": ["Cycling"],
    },
    {
        "id": 10003,
        "name": "ユウカ",
        "school": "Millennium",
        "favor_item_tags": ["Stationery", "Tech"],
        "favor_item_unique_tags": ["Calculator"],
    },
    {
        "id": 10004,
        "name": "ミカ",
        "school": "Trinity",
        "favor_item_tags": ["Luxury", "Cute"],
        "favor_item_unique_tags": ["TeaParty"],
    },
    {
        "id": 10005,
        "name": "コハル",
        "school": "Trinity",
        "favor_item_tags": ["Medical", "Cute"],
        "favor_item_unique_tags": ["Angel"],
    },
    {
        "id": 10006,
        "name": "ホシノ",
        "school": "Abydos",
        "favor_item_tags": ["Dessert", "Cute"],
        "favor_item_unique_tags": ["Nap"],
    },
    {
        "id": 10007,
        "name": "イオリ",
        "school": "Gehenna",
        "favor_item_tags": ["Military", "Fashion"],
        "favor_item_unique_tags": ["Glasses"],
    },
]

SAMPLE_ITEMS: list[dict[str, Any]] = [
    {
        "id": 50001,
        "name": "ネコ耳ヘッドフォン",
        "tags": ["Music", "Cute"],
        "rarity": "SR",
        "category": "Favor",
        "exp_value": 60,
        "gift_kind": "gift",
        "icon_name": "cat_headphone",
    },
    {
        "id": 50002,
        "name": "高級ティーセット",
        "tags": ["Luxury", "TeaParty"],
        "rarity": "SSR",
        "category": "Favor",
        "exp_value": 180,
        "gift_kind": "gift",
        "icon_name": "premium_tea",
    },
    {
        "id": 50003,
        "name": "戦術教本",
        "tags": ["Military", "Stationery"],
        "rarity": "SR",
        "category": "Favor",
        "exp_value": 60,
        "gift_kind": "gift",
        "icon_name": "tactical_book",
    },
    {
        "id": 50004,
        "name": "ロードバイク模型",
        "tags": ["Sports", "Outdoor", "Cycling"],
        "rarity": "SSR",
        "category": "Favor",
        "exp_value": 180,
        "gift_kind": "gift",
        "icon_name": "bike_model",
    },
    {
        "id": 50005,
        "name": "ハンドメイドクッキー",
        "tags": ["Dessert", "Cute"],
        "rarity": "SR",
        "category": "Favor",
        "exp_value": 60,
        "gift_kind": "gift",
        "icon_name": "cookie",
    },
    {
        "id": 50006,
        "name": "救急ポーチ",
        "tags": ["Medical", "Tech"],
        "rarity": "SR",
        "category": "Favor",
        "exp_value": 60,
        "gift_kind": "gift",
        "icon_name": "medkit",
    },
    {
        "id": 50007,
        "name": "プレミアム計算機",
        "tags": ["Tech", "Calculator"],
        "rarity": "SSR",
        "category": "Favor",
        "exp_value": 180,
        "gift_kind": "gift",
        "icon_name": "calculator",
    },
    {
        "id": 50008,
        "name": "エンジェルぬいぐるみ",
        "tags": ["Cute", "Angel"],
        "rarity": "SSR",
        "category": "Favor",
        "exp_value": 180,
        "gift_kind": "gift",
        "icon_name": "angel_doll",
    },
    {
        "id": 50009,
        "name": "ナイトパトロールキット",
        "tags": ["Military", "Outdoor", "Glasses"],
        "rarity": "SSR",
        "category": "Favor",
        "exp_value": 180,
        "gift_kind": "gift",
        "icon_name": "patrol_kit",
    },
    {
        "id": 50010,
        "name": "お昼寝まくら",
        "tags": ["Nap"],
        "rarity": "SSR",
        "category": "Favor",
        "exp_value": 180,
        "gift_kind": "gift",
        "icon_name": "nap_pillow",
    },
    {
        "id": 50011,
        "name": "花束・小",
        "tags": [],
        "rarity": "Bouquet",
        "category": "Favor",
        "exp_value": 40,
        "gift_kind": "bouquet",
        "icon_name": "bouquet_s",
    },
    {
        "id": 50012,
        "name": "花束・中",
        "tags": [],
        "rarity": "Bouquet",
        "category": "Favor",
        "exp_value": 80,
        "gift_kind": "bouquet",
        "icon_name": "bouquet_m",
    },
    {
        "id": 50013,
        "name": "花束・大",
        "tags": [],
        "rarity": "Bouquet",
        "category": "Favor",
        "exp_value": 120,
        "gift_kind": "bouquet",
        "icon_name": "bouquet_l",
    },
]


def _ensure_dirs() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    STUDENT_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    ITEM_IMAGE_DIR.mkdir(parents=True, exist_ok=True)


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def _save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)


def _load_cache_meta() -> dict[str, Any]:
    if not CACHE_META_PATH.exists():
        return {}
    return _load_json(CACHE_META_PATH)


def _save_cache_meta(payload: dict[str, Any]) -> None:
    _save_json(CACHE_META_PATH, payload)


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _emit_progress(
    progress_callback: ProgressCallback | None,
    message: str,
    current: int,
    total: int,
) -> None:
    if progress_callback is None:
        return
    safe_total = max(1, int(total))
    safe_current = max(0, min(int(current), safe_total))
    progress_callback(message, safe_current, safe_total)


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _master_url_candidates(resource: str) -> list[tuple[str, str]]:
    return [
        (
            MASTER_SOURCE_LABELS["web"],
            f"{MASTER_PRIMARY_BASE_URL}/data/{MASTER_LANG}/{resource}.min.json",
        ),
        (
            MASTER_SOURCE_LABELS["github"],
            f"{MASTER_FALLBACK_BASE_URL}/data/{MASTER_LANG}/{resource}.min.json",
        ),
    ]


def _iter_records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        if "data" in payload and isinstance(payload["data"], list):
            return [row for row in payload["data"] if isinstance(row, dict)]
        values = list(payload.values())
        if values and all(isinstance(row, dict) for row in values):
            return values
    return []


def normalize_student(record: dict[str, Any]) -> dict[str, Any] | None:
    student_id = record.get("Id", record.get("id"))
    name = record.get("Name", record.get("name"))
    if not student_id or not name:
        return None
    normalized_id = int(student_id)

    return {
        "id": normalized_id,
        "name": str(name),
        "school": normalize_school_name(str(record.get("School", record.get("school", "")) or "")),
        "icon_path": str(record.get("icon_path") or (STUDENT_IMAGE_DIR / f"{normalized_id}.webp")),
        "favor_item_tags": list(record.get("FavorItemTags", record.get("favor_item_tags", [])) or []),
        "favor_item_unique_tags": list(
            record.get("FavorItemUniqueTags", record.get("favor_item_unique_tags", [])) or []
        ),
        "raw_json": record,
    }


def normalize_item(record: dict[str, Any]) -> dict[str, Any] | None:
    item_id = record.get("Id", record.get("id"))
    name = record.get("Name", record.get("name"))
    if not item_id or not name:
        return None

    gift_kind = str(record.get("gift_kind", "") or "").lower()
    if not gift_kind:
        gift_kind = "bouquet" if "花束" in str(name) else "gift"
    icon_name = str(record.get("Icon", record.get("icon_name", "")) or "")
    icon_path = str(record.get("icon_path") or ((ITEM_IMAGE_DIR / f"{icon_name}.webp") if icon_name else ""))

    return {
        "id": int(item_id),
        "name": str(name),
        "tags": list(record.get("Tags", record.get("tags", [])) or []),
        "rarity": str(record.get("Rarity", record.get("rarity", "")) or ""),
        "category": str(record.get("Category", record.get("category", "")) or ""),
        "exp_value": int(record.get("ExpValue", record.get("exp_value", 0)) or 0),
        "gift_kind": gift_kind,
        "icon_name": icon_name,
        "icon_path": icon_path,
        "raw_json": record,
    }


def extract_students(raw_payload: Any) -> list[dict[str, Any]]:
    students: list[dict[str, Any]] = []
    for record in _iter_records(raw_payload):
        normalized = normalize_student(record)
        if normalized is not None:
            students.append(normalized)
    students.sort(key=lambda row: row["name"])
    return students


def extract_items(raw_payload: Any) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for record in _iter_records(raw_payload):
        normalized = normalize_item(record)
        if normalized is None:
            continue
        if is_hidden_item(normalized.get("name", ""), normalized.get("icon_name", "")):
            continue
        is_favor = normalized["category"] == "Favor" or normalized["gift_kind"] == "bouquet"
        if is_favor:
            items.append(normalized)
    items.sort(key=lambda row: row["name"])
    return items


def fetch_remote_json(url: str, timeout: int = 30) -> Any:
    response = requests.get(
        url,
        timeout=timeout,
        headers={"User-Agent": "BlueArchiveBondManager/0.1 (+https://schaledb.com)"},
    )
    response.raise_for_status()
    return response.json()


def download_master_data(
    timeout: int = 30,
    progress_callback: ProgressCallback | None = None,
    progress_total: int | None = None,
) -> dict[str, Any]:
    _ensure_dirs()
    payloads: dict[str, Any] = {}
    resolved_sources: dict[str, str] = {}
    resolved_urls: dict[str, str] = {}
    total_steps = progress_total if progress_total is not None else len(MASTER_RESOURCES)

    for index, name in enumerate(MASTER_RESOURCES, start=1):
        resource_label = MASTER_RESOURCE_LABELS.get(name, name)
        _emit_progress(progress_callback, f"{resource_label}を取得しています...", index - 1, total_steps)
        last_error: Exception | None = None
        for source_label, url in _master_url_candidates(name):
            try:
                payload = fetch_remote_json(url, timeout=timeout)
            except requests.RequestException as exc:
                last_error = exc
                continue

            payloads[name] = payload
            resolved_sources[name] = source_label
            resolved_urls[name] = url
            _save_json(CACHE_DIR / f"{name}.json", payload)
            _emit_progress(
                progress_callback,
                f"{resource_label}を取得しました。",
                index,
                total_steps,
            )
            break
        else:
            if last_error is not None:
                raise last_error
            raise RuntimeError(f"failed to fetch {name}")

    primary_source = MASTER_SOURCE_LABELS["cache"]
    if resolved_sources:
        if all(source == MASTER_SOURCE_LABELS["web"] for source in resolved_sources.values()):
            primary_source = MASTER_SOURCE_LABELS["web"]
        elif any(source == MASTER_SOURCE_LABELS["web"] for source in resolved_sources.values()):
            primary_source = f"{MASTER_SOURCE_LABELS['web']}_mixed"
        else:
            primary_source = MASTER_SOURCE_LABELS["github"]

    _save_cache_meta(
        {
            "fetched_at": _utc_now_iso(),
            "source": primary_source,
            "resources": resolved_sources,
            "urls": resolved_urls,
        }
    )
    return payloads


def update_master_data(
    database: Any,
    timeout: int = 30,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    total_steps = len(MASTER_RESOURCES) + 1
    payloads = download_master_data(
        timeout=timeout,
        progress_callback=progress_callback,
        progress_total=total_steps,
    )
    _emit_progress(progress_callback, "取得したデータをデータベースへ反映しています...", total_steps - 1, total_steps)
    source = sync_cache_to_database(database)
    counts = database.get_master_counts()
    _emit_progress(progress_callback, "最新データの反映が完了しました。", total_steps, total_steps)
    return {"payloads": payloads, "source": source, "counts": counts}


def sync_cache_to_database(database: Any) -> str:
    students_path = CACHE_DIR / "students.json"
    items_path = CACHE_DIR / "items.json"
    if not students_path.exists() or not items_path.exists():
        raise FileNotFoundError("キャッシュされたマスターデータが見つかりません。")

    students = extract_students(_load_json(students_path))
    items = extract_items(_load_json(items_path))
    cache_meta = _load_cache_meta()
    source = str(cache_meta.get("source") or MASTER_SOURCE_LABELS["cache"])
    database.replace_master_data(students, items, source=source)
    if cache_meta.get("fetched_at"):
        database.set_meta("master_refreshed_at", str(cache_meta["fetched_at"]))
    return source


def seed_sample_database(database: Any) -> str:
    students = [normalize_student(record) for record in SAMPLE_STUDENTS]
    items = [normalize_item(record) for record in SAMPLE_ITEMS]
    database.replace_master_data(
        [record for record in students if record is not None],
        [record for record in items if record is not None],
        source=MASTER_SOURCE_LABELS["sample"],
    )
    database.set_meta("master_refreshed_at", _utc_now_iso())
    return MASTER_SOURCE_LABELS["sample"]


def ensure_bootstrap_data(database: Any) -> str:
    _ensure_dirs()
    bond_rows = [
        {
            "level": level,
            "exp_required": exp_required,
            "cumulative_exp": cumulative_exp_to_level(level),
        }
        for level, exp_required in BOND_EXP_TABLE.items()
    ]
    database.seed_bond_exp_table(bond_rows)

    if database.has_master_data():
        return database.get_meta("master_source") or "database"

    try:
        return sync_cache_to_database(database)
    except FileNotFoundError:
        return seed_sample_database(database)


def refresh_master_data(database: Any, timeout: int = 10, max_age_hours: int = 24, force: bool = False) -> str:
    current_source = database.get_meta("master_source") or ""
    refreshed_at = _parse_iso_datetime(database.get_meta("master_refreshed_at"))
    now = datetime.now(UTC)

    is_stale = refreshed_at is None or (now - refreshed_at) >= timedelta(hours=max_age_hours)
    should_refresh = force or not database.has_master_data() or current_source in {
        "",
        MASTER_SOURCE_LABELS["sample"],
        MASTER_SOURCE_LABELS["github"],
    }
    if not should_refresh:
        should_refresh = is_stale

    if not should_refresh:
        return current_source or "database"

    try:
        result = update_master_data(database, timeout=timeout)
        return str(result["source"])
    except (requests.RequestException, RuntimeError, ValueError):
        if database.has_master_data():
            return current_source or "database"
        try:
            return sync_cache_to_database(database)
        except FileNotFoundError:
            return seed_sample_database(database)


def student_icon_url(student_id: int) -> str:
    return f"{MASTER_PRIMARY_BASE_URL}/images/student/icon/{student_id}.webp"


def item_icon_url(icon_name: str) -> str:
    return f"{MASTER_PRIMARY_BASE_URL}/images/item/icon/{icon_name}.webp"


def cache_binary(url: str, target: Path, timeout: int = 30) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(
        url,
        timeout=timeout,
        headers={"User-Agent": "BlueArchiveBondManager/0.1 (+https://schaledb.com)"},
    )
    response.raise_for_status()
    target.write_bytes(response.content)
    return target


def _build_icon_jobs(database: Any, force: bool = False) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []

    for student in database.search_students():
        icon_path = Path(student.get("icon_path", ""))
        if not str(icon_path):
            continue
        if icon_path.exists() and not force:
            continue
        jobs.append(
            {
                "kind": "student",
                "name": student["name"],
                "url": student_icon_url(int(student["id"])),
                "path": icon_path,
            }
        )

    for item in database.list_items():
        icon_name = str(item.get("icon_name", ""))
        icon_path = Path(item.get("icon_path", ""))
        if not icon_name or not str(icon_path):
            continue
        if icon_path.exists() and not force:
            continue
        jobs.append(
            {
                "kind": "item",
                "name": item["name"],
                "url": item_icon_url(icon_name),
                "path": icon_path,
            }
        )

    return jobs


def cache_icons(
    database: Any,
    timeout: int = 30,
    progress_callback: ProgressCallback | None = None,
    force: bool = False,
    progress_start: int = 0,
    progress_total: int | None = None,
    jobs: list[dict[str, Any]] | None = None,
) -> dict[str, int]:
    _ensure_dirs()
    downloaded_students = 0
    downloaded_items = 0
    failed = 0
    skipped = 0

    icon_jobs = list(jobs) if jobs is not None else _build_icon_jobs(database, force=force)
    total_jobs = len(icon_jobs)
    effective_total = progress_total if progress_total is not None else progress_start + max(1, total_jobs)
    _emit_progress(progress_callback, "アイコン一覧を確認しています...", progress_start, effective_total)

    for index, job in enumerate(icon_jobs, start=1):
        message = f"{job['name']} の画像を処理しています..."
        target_path = Path(job["path"])
        if target_path.exists() and not force:
            skipped += 1
            _emit_progress(progress_callback, message, progress_start + index, effective_total)
            continue

        try:
            cache_binary(str(job["url"]), target_path, timeout=timeout)
            if job["kind"] == "student":
                downloaded_students += 1
            else:
                downloaded_items += 1
        except requests.RequestException:
            failed += 1
        finally:
            _emit_progress(progress_callback, message, progress_start + index, effective_total)

    if not icon_jobs:
        _emit_progress(
            progress_callback,
            "ダウンロード対象の画像はありません。",
            min(progress_start + 1, effective_total),
            effective_total,
        )

    return {
        "students": downloaded_students,
        "items": downloaded_items,
        "downloaded": downloaded_students + downloaded_items,
        "failed": failed,
        "skipped": skipped,
        "total": total_jobs,
    }


def update_master_data_with_icons(
    database: Any,
    timeout: int = 30,
    progress_callback: ProgressCallback | None = None,
    force_icons: bool = False,
) -> dict[str, Any]:
    master_result = update_master_data(database, timeout=timeout, progress_callback=progress_callback)
    base_steps = len(MASTER_RESOURCES) + 1
    icon_jobs = _build_icon_jobs(database, force=force_icons)
    total_steps = base_steps + max(1, len(icon_jobs))

    _emit_progress(progress_callback, "画像ダウンロードの準備をしています...", base_steps, total_steps)
    icon_result = cache_icons(
        database,
        timeout=timeout,
        progress_callback=progress_callback,
        force=force_icons,
        progress_start=base_steps,
        progress_total=total_steps,
        jobs=icon_jobs,
    )
    _emit_progress(progress_callback, "最新データと画像の更新が完了しました。", total_steps, total_steps)

    return {
        **master_result,
        "icons": icon_result,
    }
