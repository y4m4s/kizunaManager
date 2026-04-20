from __future__ import annotations

import json
import threading
from typing import Any

from src.config import PRIORITY_LABELS
from src.database import Database
from src.master_data import cache_icons, update_master_data_with_icons
from src.optimizer import (
    EFFECT_ORDER,
    get_gift_effect,
    is_search_visible_match,
    optimize_allocation,
    sort_matching_items,
)

TABLE_EFFECTS = ("extra_large", "large", "medium")


class Api:
    """pywebview に公開する API クラス。
    パブリックメソッドはすべて JS から window.pywebview.api.method() で呼び出せる。
    戻り値は JSON シリアライズ可能な dict / list / str / int / float / bool / None に限定する。
    """

    def __init__(self, database: Database) -> None:
        self.database = database
        self._window = None
        self._task_thread: threading.Thread | None = None

    def set_window(self, window: Any) -> None:
        """pywebview の Window オブジェクトをセットする（起動後に呼ぶ）。"""
        self._window = window

    # ── マスターデータ ────────────────────────────────────────────

    def get_master_status(self) -> dict[str, Any]:
        """マスターデータの状態（件数・ソース・更新日時）を返す。"""
        counts = self.database.get_master_counts()
        source = self.database.get_meta("master_source") or "unknown"
        refreshed_at = self.database.get_meta("master_refreshed_at") or ""
        return {
            "counts": counts,
            "source": source,
            "refreshed_at": refreshed_at,
        }

    def update_master_data(self) -> dict[str, Any]:
        """マスターデータ＋アイコンをバックグラウンドで更新する。
        進捗は onMasterUpdateProgress イベントで通知し、
        完了時に onMasterUpdateDone / onMasterUpdateError を発火する。
        """
        if self._task_thread is not None and self._task_thread.is_alive():
            return {"error": "処理実行中です。完了してからお試しください。"}

        def run() -> None:
            worker_db = Database()
            try:
                worker_db.initialize()

                def progress(message: str, current: int, total: int) -> None:
                    self._emit("onMasterUpdateProgress", {
                        "message": message,
                        "current": current,
                        "total": total,
                    })

                result = update_master_data_with_icons(
                    worker_db, timeout=30, progress_callback=progress
                )
                self._emit("onMasterUpdateDone", {"result": result})
            except Exception as exc:
                self._emit("onMasterUpdateError", {"error": str(exc)})
            finally:
                worker_db.close()

        self._task_thread = threading.Thread(target=run, daemon=True)
        self._task_thread.start()
        return {"status": "started"}

    def download_icons(self) -> dict[str, Any]:
        """アイコン画像のみバックグラウンドでダウンロードする。"""
        if self._task_thread is not None and self._task_thread.is_alive():
            return {"error": "処理実行中です。完了してからお試しください。"}

        def run() -> None:
            worker_db = Database()
            try:
                worker_db.initialize()

                def progress(message: str, current: int, total: int) -> None:
                    self._emit("onIconDownloadProgress", {
                        "message": message,
                        "current": current,
                        "total": total,
                    })

                result = cache_icons(worker_db, timeout=30, progress_callback=progress)
                self._emit("onIconDownloadDone", {"result": result})
            except Exception as exc:
                self._emit("onIconDownloadError", {"error": str(exc)})
            finally:
                worker_db.close()

        self._task_thread = threading.Thread(target=run, daemon=True)
        self._task_thread.start()
        return {"status": "started"}

    # ── 生徒 ──────────────────────────────────────────────────────

    def search_students(
        self,
        query: str = "",
        school: str = "",
        sort_by: str = "name",
    ) -> list[dict[str, Any]]:
        return self.database.search_students(query=query, school=school, sort_by=sort_by)

    def list_schools(self) -> list[str]:
        return self.database.list_schools()

    def get_student(self, student_id: int) -> dict[str, Any] | None:
        return self.database.get_student(int(student_id))

    def upsert_user_student(
        self,
        student_id: int,
        current_bond_level: int,
        current_bond_exp: int,
        notes: str = "",
    ) -> dict[str, Any]:
        self.database.upsert_user_student(
            int(student_id), int(current_bond_level), int(current_bond_exp), notes
        )
        return {"ok": True}

    def delete_user_student(self, student_id: int) -> dict[str, Any]:
        self.database.delete_user_student(int(student_id))
        return {"ok": True}

    # ── アイテム / インベントリ ───────────────────────────────────

    def list_items(self) -> list[dict[str, Any]]:
        """ブーケを除く全贈り物を返す。"""
        return self.database.list_items()

    def get_inventory(self) -> dict[str, int]:
        """所持数マップを返す（キーは文字列に変換）。"""
        return {str(k): v for k, v in self.database.get_inventory_map().items()}

    def set_inventory_quantity(self, item_id: int, quantity: int) -> dict[str, Any]:
        self.database.set_inventory_quantity(int(item_id), int(quantity))
        return {"ok": True}

    def list_boxes(self) -> dict[str, int]:
        return self.database.list_boxes()

    def set_box_quantity(self, box_type: str, quantity: int) -> dict[str, Any]:
        self.database.set_box_quantity(box_type, int(quantity))
        return {"ok": True}

    # ── 検索 ──────────────────────────────────────────────────────

    def run_gift_search(self, gift_ids: list[int]) -> list[dict[str, Any]]:
        """贈り物 ID リストを条件に、相性のある生徒と効果一覧を返す。"""
        all_students = self.database.search_students(sort_by="name")
        all_items_raw = self.list_items()
        items_by_id = {int(item["id"]): item for item in all_items_raw}
        selected_items = [items_by_id[int(gid)] for gid in gift_ids if int(gid) in items_by_id]

        results: list[dict[str, Any]] = []
        for student in all_students:
            grouped: dict[str, list[dict]] = {effect: [] for effect in TABLE_EFFECTS}
            for item in selected_items:
                effect = get_gift_effect(student, item)
                if effect in grouped and is_search_visible_match(item, effect):
                    grouped[effect].append(self._slim_item(item))

            if not any(grouped.values()):
                continue

            results.append({
                "student_id": int(student["id"]),
                "student_name": student["name"],
                "icon_path": student.get("icon_path", ""),
                "effects": grouped,
            })

        def sort_key(row: dict) -> tuple:
            effects = row["effects"]
            best = max(EFFECT_ORDER[effect] for effect, items in effects.items() if items)
            return (
                -best,
                -len(effects["extra_large"]),
                -len(effects["large"]),
                -len(effects["medium"]),
                row["student_name"],
            )

        results.sort(key=sort_key)
        return results

    def run_student_search(self, student_ids: list[int]) -> list[dict[str, Any]]:
        """生徒 ID リストを条件に、各生徒に対する贈り物相性一覧を返す。"""
        all_students_raw = self.database.search_students(sort_by="name")
        all_students = {int(s["id"]): s for s in all_students_raw}
        all_items = self.list_items()
        inventory = self.database.get_inventory_map()

        results: list[dict[str, Any]] = []
        for sid in student_ids:
            student = all_students.get(int(sid))
            if student is None:
                continue
            grouped: dict[str, list[dict]] = {effect: [] for effect in TABLE_EFFECTS}
            for item in sort_matching_items(student, all_items, inventory, visible_only=True):
                effect = str(item.get("effect", ""))
                if effect in grouped:
                    grouped[effect].append(self._slim_item(item))
            if not any(grouped.values()):
                continue
            results.append({
                "student_id": int(student["id"]),
                "student_name": student["name"],
                "icon_path": student.get("icon_path", ""),
                "effects": grouped,
            })
        return results

    # ── プラン ────────────────────────────────────────────────────

    def list_plans(self) -> list[dict[str, Any]]:
        plans = self.database.list_plans()
        for plan in plans:
            plan["priority_label"] = PRIORITY_LABELS.get(plan.get("priority", ""), "")
        return plans

    def save_plan(
        self,
        student_id: int,
        target_bond_level: int,
        priority: str,
        notes: str = "",
        plan_id: int | None = None,
    ) -> dict[str, Any]:
        saved_id = self.database.save_plan(
            int(student_id), int(target_bond_level), priority, notes,
            int(plan_id) if plan_id is not None else None,
        )
        return {"ok": True, "plan_id": saved_id}

    def delete_plan(self, plan_id: int) -> dict[str, Any]:
        self.database.delete_plan(int(plan_id))
        return {"ok": True}

    # ── 最適化 ────────────────────────────────────────────────────

    def optimize(
        self,
        strategy: str = "priority",
        daily_cafe_taps: int = 0,
        daily_schedules: int = 0,
    ) -> dict[str, Any]:
        """贈り物配分を最適化して結果を返す。"""
        plans, inventory, students, items = self.database.snapshot_for_optimizer()
        if not plans:
            return {"error": "優先度「最優先」または「優先」のプランが登録されていません。"}
        return optimize_allocation(
            plans,
            inventory,
            students,
            items,
            strategy=strategy,
            daily_cafe_taps=max(0, int(daily_cafe_taps)),
            daily_schedules=max(0, int(daily_schedules)),
        )

    # ── 内部ユーティリティ ────────────────────────────────────────

    def _slim_item(self, item: dict) -> dict[str, Any]:
        """検索結果に必要なフィールドだけ抽出して返す。"""
        return {
            "id": item["id"],
            "name": item["name"],
            "rarity": item.get("rarity", ""),
            "icon_path": item.get("icon_path", ""),
            "effect": item.get("effect", ""),
            "effect_label": item.get("effect_label", ""),
            "gained_exp": item.get("gained_exp", 0),
            "quantity": item.get("quantity", 0),
            "gift_kind": item.get("gift_kind", "gift"),
        }

    def _emit(self, event: str, payload: dict) -> None:
        """JS 側の window.__pyEvent(event, payload) を呼び出す。"""
        if self._window is None:
            return
        safe = json.dumps(payload, ensure_ascii=False)
        self._window.evaluate_js(f"window.__pyEvent('{event}', {safe})")
