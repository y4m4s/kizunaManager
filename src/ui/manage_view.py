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
        self.student_choices: dict[str, int] = {}
        self.student_labels: dict[int, str] = {}
        self.current_student_id: int | None = None
        self.current_plan_id: int | None = None
        self.priority_display_to_key = {label: key for key, label in PRIORITY_LABELS.items()}
        self.priority_key_to_display = PRIORITY_LABELS

        self.student_var = tk.StringVar()
        self.current_level_var = tk.StringVar(value="1")
        self.current_exp_var = tk.StringVar(value="0")
        self.target_level_var = tk.StringVar()
        self.priority_var = tk.StringVar(value=self.priority_key_to_display["medium"])
        self.owned_notes_var = tk.StringVar()
        self.plan_notes_var = tk.StringVar()
        self.summary_var = tk.StringVar(value="管理中のキャラをここでまとめて編集できます。")
        self.required_exp_var = tk.StringVar(value="必要EXP: -")

        self._build_ui()

    def _build_ui(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        header = ttk.Frame(self, style="Card.TFrame", padding=14)
        header.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        header.columnconfigure(0, weight=1)
        ttk.Label(header, text="管理", style="Title.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(header, textvariable=self.summary_var, style="Muted.TLabel").grid(row=1, column=0, sticky="w", pady=(4, 0))

        body = ttk.Frame(self)
        body.grid(row=1, column=0, sticky="nsew")
        body.columnconfigure(0, weight=3)
        body.columnconfigure(1, weight=2)
        body.rowconfigure(0, weight=1)

        left = ttk.Frame(body, style="Card.TFrame", padding=12)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        left.columnconfigure(0, weight=1)
        left.rowconfigure(0, weight=1)

        self.student_tree = ttk.Treeview(left, columns=("current", "target", "required"), show="tree headings")
        self.student_tree.heading("#0", text="生徒")
        self.student_tree.heading("current", text="現在絆")
        self.student_tree.heading("target", text="目標")
        self.student_tree.heading("required", text="必要EXP")
        self.student_tree.column("#0", width=220, anchor="w")
        self.student_tree.column("current", width=90, anchor="center")
        self.student_tree.column("target", width=90, anchor="center")
        self.student_tree.column("required", width=110, anchor="e")
        self.student_tree.grid(row=0, column=0, sticky="nsew")
        self.student_tree.bind("<<TreeviewSelect>>", self._on_student_select)

        student_scroll = ttk.Scrollbar(left, orient="vertical", command=self.student_tree.yview)
        student_scroll.grid(row=0, column=1, sticky="ns")
        self.student_tree.configure(yscrollcommand=student_scroll.set)

        right = ttk.LabelFrame(body, text="キャラ管理 / 計画", padding=14)
        right.grid(row=0, column=1, sticky="nsew")
        right.columnconfigure(1, weight=1)

        ttk.Label(right, text="生徒").grid(row=0, column=0, sticky="w", pady=4)
        self.student_combo = ttk.Combobox(right, textvariable=self.student_var)
        self.student_combo.grid(row=0, column=1, sticky="ew", pady=4)
        self.student_combo.bind("<<ComboboxSelected>>", self._on_student_combo_selected)

        ttk.Label(right, text="現在絆Lv").grid(row=1, column=0, sticky="w", pady=4)
        ttk.Spinbox(right, from_=1, to=100, textvariable=self.current_level_var, width=8).grid(
            row=1, column=1, sticky="w", pady=4
        )

        ttk.Label(right, text="現在EXP").grid(row=2, column=0, sticky="w", pady=4)
        ttk.Entry(right, textvariable=self.current_exp_var).grid(row=2, column=1, sticky="ew", pady=4)

        ttk.Label(right, text="目標絆Lv").grid(row=3, column=0, sticky="w", pady=4)
        ttk.Entry(right, textvariable=self.target_level_var).grid(row=3, column=1, sticky="ew", pady=4)

        ttk.Label(right, text="優先度").grid(row=4, column=0, sticky="w", pady=4)
        self.priority_combo = ttk.Combobox(
            right,
            textvariable=self.priority_var,
            values=list(self.priority_display_to_key.keys()),
            state="readonly",
            width=10,
        )
        self.priority_combo.grid(row=4, column=1, sticky="w", pady=4)

        ttk.Label(right, text="所持メモ").grid(row=5, column=0, sticky="w", pady=4)
        ttk.Entry(right, textvariable=self.owned_notes_var).grid(row=5, column=1, sticky="ew", pady=4)

        ttk.Label(right, text="計画メモ").grid(row=6, column=0, sticky="w", pady=4)
        ttk.Entry(right, textvariable=self.plan_notes_var).grid(row=6, column=1, sticky="ew", pady=4)

        ttk.Label(right, textvariable=self.required_exp_var, style="Muted.TLabel").grid(
            row=7, column=0, columnspan=2, sticky="w", pady=(10, 4)
        )

        action_row = ttk.Frame(right)
        action_row.grid(row=8, column=0, columnspan=2, sticky="ew", pady=(12, 0))
        ttk.Button(action_row, text="所持を保存", style="Primary.TButton", command=self._save_student).pack(
            side="left", padx=(0, 8)
        )
        ttk.Button(action_row, text="計画を保存", command=self._save_plan).pack(side="left", padx=(0, 8))

        secondary_row = ttk.Frame(right)
        secondary_row.grid(row=9, column=0, columnspan=2, sticky="ew", pady=(8, 0))
        ttk.Button(secondary_row, text="計画削除", command=self._delete_plan).pack(side="left", padx=(0, 8))
        ttk.Button(secondary_row, text="キャラ削除", command=self._delete_student).pack(side="left", padx=(0, 8))
        ttk.Button(secondary_row, text="入力クリア", command=self._clear_form).pack(side="left")

        ttk.Label(
            right,
            text="左の一覧には所持済み、または計画がある生徒を表示します。ここで現在絆と目標をまとめて更新できます。",
            style="Muted.TLabel",
            wraplength=320,
            justify="left",
        ).grid(row=10, column=0, columnspan=2, sticky="w", pady=(12, 0))

    def refresh(self) -> None:
        students = self.database.search_students(sort_by="name")
        all_students = {int(student["id"]): student for student in students}
        plans_by_student = self._plans_by_student()

        name_counts: dict[str, int] = {}
        for student in students:
            name_counts[student["name"]] = name_counts.get(student["name"], 0) + 1

        self.student_choices = {}
        self.student_labels = {}
        for student in students:
            label = student["name"]
            if name_counts[label] > 1:
                label = f"{label} [ID:{student['id']}]"
            self.student_choices[label] = int(student["id"])
            self.student_labels[int(student["id"])] = label
        self.student_combo.configure(values=list(self.student_choices.keys()))

        managed_ids = {
            student_id
            for student_id, student in all_students.items()
            if student["is_owned"] or student_id in plans_by_student
        }
        ordered_ids = sorted(
            managed_ids,
            key=lambda student_id: (
                0 if student_id in plans_by_student else 1,
                0 if all_students[student_id]["is_owned"] else 1,
                all_students[student_id]["name"],
            ),
        )

        current = self.current_student_id
        self.student_tree.delete(*self.student_tree.get_children())
        self.student_images.clear()

        total_required = 0
        for student_id in ordered_ids:
            student = all_students[student_id]
            plan = plans_by_student.get(student_id)
            image = self.icon_store.get(student.get("icon_path"), student["name"], size=(32, 32))
            self.student_images[student_id] = image
            current_label = (
                f"Lv{student['current_bond_level']}"
                if student["is_owned"]
                else (f"Lv{plan['current_bond_level']}" if plan is not None else "-")
            )
            target_label = "-" if plan is None else f"Lv{plan['target_bond_level']}"
            required_label = "-" if plan is None else f"{plan['required_exp']:,}"
            total_required += 0 if plan is None else int(plan["required_exp"])
            self.student_tree.insert(
                "",
                "end",
                iid=str(student_id),
                text=student["name"],
                image=image,
                values=(current_label, target_label, required_label),
            )

        self.summary_var.set(
            f"管理中 {len(ordered_ids)}人 / 計画 {len(plans_by_student)}件 / 合計必要EXP {total_required:,}"
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
            self.current_student_id = None
            self.current_plan_id = None
            self.required_exp_var.set("必要EXP: -")

    def _plans_by_student(self) -> dict[int, dict[str, object]]:
        return {int(plan["student_id"]): plan for plan in self.database.list_plans()}

    def _resolve_selected_student_id(self) -> int | None:
        return self.student_choices.get(self.student_var.get().strip())

    def _on_student_select(self, _event=None) -> None:
        selection = self.student_tree.selection()
        if not selection:
            return
        self._load_student(int(selection[0]))

    def _on_student_combo_selected(self, _event=None) -> None:
        student_id = self._resolve_selected_student_id()
        if student_id is None:
            return
        if str(student_id) in self.student_tree.get_children():
            self.student_tree.selection_set(str(student_id))
            self.student_tree.focus(str(student_id))
        else:
            self.student_tree.selection_remove(self.student_tree.selection())
        self._load_student(student_id)

    def _load_student(self, student_id: int) -> None:
        student = self.database.get_student(student_id)
        if student is None:
            return

        plan = self._plans_by_student().get(student_id)
        self.current_student_id = student_id
        self.current_plan_id = None if plan is None else int(plan["id"])
        self.student_var.set(self.student_labels.get(student_id, student["name"]))
        self.current_level_var.set(str(student["current_bond_level"]))
        self.current_exp_var.set(str(student["current_bond_exp"]))
        self.target_level_var.set("" if plan is None else str(plan["target_bond_level"]))
        self.priority_var.set(
            self.priority_key_to_display.get(
                "medium" if plan is None else str(plan["priority"]),
                self.priority_key_to_display["medium"],
            )
        )
        self.owned_notes_var.set(student["notes"])
        self.plan_notes_var.set("" if plan is None else str(plan["notes"]))
        if plan is None:
            self.required_exp_var.set("必要EXP: -")
        else:
            self.required_exp_var.set(f"必要EXP: {int(plan['required_exp']):,}")

    def _save_student(self) -> None:
        student_id = self._resolve_selected_student_id()
        if student_id is None:
            messagebox.showwarning("入力エラー", "対象の生徒を候補から選択してください。")
            return

        try:
            level = max(1, min(100, int(self.current_level_var.get())))
            current_exp = max(0, int(self.current_exp_var.get() or 0))
        except ValueError:
            messagebox.showwarning("入力エラー", "現在絆Lv / 現在EXP は整数で入力してください。")
            return

        self.current_student_id = student_id
        self.database.upsert_user_student(student_id, level, current_exp, self.owned_notes_var.get().strip())
        self.on_data_changed()

    def _save_plan(self) -> None:
        student_id = self._resolve_selected_student_id()
        if student_id is None:
            messagebox.showwarning("入力エラー", "対象の生徒を候補から選択してください。")
            return
        if not self.target_level_var.get().strip():
            messagebox.showwarning("入力エラー", "目標絆Lvを入力してください。不要なら計画削除を使ってください。")
            return

        try:
            target_level = max(1, min(100, int(self.target_level_var.get())))
        except ValueError:
            messagebox.showwarning("入力エラー", "目標絆Lvは整数で入力してください。")
            return

        priority = self.priority_display_to_key.get(self.priority_var.get().strip(), "medium")
        plan_id = self.current_plan_id if self.current_student_id == student_id else None
        self.current_student_id = student_id
        self.current_plan_id = self.database.save_plan(
            student_id=student_id,
            target_bond_level=target_level,
            priority=priority,
            notes=self.plan_notes_var.get().strip(),
            plan_id=plan_id,
        )
        self.on_data_changed()

    def _delete_plan(self) -> None:
        student_id = self._resolve_selected_student_id() or self.current_student_id
        plan = self._plans_by_student().get(-1 if student_id is None else student_id)
        if plan is None:
            return

        self.current_plan_id = None
        self.database.delete_plan(int(plan["id"]))
        self.on_data_changed()

    def _delete_student(self) -> None:
        student_id = self._resolve_selected_student_id() or self.current_student_id
        if student_id is None:
            return
        self.current_student_id = None
        self.current_plan_id = None
        self.database.delete_user_student(student_id)
        self._clear_form()
        self.on_data_changed()

    def _clear_form(self) -> None:
        self.current_student_id = None
        self.current_plan_id = None
        self.student_var.set("")
        self.current_level_var.set("1")
        self.current_exp_var.set("0")
        self.target_level_var.set("")
        self.priority_var.set(self.priority_key_to_display["medium"])
        self.owned_notes_var.set("")
        self.plan_notes_var.set("")
        self.required_exp_var.set("必要EXP: -")
        self.student_tree.selection_remove(self.student_tree.selection())
