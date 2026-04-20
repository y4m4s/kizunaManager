from __future__ import annotations

import json
import shutil
import sqlite3
import threading
from datetime import datetime
from functools import wraps
from pathlib import Path
from typing import Any

from src.bond_calculator import calc_required_exp, progress_ratio
from src.config import (
    DB_PATH,
    HIDDEN_ITEM_ICON_NAMES,
    HIDDEN_ITEM_NAMES,
    ITEM_IMAGE_DIR,
    RECOVERED_DB_PATH,
    SCHOOL_NAME_MAP,
    SELECTABLE_BOX_ICON_FILE,
    SELECTABLE_BOX_ITEM_ID,
    SELECTABLE_BOX_KEY,
    SELECTABLE_BOX_NAME,
    is_hidden_item,
    normalize_school_name,
)


def synchronized(method):
    @wraps(method)
    def wrapper(self, *args, **kwargs):
        with self._lock:
            return method(self, *args, **kwargs)

    return wrapper


class Database:
    def __init__(self, db_path: Path | str = DB_PATH) -> None:
        self.primary_db_path = Path(db_path)
        self.db_path = self._preferred_db_path(self.primary_db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._recovery_attempted = False
        # pywebview may dispatch JS API calls on worker threads, so the
        # desktop app needs a connection that can be reused across threads.
        # Access is serialized with an RLock because SQLite connections are
        # not safe for concurrent use even with check_same_thread disabled.
        self.connection = self._open_connection(self.db_path)

    def _preferred_db_path(self, requested: Path) -> Path:
        if requested == DB_PATH:
            recovery_candidates = [RECOVERED_DB_PATH, *sorted(
                requested.parent.glob("bond_manager.recovered-*.db"),
                reverse=True,
            )]
            for candidate in recovery_candidates:
                if self._is_sqlite_usable(candidate):
                    return candidate
        return requested

    def _open_connection(self, path: Path) -> sqlite3.Connection:
        connection = sqlite3.connect(path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

    def _reconnect(self, path: Path) -> None:
        try:
            self.connection.close()
        except Exception:
            pass
        self.db_path = path
        self.connection = self._open_connection(path)

    def _recovered_copy_path(self) -> Path:
        if self.primary_db_path == DB_PATH:
            base_path = RECOVERED_DB_PATH
        else:
            base_path = self.primary_db_path.with_name(
                f"{self.primary_db_path.stem}.recovered{self.primary_db_path.suffix}"
            )

        if not base_path.exists() and not base_path.with_name(f"{base_path.name}-journal").exists():
            return base_path

        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        return base_path.with_name(f"{base_path.stem}-{timestamp}{base_path.suffix}")

    def _is_sqlite_usable(self, path: Path) -> bool:
        if not path.exists():
            return False
        try:
            connection = sqlite3.connect(path)
            try:
                connection.execute("PRAGMA journal_mode = MEMORY")
                connection.execute("SELECT COUNT(*) FROM sqlite_master").fetchone()
            finally:
                connection.close()
            return True
        except sqlite3.Error:
            return False

    def _recover_from_disk_io_error(self) -> bool:
        recovered_path = self._recovered_copy_path()
        recovered_path.parent.mkdir(parents=True, exist_ok=True)
        if self._is_sqlite_usable(recovered_path):
            self._reconnect(recovered_path)
            return True
        if not self.primary_db_path.exists():
            return False
        shutil.copy2(self.primary_db_path, recovered_path)
        if not self._is_sqlite_usable(recovered_path):
            return False
        self._reconnect(recovered_path)
        return True

    @synchronized
    def close(self) -> None:
        self.connection.close()

    @synchronized
    def initialize(self) -> None:
        try:
            self.connection.execute("PRAGMA journal_mode = MEMORY")
            self.connection.execute("PRAGMA foreign_keys = ON")
            self.connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS app_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );

                CREATE TABLE IF NOT EXISTS master_students (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    school TEXT,
                    icon_path TEXT,
                    favor_item_tags TEXT,
                    favor_item_unique_tags TEXT,
                    raw_json TEXT
                );

                CREATE TABLE IF NOT EXISTS master_items (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    tags TEXT,
                    rarity TEXT,
                    category TEXT,
                    exp_value INTEGER,
                    gift_kind TEXT DEFAULT 'gift',
                    icon_name TEXT,
                    icon_path TEXT,
                    raw_json TEXT
                );

                CREATE TABLE IF NOT EXISTS master_bond_exp (
                    level INTEGER PRIMARY KEY,
                    exp_required INTEGER NOT NULL,
                    cumulative_exp INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS user_students (
                    student_id INTEGER PRIMARY KEY REFERENCES master_students(id),
                    current_bond_level INTEGER DEFAULT 1,
                    current_bond_exp INTEGER DEFAULT 0,
                    star_rank INTEGER DEFAULT 5,
                    notes TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS user_inventory (
                    item_id INTEGER PRIMARY KEY REFERENCES master_items(id),
                    quantity INTEGER DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS user_gift_boxes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    box_type TEXT NOT NULL UNIQUE,
                    quantity INTEGER DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS user_plans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id INTEGER NOT NULL REFERENCES master_students(id),
                    target_bond_level INTEGER NOT NULL,
                    priority TEXT DEFAULT 'priority',
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            self.connection.commit()
            self._migrate_legacy_data()
        except sqlite3.OperationalError as exc:
            if (
                not self._recovery_attempted
                and "disk I/O error" in str(exc)
                and self.db_path == self.primary_db_path
                and self._recover_from_disk_io_error()
            ):
                self._recovery_attempted = True
                self.initialize()
                return
            raise

    @synchronized
    def _migrate_legacy_data(self) -> None:
        for english_name, japanese_name in SCHOOL_NAME_MAP.items():
            self.connection.execute(
                "UPDATE master_students SET school = ? WHERE school = ?",
                (japanese_name, english_name),
            )
        self.connection.execute("UPDATE user_students SET star_rank = 5 WHERE COALESCE(star_rank, 5) != 5")
        self.connection.execute("UPDATE user_plans SET priority = 'priority' WHERE priority = 'high'")
        self.connection.execute("UPDATE user_plans SET priority = 'defer' WHERE priority = 'medium'")
        self.connection.execute("UPDATE user_plans SET priority = 'done' WHERE priority = 'low'")
        self.connection.execute(
            "UPDATE user_plans SET priority = 'priority' WHERE COALESCE(priority, '') NOT IN ('top_priority', 'priority', 'semi_priority', 'defer', 'done')"
        )
        if HIDDEN_ITEM_NAMES or HIDDEN_ITEM_ICON_NAMES:
            conditions: list[str] = []
            params: list[str] = []
            if HIDDEN_ITEM_NAMES:
                placeholders = ", ".join("?" for _ in HIDDEN_ITEM_NAMES)
                conditions.append(f"name IN ({placeholders})")
                params.extend(sorted(HIDDEN_ITEM_NAMES))
            if HIDDEN_ITEM_ICON_NAMES:
                placeholders = ", ".join("?" for _ in HIDDEN_ITEM_ICON_NAMES)
                conditions.append(f"icon_name IN ({placeholders})")
                params.extend(sorted(HIDDEN_ITEM_ICON_NAMES))
            where_clause = " OR ".join(conditions)
            self.connection.execute(
                f"DELETE FROM user_inventory WHERE item_id IN (SELECT id FROM master_items WHERE {where_clause})",
                params,
            )
            self.connection.execute(f"DELETE FROM master_items WHERE {where_clause}", params)
        self.connection.commit()

    def _json(self, value: Any) -> str:
        return json.dumps(value, ensure_ascii=False)

    def _loads(self, value: Any, default: Any) -> Any:
        if not value:
            return default
        try:
            return json.loads(value)
        except (TypeError, json.JSONDecodeError):
            return default

    def _student_from_row(self, row: sqlite3.Row) -> dict[str, Any]:
        raw_json = self._loads(row["raw_json"], {})
        birthday = ""
        if isinstance(raw_json, dict):
            birthday = str(raw_json.get("Birthday") or raw_json.get("BirthDay") or "")
        return {
            "id": row["id"],
            "name": row["name"],
            "school": normalize_school_name(str(row["school"] or "")),
            "icon_path": row["icon_path"] or "",
            "birthday": birthday,
            "favor_item_tags": self._loads(row["favor_item_tags"], []),
            "favor_item_unique_tags": self._loads(row["favor_item_unique_tags"], []),
            "raw_json": raw_json,
            "current_bond_level": int(row["current_bond_level"] or 1),
            "current_bond_exp": int(row["current_bond_exp"] or 0),
            "star_rank": int(row["star_rank"] or 5),
            "notes": row["notes"] or "",
            "is_owned": bool(row["is_owned"]),
        }

    def _item_from_row(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "name": row["name"],
            "tags": self._loads(row["tags"], []),
            "rarity": row["rarity"] or "",
            "category": row["category"] or "",
            "exp_value": int(row["exp_value"] or 0),
            "gift_kind": row["gift_kind"] or "gift",
            "icon_name": row["icon_name"] or "",
            "icon_path": row["icon_path"] or "",
            "raw_json": self._loads(row["raw_json"], {}),
            "quantity": int(row["quantity"] or 0),
        }

    @synchronized
    def set_meta(self, key: str, value: str) -> None:
        self.connection.execute(
            """
            INSERT INTO app_meta(key, value)
            VALUES(?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (key, value),
        )
        self.connection.commit()

    @synchronized
    def get_meta(self, key: str) -> str | None:
        row = self.connection.execute("SELECT value FROM app_meta WHERE key = ?", (key,)).fetchone()
        return None if row is None else str(row["value"])

    @synchronized
    def has_master_data(self) -> bool:
        row = self.connection.execute("SELECT COUNT(*) AS count FROM master_students").fetchone()
        return bool(row and int(row["count"]) > 0)

    @synchronized
    def get_master_counts(self) -> dict[str, int]:
        students = self.connection.execute("SELECT COUNT(*) AS count FROM master_students").fetchone()
        items = self.connection.execute("SELECT COUNT(*) AS count FROM master_items").fetchone()
        return {
            "students": 0 if students is None else int(students["count"]),
            "items": 0 if items is None else int(items["count"]),
        }

    @synchronized
    def seed_bond_exp_table(self, rows: list[dict[str, int]]) -> None:
        self.connection.execute("DELETE FROM master_bond_exp")
        self.connection.executemany(
            """
            INSERT INTO master_bond_exp(level, exp_required, cumulative_exp)
            VALUES(:level, :exp_required, :cumulative_exp)
            """,
            rows,
        )
        self.connection.commit()

    @synchronized
    def replace_master_data(self, students: list[dict[str, Any]], items: list[dict[str, Any]], source: str) -> None:
        self.connection.commit()
        self.connection.execute("PRAGMA foreign_keys = OFF")
        try:
            self.connection.execute("DELETE FROM master_students")
            self.connection.execute("DELETE FROM master_items")
            self.connection.executemany(
                """
                INSERT INTO master_students(
                    id, name, school, icon_path, favor_item_tags, favor_item_unique_tags, raw_json
                )
                VALUES(:id, :name, :school, :icon_path, :favor_item_tags, :favor_item_unique_tags, :raw_json)
                """,
                [
                    {
                        "id": int(student["id"]),
                        "name": student["name"],
                        "school": normalize_school_name(str(student.get("school", ""))),
                        "icon_path": student.get("icon_path", ""),
                        "favor_item_tags": self._json(student.get("favor_item_tags", [])),
                        "favor_item_unique_tags": self._json(student.get("favor_item_unique_tags", [])),
                        "raw_json": self._json(student.get("raw_json", {})),
                    }
                    for student in students
                ],
            )
            self.connection.executemany(
                """
                INSERT INTO master_items(
                    id, name, tags, rarity, category, exp_value, gift_kind, icon_name, icon_path, raw_json
                )
                VALUES(:id, :name, :tags, :rarity, :category, :exp_value, :gift_kind, :icon_name, :icon_path, :raw_json)
                """,
                [
                    {
                        "id": int(item["id"]),
                        "name": item["name"],
                        "tags": self._json(item.get("tags", [])),
                        "rarity": item.get("rarity", ""),
                        "category": item.get("category", ""),
                        "exp_value": int(item.get("exp_value", 0) or 0),
                        "gift_kind": item.get("gift_kind", "gift"),
                        "icon_name": item.get("icon_name", ""),
                        "icon_path": item.get("icon_path", ""),
                        "raw_json": self._json(item.get("raw_json", {})),
                    }
                    for item in items
                ],
            )
            self.connection.execute(
                "DELETE FROM user_students WHERE student_id NOT IN (SELECT id FROM master_students)"
            )
            self.connection.execute(
                "DELETE FROM user_plans WHERE student_id NOT IN (SELECT id FROM master_students)"
            )
            self.connection.execute(
                "DELETE FROM user_inventory WHERE item_id NOT IN (SELECT id FROM master_items)"
            )
            self.connection.commit()
        finally:
            self.connection.execute("PRAGMA foreign_keys = ON")
        self.set_meta("master_source", source)

    @synchronized
    def search_students(
        self,
        query: str = "",
        school: str = "",
        owned_only: bool = False,
        sort_by: str = "owned",
    ) -> list[dict[str, Any]]:
        sql = """
            SELECT
                ms.*,
                COALESCE(us.current_bond_level, 1) AS current_bond_level,
                COALESCE(us.current_bond_exp, 0) AS current_bond_exp,
                COALESCE(us.star_rank, 5) AS star_rank,
                COALESCE(us.notes, '') AS notes,
                CASE WHEN us.student_id IS NULL THEN 0 ELSE 1 END AS is_owned
            FROM master_students ms
            LEFT JOIN user_students us ON us.student_id = ms.id
            WHERE (:query = '' OR ms.name LIKE '%' || :query || '%')
              AND (:school = '' OR ms.school = :school)
        """
        params = {"query": query.strip(), "school": school.strip()}
        if owned_only:
            sql += " AND us.student_id IS NOT NULL"
        if sort_by == "school":
            sql += " ORDER BY CASE WHEN ms.school = '' THEN 1 ELSE 0 END, ms.school COLLATE NOCASE, ms.name COLLATE NOCASE"
        elif sort_by == "name":
            sql += " ORDER BY ms.name COLLATE NOCASE"
        else:
            sql += " ORDER BY is_owned DESC, ms.name COLLATE NOCASE"
        rows = self.connection.execute(sql, params).fetchall()
        return [self._student_from_row(row) for row in rows]

    @synchronized
    def get_student(self, student_id: int) -> dict[str, Any] | None:
        rows = self.connection.execute(
            """
            SELECT
                ms.*,
                COALESCE(us.current_bond_level, 1) AS current_bond_level,
                COALESCE(us.current_bond_exp, 0) AS current_bond_exp,
                COALESCE(us.star_rank, 5) AS star_rank,
                COALESCE(us.notes, '') AS notes,
                CASE WHEN us.student_id IS NULL THEN 0 ELSE 1 END AS is_owned
            FROM master_students ms
            LEFT JOIN user_students us ON us.student_id = ms.id
            WHERE ms.id = ?
            """,
            (student_id,),
        ).fetchone()
        return None if rows is None else self._student_from_row(rows)

    @synchronized
    def list_schools(self) -> list[str]:
        rows = self.connection.execute(
            "SELECT DISTINCT school FROM master_students WHERE school IS NOT NULL AND school != '' ORDER BY school"
        ).fetchall()
        schools = {normalize_school_name(str(row["school"])) for row in rows}
        return sorted(school for school in schools if school)

    @synchronized
    def list_items(self, query: str = "") -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT
                mi.*,
                COALESCE(ui.quantity, 0) AS quantity
            FROM master_items mi
            LEFT JOIN user_inventory ui ON ui.item_id = mi.id
            WHERE (:query = '' OR mi.name LIKE '%' || :query || '%')
            ORDER BY
                CASE mi.gift_kind WHEN 'bouquet' THEN 0 ELSE 1 END,
                mi.name COLLATE NOCASE
            """,
            {"query": query.strip()},
        ).fetchall()
        items = [self._item_from_row(row) for row in rows]
        return [
            item
            for item in items
            if not is_hidden_item(item.get("name", ""), item.get("icon_name", ""))
        ]

    @synchronized
    def get_item(self, item_id: int) -> dict[str, Any] | None:
        row = self.connection.execute(
            """
            SELECT mi.*, COALESCE(ui.quantity, 0) AS quantity
            FROM master_items mi
            LEFT JOIN user_inventory ui ON ui.item_id = mi.id
            WHERE mi.id = ?
            """,
            (item_id,),
        ).fetchone()
        if row is None:
            return None
        item = self._item_from_row(row)
        if is_hidden_item(item.get("name", ""), item.get("icon_name", "")):
            return None
        return item

    @synchronized
    def list_owned_students(self) -> list[dict[str, Any]]:
        return self.search_students(owned_only=True)

    @synchronized
    def upsert_user_student(
        self,
        student_id: int,
        current_bond_level: int,
        current_bond_exp: int,
        notes: str = "",
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO user_students(
                student_id, current_bond_level, current_bond_exp, star_rank, notes, updated_at
            )
            VALUES(?, ?, ?, 5, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(student_id) DO UPDATE SET
                current_bond_level = excluded.current_bond_level,
                current_bond_exp = excluded.current_bond_exp,
                star_rank = 5,
                notes = excluded.notes,
                updated_at = CURRENT_TIMESTAMP
            """,
            (student_id, current_bond_level, current_bond_exp, notes),
        )
        self.connection.commit()

    @synchronized
    def delete_user_student(self, student_id: int) -> None:
        self.connection.execute("DELETE FROM user_students WHERE student_id = ?", (student_id,))
        self.connection.execute("DELETE FROM user_plans WHERE student_id = ?", (student_id,))
        self.connection.commit()

    @synchronized
    def set_inventory_quantity(self, item_id: int, quantity: int) -> None:
        self.connection.execute(
            """
            INSERT INTO user_inventory(item_id, quantity, updated_at)
            VALUES(?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(item_id) DO UPDATE SET
                quantity = excluded.quantity,
                updated_at = CURRENT_TIMESTAMP
            """,
            (item_id, max(0, int(quantity))),
        )
        self.connection.commit()

    @synchronized
    def get_inventory_map(self) -> dict[int, int]:
        rows = self.connection.execute("SELECT item_id, quantity FROM user_inventory WHERE quantity > 0").fetchall()
        return {int(row["item_id"]): int(row["quantity"]) for row in rows}

    @synchronized
    def list_boxes(self) -> dict[str, int]:
        rows = self.connection.execute(
            "SELECT box_type, quantity FROM user_gift_boxes ORDER BY box_type COLLATE NOCASE"
        ).fetchall()
        return {str(row["box_type"]): int(row["quantity"]) for row in rows}

    @synchronized
    def set_box_quantity(self, box_type: str, quantity: int) -> None:
        self.connection.execute(
            """
            INSERT INTO user_gift_boxes(box_type, quantity, updated_at)
            VALUES(?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(box_type) DO UPDATE SET
                quantity = excluded.quantity,
                updated_at = CURRENT_TIMESTAMP
            """,
            (box_type, max(0, int(quantity))),
        )
        self.connection.commit()

    @synchronized
    def list_plans(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT
                up.id,
                up.student_id,
                up.target_bond_level,
                up.priority,
                COALESCE(up.notes, '') AS notes,
                ms.name AS student_name,
                ms.school AS school,
                COALESCE(us.current_bond_level, 1) AS current_bond_level,
                COALESCE(us.current_bond_exp, 0) AS current_bond_exp
            FROM user_plans up
            JOIN master_students ms ON ms.id = up.student_id
            LEFT JOIN user_students us ON us.student_id = up.student_id
            ORDER BY
                CASE up.priority
                    WHEN 'top_priority' THEN 0
                    WHEN 'priority' THEN 1
                    WHEN 'semi_priority' THEN 2
                    WHEN 'defer' THEN 3
                    ELSE 4
                END,
                up.target_bond_level DESC,
                ms.name COLLATE NOCASE
            """
        ).fetchall()

        plans: list[dict[str, Any]] = []
        for row in rows:
            required_exp = calc_required_exp(
                int(row["current_bond_level"]),
                int(row["current_bond_exp"]),
                int(row["target_bond_level"]),
            )
            plans.append(
                {
                    "id": int(row["id"]),
                    "student_id": int(row["student_id"]),
                    "student_name": row["student_name"],
                    "school": row["school"] or "",
                    "current_bond_level": int(row["current_bond_level"]),
                    "current_bond_exp": int(row["current_bond_exp"]),
                    "target_bond_level": int(row["target_bond_level"]),
                    "priority": row["priority"] or "priority",
                    "notes": row["notes"] or "",
                    "required_exp": required_exp,
                    "progress": progress_ratio(
                        int(row["current_bond_level"]),
                        int(row["current_bond_exp"]),
                        int(row["target_bond_level"]),
                    ),
                }
            )
        return plans

    @synchronized
    def save_plan(
        self,
        student_id: int,
        target_bond_level: int,
        priority: str,
        notes: str = "",
        plan_id: int | None = None,
    ) -> int:
        if plan_id is None:
            existing = self.connection.execute(
                "SELECT id FROM user_plans WHERE student_id = ? ORDER BY id LIMIT 1",
                (student_id,),
            ).fetchone()
            if existing is not None:
                plan_id = int(existing["id"])

        if plan_id is None:
            cursor = self.connection.execute(
                """
                INSERT INTO user_plans(student_id, target_bond_level, priority, notes, updated_at)
                VALUES(?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (student_id, target_bond_level, priority, notes),
            )
            self.connection.commit()
            return int(cursor.lastrowid)

        self.connection.execute(
            """
            UPDATE user_plans
            SET student_id = ?, target_bond_level = ?, priority = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (student_id, target_bond_level, priority, notes, plan_id),
        )
        self.connection.commit()
        return int(plan_id)

    @synchronized
    def delete_plan(self, plan_id: int) -> None:
        self.connection.execute("DELETE FROM user_plans WHERE id = ?", (plan_id,))
        self.connection.commit()

    @synchronized
    def snapshot_for_optimizer(self) -> tuple[list[dict[str, Any]], dict[int, int], dict[int, dict[str, Any]], dict[int, dict[str, Any]]]:
        plans = [
            plan
            for plan in self.list_plans()
            if str(plan.get("priority")) in {"top_priority", "priority", "semi_priority"}
        ]
        inventory = self.get_inventory_map()
        boxes = self.list_boxes()
        students = {int(student["id"]): student for student in self.search_students()}
        items = {int(item["id"]): item for item in self.list_items()}
        selectable_box_quantity = int(boxes.get(SELECTABLE_BOX_KEY, 0) or 0)
        if selectable_box_quantity > 0:
            inventory[SELECTABLE_BOX_ITEM_ID] = inventory.get(SELECTABLE_BOX_ITEM_ID, 0) + selectable_box_quantity
            items[SELECTABLE_BOX_ITEM_ID] = {
                "id": SELECTABLE_BOX_ITEM_ID,
                "name": SELECTABLE_BOX_NAME,
                "tags": [],
                "rarity": "SR",
                "category": "Favor",
                "exp_value": 60,
                "gift_kind": "gift_box",
                "box_type": SELECTABLE_BOX_KEY,
                "icon_name": "",
                "icon_path": str(ITEM_IMAGE_DIR / SELECTABLE_BOX_ICON_FILE),
                "raw_json": {"box_type": SELECTABLE_BOX_KEY},
                "quantity": selectable_box_quantity,
            }
        return plans, inventory, students, items
