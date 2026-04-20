from __future__ import annotations

import tkinter as tk
from tkinter import messagebox, ttk

from src.config import PRIORITY_LABELS


class ManageView(ttk.Frame):
    def __init__(self, parent, database, icon_store, on_data_changed) -> None:
        super().__init__(parent, padding=0)
        self.database = database
        self.icon_store = icon_store
        self.on_data_changed = on_data_changed

        self.student_images: dict[int, tk.PhotoImage] = {}
        self.all_students: dict[int, dict] = {}
        self.add_choice_map: dict[str, int] = {}
        self.current_student_id: int | None = None
        self.current_plan_id: int | None = None

        self.priority_display_to_key = {label: key for key, label in PRIORITY_LABELS.items()}
        self.priority_key_to_display = PRIORITY_LABELS

        self.add_student_var = tk.StringVar()
        self.summary_var = tk.StringVar(value="管理中の生徒はまだいません。上の検索から追加できます。")
        self.selected_name_var = tk.StringVar(value="生徒を選択してください")
        self.selected_meta_var = tk.StringVar(value="左の一覧から生徒を選ぶと詳細を編集できます。")
        self.current_level_var = tk.StringVar(value="1")
        self.current_exp_var = tk.StringVar(value="0")
        self.target_level_var = tk.StringVar(value="")
        self.priority_var = tk.StringVar(value=self.priority_key_to_display["medium"])
        self.required_exp_var = tk.StringVar(value="必要EXP: -")

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

        body = ttk.Frame(self)
        body.grid(row=2, column=0, sticky="nsew")
        body.columnconfigure(0, weight=3)
        body.columnconfigure(1, weight=2)
        body.rowconfigure(0, weight=1)

        left = ttk.Frame(body, style="Card.TFrame", padding=12)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        left.columnconfigure(0, weight=1)
        left.rowconfigure(0, weight=1)

        self.student_tree = ttk.Treeview(left, columns=("current", "target", "required"), show="tree headings")
        self.student_tree.heading("#0", text="生徒")
        self.student_tree.heading("current", text="現在")
        self.student_tree.heading("target", text="目標")
        self.student_tree.heading("required", text="必要EXP")
        self.student_tree.column("#0", width=240, anchor="w")
        self.student_tree.column("current", width=90, anchor="center")
        self.student_tree.column("target", width=90, anchor="center")
        self.student_tree.column("required", width=110, anchor="e")
        self.student_tree.grid(row=0, column=0, sticky="nsew")
        self.student_tree.bind("<<TreeviewSelect>>", self._on_student_select)

        student_scroll = ttk.Scrollbar(left, orient="vertical", command=self.student_tree.yview)
        student_scroll.grid(row=0, column=1, sticky="ns")
        self.student_tree.configure(yscrollcommand=student_scroll.set)

        right = ttk.Frame(body, style="Card.TFrame", padding=16)
        right.grid(row=0, column=1, sticky="nsew")
        right.columnconfigure(1, weight=1)

        self.selected_icon_label = ttk.Label(right)
        self.selected_icon_label.grid(row=0, column=0, rowspan=2, sticky="nw")
        ttk.Label(right, textvariable=self.selected_name_var, style="Title.TLabel").grid(
            row=0, column=1, sticky="w", padx=(12, 0)
        )
        ttk.Label(right, textvariable=self.selected_meta_var, style="Muted.TLabel", wraplength=320, justify="left").grid(
            row=1, column=1, sticky="w", padx=(12, 0), pady=(4, 0)
        )

        ttk.Separator(right, orient="horizontal").grid(row=2, column=0, columnspan=2, sticky="ew", pady=14)

        ttk.Label(right, text="現在の絆Lv").grid(row=3, column=0, sticky="w", pady=4)
        ttk.Spinbox(right, from_=1, to=100, textvariable=self.current_level_var, width=8).grid(
            row=3, column=1, sticky="w", pady=4
        )

        ttk.Label(right, text="現在EXP").grid(row=4, column=0, sticky="w", pady=4)
        ttk.Entry(right, textvariable=self.current_exp_var).grid(row=4, column=1, sticky="ew", pady=4)

        ttk.Label(right, text="目標絆Lv").grid(row=5, column=0, sticky="w", pady=4)
        ttk.Entry(right, textvariable=self.target_level_var).grid(row=5, column=1, sticky="ew", pady=4)

        ttk.Label(right, text="優先度").grid(row=6, column=0, sticky="w", pady=4)
        ttk.Combobox(
            right,
            textvariable=self.priority_var,
            values=list(self.priority_display_to_key.keys()),
            state="readonly",
            width=12,
        ).grid(row=6, column=1, sticky="w", pady=4)

        ttk.Label(right, textvariable=self.required_exp_var, style="Muted.TLabel").grid(
            row=7, column=0, columnspan=2, sticky="w", pady=(10, 6)
        )

        action_row = ttk.Frame(right, style="Card.TFrame")
        action_row.grid(row=8, column=0, columnspan=2, sticky="ew", pady=(10, 0))
        ttk.Button(action_row, text="保存", style="Primary.TButton", command=self._save_current).pack(side="left", padx=(0, 8))
        ttk.Button(action_row, text="管理から外す", command=self._remove_current).pack(side="left")

        self._clear_detail()

    def refresh(self) -> None:
        students = self.database.search_students(sort_by="name")
        self.all_students = {int(student["id"]): student for student in students}
        plans_by_student = self._plans_by_student()
        managed_ids = self._managed_student_ids(plans_by_student)

        self._refresh_add_choices()

        current = self.current_student_id
        self.student_tree.delete(*self.student_tree.get_children())
        self.student_images.clear()

        total_required = 0
        ordered_ids = sorted(
            managed_ids,
            key=lambda student_id: (
                0 if student_id in plans_by_student else 1,
                self.all_students[student_id]["name"],
            ),
        )
        for student_id in ordered_ids:
            student = self.all_students[student_id]
            plan = plans_by_student.get(student_id)
            image = self.icon_store.get(student.get("icon_path"), student["name"], size=(32, 32))
            self.student_images[student_id] = image
            target_label = "-" if plan is None else f"Lv{plan['target_bond_level']}"
            required_label = "-" if plan is None else f"{int(plan['required_exp']):,}"
            total_required += 0 if plan is None else int(plan["required_exp"])
            self.student_tree.insert(
                "",
                "end",
                iid=str(student_id),
                text=student["name"],
                image=image,
                values=(f"Lv{student['current_bond_level']}", target_label, required_label),
            )

        self.summary_var.set(
            f"管理中 {len(ordered_ids)}人 / 計画あり {len(plans_by_student)}人 / 合計必要EXP {total_required:,}"
        )

        if current is not None and str(current) in self.student_tree.get_children():
            self.student_tree.selection_set(str(current))
            self.student_tree.focus(str(current))
            self._load_student(current)
        elif ordered_ids:
            first_id = ordered_ids[0]
            self.student_tree.selection_set(str(first_id))
            self.student_tree.focus(str(first_id))
            self._load_student(first_id)
        else:
            self._clear_detail()

    def _plans_by_student(self) -> dict[int, dict]:
        return {int(plan["student_id"]): plan for plan in self.database.list_plans()}

    def _managed_student_ids(self, plans_by_student: dict[int, dict]) -> set[int]:
        managed_ids = set(plans_by_student)
        for student_id, student in self.all_students.items():
            if student["is_owned"]:
                managed_ids.add(student_id)
        return managed_ids

    def _student_label(self, student: dict) -> str:
        school = student.get("school") or "学校不明"
        return f"{student['name']} / {school}"

    def _refresh_add_choices(self) -> None:
        query = self.add_student_var.get().strip().lower()
        managed_ids = self._managed_student_ids(self._plans_by_student())
        matched = [
            student
            for student in self.all_students.values()
            if int(student["id"]) not in managed_ids and (not query or query in student["name"].lower())
        ]
        matched.sort(key=lambda row: row["name"])
        limited = matched[:40]
        self.add_choice_map = {self._student_label(student): int(student["id"]) for student in limited}
        self.add_combo.configure(values=list(self.add_choice_map.keys()))

    def _resolve_add_student_id(self) -> int | None:
        value = self.add_student_var.get().strip()
        if value in self.add_choice_map:
            return self.add_choice_map[value]
        lowered = value.lower()
        for student in self.all_students.values():
            if student["name"].lower() == lowered:
                return int(student["id"])
        return None

    def _on_add_query_change(self, _event=None) -> None:
        self._refresh_add_choices()

    def _add_student_from_search(self) -> None:
        student_id = self._resolve_add_student_id()
        if student_id is None:
            messagebox.showwarning("追加できません", "追加したい生徒を候補から選んでください。")
            return

        self.current_student_id = student_id
        self.database.upsert_user_student(student_id, 1, 0, "")
        self.add_student_var.set("")
        self.on_data_changed()

    def _on_student_select(self, _event=None) -> None:
        selection = self.student_tree.selection()
        if not selection:
            return
        self._load_student(int(selection[0]))

    def _load_student(self, student_id: int) -> None:
        student = self.database.get_student(student_id)
        if student is None:
            return

        plan = self._plans_by_student().get(student_id)
        self.current_student_id = student_id
        self.current_plan_id = None if plan is None else int(plan["id"])

        icon = self.icon_store.get(student.get("icon_path"), student["name"], size=(64, 64))
        self.selected_icon_label.configure(image=icon)
        self.selected_icon_label.image = icon

        self.selected_name_var.set(student["name"])
        self.selected_meta_var.set(f"{student.get('school') or '学校不明'} / 現在 Lv{student['current_bond_level']}")
        self.current_level_var.set(str(student["current_bond_level"]))
        self.current_exp_var.set(str(student["current_bond_exp"]))
        self.target_level_var.set("" if plan is None else str(plan["target_bond_level"]))
        self.priority_var.set(
            self.priority_key_to_display.get(
                "medium" if plan is None else str(plan["priority"]),
                self.priority_key_to_display["medium"],
            )
        )
        self.required_exp_var.set("必要EXP: -" if plan is None else f"必要EXP: {int(plan['required_exp']):,}")

    def _save_current(self) -> None:
        if self.current_student_id is None:
            messagebox.showwarning("未選択", "左の一覧から生徒を選択してください。")
            return

        try:
            current_level = max(1, min(100, int(self.current_level_var.get() or 1)))
            current_exp = max(0, int(self.current_exp_var.get() or 0))
        except ValueError:
            messagebox.showwarning("入力エラー", "現在の絆LvとEXPは数字で入力してください。")
            return

        self.database.upsert_user_student(self.current_student_id, current_level, current_exp, "")

        target_text = self.target_level_var.get().strip()
        if not target_text:
            if self.current_plan_id is not None:
                self.database.delete_plan(self.current_plan_id)
                self.current_plan_id = None
        else:
            try:
                target_level = max(current_level, min(100, int(target_text)))
            except ValueError:
                messagebox.showwarning("入力エラー", "目標絆Lvは数字で入力してください。")
                return
            priority = self.priority_display_to_key.get(self.priority_var.get(), "medium")
            self.current_plan_id = self.database.save_plan(
                student_id=self.current_student_id,
                target_bond_level=target_level,
                priority=priority,
                notes="",
                plan_id=self.current_plan_id,
            )

        self.on_data_changed()

    def _remove_current(self) -> None:
        if self.current_student_id is None:
            return
        student_id = self.current_student_id
        self.current_student_id = None
        self.current_plan_id = None
        self.database.delete_user_student(student_id)
        self._clear_detail()
        self.on_data_changed()

    def _clear_detail(self) -> None:
        self.current_student_id = None
        self.current_plan_id = None
        self.selected_name_var.set("生徒を選択してください")
        self.selected_meta_var.set("左の一覧から生徒を選ぶと詳細を編集できます。")
        self.current_level_var.set("1")
        self.current_exp_var.set("0")
        self.target_level_var.set("")
        self.priority_var.set(self.priority_key_to_display["medium"])
        self.required_exp_var.set("必要EXP: -")
        placeholder = self.icon_store.get(None, "?", size=(64, 64))
        self.selected_icon_label.configure(image=placeholder)
        self.selected_icon_label.image = placeholder
