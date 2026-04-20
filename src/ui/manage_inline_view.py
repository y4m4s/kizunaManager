from __future__ import annotations

import tkinter as tk
from tkinter import messagebox, ttk

from src.bond_calculator import calc_required_exp
from src.config import PRIORITY_LABELS
from src.ui.reference_search_view import VerticalScrolledFrame


class ManageView(ttk.Frame):
    def __init__(self, parent, database, icon_store, on_data_changed) -> None:
        super().__init__(parent, padding=0)
        self.database = database
        self.icon_store = icon_store
        self.on_data_changed = on_data_changed

        self.all_students: dict[int, dict] = {}
        self.plans_by_student: dict[int, dict] = {}
        self.add_choice_map: dict[str, int] = {}
        self.row_images: dict[int, tk.PhotoImage] = {}
        self.row_vars: dict[int, dict[str, tk.StringVar]] = {}
        self.row_meta: dict[int, dict[str, object]] = {}

        self.priority_display_to_key = {label: key for key, label in PRIORITY_LABELS.items()}
        self.priority_key_to_display = PRIORITY_LABELS

        self.add_student_var = tk.StringVar()
        self.summary_var = tk.StringVar(value="管理中の生徒はまだいません。上の検索から追加できます。")

        self._build_ui()

    def _build_ui(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(2, weight=1)

        header = ttk.Frame(self, style="Card.TFrame", padding=14)
        header.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        header.columnconfigure(0, weight=1)
        ttk.Label(header, text="管理", style="Title.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(header, textvariable=self.summary_var, style="Muted.TLabel").grid(row=1, column=0, sticky="w", pady=(4, 0))

        add_card = ttk.Frame(self, style="Card.TFrame", padding=14)
        add_card.grid(row=1, column=0, sticky="ew", pady=(0, 12))
        add_card.columnconfigure(1, weight=1)
        ttk.Label(add_card, text="生徒を追加", style="SubTitle.TLabel").grid(row=0, column=0, sticky="w", padx=(0, 12))
        self.add_combo = ttk.Combobox(add_card, textvariable=self.add_student_var)
        self.add_combo.grid(row=0, column=1, sticky="ew")
        self.add_combo.bind("<KeyRelease>", self._on_add_query_change)
        self.add_combo.bind("<Return>", lambda _event: self._add_student_from_search())
        ttk.Button(add_card, text="管理に追加", style="Primary.TButton", command=self._add_student_from_search).grid(
            row=0, column=2, sticky="e", padx=(12, 0)
        )

        list_card = ttk.Frame(self, style="Card.TFrame", padding=12)
        list_card.grid(row=2, column=0, sticky="nsew")
        list_card.columnconfigure(0, weight=1)
        list_card.rowconfigure(1, weight=1)

        header_row = ttk.Frame(list_card, style="Card.TFrame")
        header_row.grid(row=0, column=0, sticky="ew", pady=(0, 8))
        header_row.columnconfigure(1, weight=1)
        header_row.columnconfigure(2, weight=0)
        header_row.columnconfigure(3, weight=0)
        header_row.columnconfigure(4, weight=0)
        header_row.columnconfigure(5, weight=0)
        ttk.Label(header_row, text="生徒", style="SubTitle.TLabel").grid(row=0, column=0, columnspan=2, sticky="w")
        ttk.Label(header_row, text="現在", style="SubTitle.TLabel").grid(row=0, column=2, sticky="w", padx=(8, 0))
        ttk.Label(header_row, text="目標", style="SubTitle.TLabel").grid(row=0, column=3, sticky="w", padx=(8, 0))
        ttk.Label(header_row, text="優先度", style="SubTitle.TLabel").grid(row=0, column=4, sticky="w", padx=(8, 0))
        ttk.Label(header_row, text="必要EXP", style="SubTitle.TLabel").grid(row=0, column=5, sticky="w", padx=(8, 0))

        self.rows_scroll = VerticalScrolledFrame(list_card)
        self.rows_scroll.grid(row=1, column=0, sticky="nsew")

    def refresh(self) -> None:
        students = self.database.search_students(sort_by="name")
        self.all_students = {int(student["id"]): student for student in students}
        self.plans_by_student = {int(plan["student_id"]): plan for plan in self.database.list_plans()}

        self._refresh_add_choices()
        self._render_rows()

    def _refresh_add_choices(self) -> None:
        query = self.add_student_var.get().strip().lower()
        managed_ids = self._managed_student_ids()
        matched = [
            student
            for student in self.all_students.values()
            if int(student["id"]) not in managed_ids and (not query or query in student["name"].lower())
        ]
        matched.sort(key=lambda row: row["name"])
        limited = matched[:40]
        self.add_choice_map = {self._student_label(student): int(student["id"]) for student in limited}
        self.add_combo.configure(values=list(self.add_choice_map.keys()))

    def _managed_student_ids(self) -> set[int]:
        managed_ids = set(self.plans_by_student)
        for student_id, student in self.all_students.items():
            if student["is_owned"]:
                managed_ids.add(student_id)
        return managed_ids

    def _student_label(self, student: dict) -> str:
        school = student.get("school") or "学校不明"
        return f"{student['name']} / {school}"

    def _on_add_query_change(self, _event=None) -> None:
        self._refresh_add_choices()

    def _resolve_add_student_id(self) -> int | None:
        value = self.add_student_var.get().strip()
        if value in self.add_choice_map:
            return self.add_choice_map[value]
        lowered = value.lower()
        for student in self.all_students.values():
            if student["name"].lower() == lowered:
                return int(student["id"])
        return None

    def _add_student_from_search(self) -> None:
        student_id = self._resolve_add_student_id()
        if student_id is None:
            messagebox.showwarning("追加できません", "追加したい生徒を候補から選んでください。")
            return
        self.database.upsert_user_student(student_id, 1, 0, "")
        self.add_student_var.set("")
        self.on_data_changed()

    def _render_rows(self) -> None:
        for child in self.rows_scroll.inner.winfo_children():
            child.destroy()
        self.row_images.clear()
        self.row_vars.clear()
        self.row_meta.clear()

        managed_ids = sorted(
            self._managed_student_ids(),
            key=lambda student_id: (
                0 if student_id in self.plans_by_student else 1,
                self.all_students[student_id]["name"],
            ),
        )

        total_required = 0
        priority_count = 0
        for row_index, student_id in enumerate(managed_ids):
            student = self.all_students[student_id]
            plan = self.plans_by_student.get(student_id)
            if plan is not None:
                total_required += int(plan["required_exp"])
                if str(plan.get("priority")) == "priority":
                    priority_count += 1
            self._render_row(row_index, student, plan)

        self.summary_var.set(
            f"管理中 {len(managed_ids)}人 / 優先 {priority_count}人 / 合計必要EXP {total_required:,}"
        )

        if not managed_ids:
            ttk.Label(
                self.rows_scroll.inner,
                text="管理中の生徒はいません。上の検索バーから追加できます。",
                style="Muted.TLabel",
            ).grid(row=0, column=0, sticky="w", pady=20)

    def _render_row(self, row_index: int, student: dict, plan: dict | None) -> None:
        student_id = int(student["id"])
        row = ttk.Frame(self.rows_scroll.inner, style="Card.TFrame", padding=(8, 6))
        row.grid(row=row_index, column=0, sticky="ew", pady=(0, 6))
        row.columnconfigure(1, weight=1)

        icon = self.icon_store.get(student.get("icon_path"), student["name"], size=(36, 36))
        self.row_images[student_id] = icon
        ttk.Label(row, image=icon).grid(row=0, column=0, sticky="w", padx=(0, 10))
        ttk.Label(row, text=student["name"]).grid(row=0, column=1, sticky="w")

        current_var = tk.StringVar(value=str(student["current_bond_level"]))
        target_var = tk.StringVar(value="" if plan is None else str(plan["target_bond_level"]))
        priority_var = tk.StringVar(
            value=self.priority_key_to_display.get(
                "priority" if plan is None else str(plan["priority"]),
                self.priority_key_to_display["priority"],
            )
        )
        required_var = tk.StringVar()
        self.row_vars[student_id] = {
            "current": current_var,
            "target": target_var,
            "priority": priority_var,
            "required": required_var,
        }
        self.row_meta[student_id] = {
            "saved_level": int(student["current_bond_level"]),
            "saved_exp": int(student.get("current_bond_exp", 0)),
            "notes": str(student.get("notes", "")),
        }

        ttk.Spinbox(row, from_=1, to=100, textvariable=current_var, width=6).grid(row=0, column=2, sticky="w", padx=(12, 0))
        ttk.Entry(row, textvariable=target_var, width=6).grid(row=0, column=3, sticky="w", padx=(12, 0))
        priority_combo = ttk.Combobox(
            row,
            textvariable=priority_var,
            values=list(self.priority_display_to_key.keys()),
            state="readonly",
            width=10,
        )
        priority_combo.grid(row=0, column=4, sticky="w", padx=(12, 0))
        ttk.Label(row, textvariable=required_var, width=12).grid(row=0, column=5, sticky="w", padx=(12, 0))
        ttk.Button(row, text="×", width=3, command=lambda value=student_id: self._confirm_remove_student(value)).grid(
            row=0, column=6, sticky="e", padx=(12, 0)
        )

        self._update_required_label(student_id)

        for widget in row.winfo_children():
            if isinstance(widget, (ttk.Entry, ttk.Spinbox)):
                widget.bind("<FocusOut>", lambda _event, value=student_id: self._save_row(value))
                widget.bind("<Return>", lambda _event, value=student_id: self._save_row(value))
        priority_combo.bind("<<ComboboxSelected>>", lambda _event, value=student_id: self._save_row(value))
        current_var.trace_add("write", lambda *_args, value=student_id: self._update_required_label(value))
        target_var.trace_add("write", lambda *_args, value=student_id: self._update_required_label(value))

    def _update_required_label(self, student_id: int) -> None:
        vars_by_row = self.row_vars.get(student_id)
        if vars_by_row is None:
            return
        try:
            current_level = max(1, min(100, int(vars_by_row["current"].get() or 1)))
        except ValueError:
            vars_by_row["required"].set("-")
            return
        current_exp = self._effective_current_exp(student_id, current_level)
        target_text = vars_by_row["target"].get().strip()
        if not target_text:
            vars_by_row["required"].set("-")
            return
        try:
            target_level = max(current_level, min(100, int(target_text)))
        except ValueError:
            vars_by_row["required"].set("-")
            return
        vars_by_row["required"].set(f"{calc_required_exp(current_level, current_exp, target_level):,}")

    def _effective_current_exp(self, student_id: int, current_level: int) -> int:
        meta = self.row_meta.get(student_id, {})
        saved_level = int(meta.get("saved_level", current_level))
        if current_level != saved_level:
            return 0
        return max(0, int(meta.get("saved_exp", 0)))

    def _save_row(self, student_id: int) -> None:
        vars_by_row = self.row_vars.get(student_id)
        if vars_by_row is None:
            return
        try:
            current_level = max(1, min(100, int(vars_by_row["current"].get() or 1)))
        except ValueError:
            messagebox.showwarning("入力エラー", "現在の絆は数字で入力してください。")
            self.on_data_changed()
            return

        meta = self.row_meta.get(student_id, {})
        current_exp = self._effective_current_exp(student_id, current_level)
        notes = str(meta.get("notes", ""))
        self.database.upsert_user_student(student_id, current_level, current_exp, notes)
        meta["saved_level"] = current_level
        meta["saved_exp"] = current_exp
        self.row_meta[student_id] = meta

        target_text = vars_by_row["target"].get().strip()
        existing_plan = self.plans_by_student.get(student_id)
        if not target_text:
            if existing_plan is not None:
                self.database.delete_plan(int(existing_plan["id"]))
        else:
            try:
                target_level = max(current_level, min(100, int(target_text)))
            except ValueError:
                messagebox.showwarning("入力エラー", "目標は数字で入力してください。")
                self.on_data_changed()
                return
            priority = self.priority_display_to_key.get(vars_by_row["priority"].get(), "priority")
            self.database.save_plan(
                student_id=student_id,
                target_bond_level=target_level,
                priority=priority,
                notes="",
                plan_id=None if existing_plan is None else int(existing_plan["id"]),
            )

        self.on_data_changed()

    def _confirm_remove_student(self, student_id: int) -> None:
        student = self.all_students.get(student_id)
        name = "この生徒"
        if student is not None:
            name = student["name"]
        if not messagebox.askyesno("管理から外す", f"{name} を管理から外しますか？"):
            return
        self.database.delete_user_student(student_id)
        self.on_data_changed()
