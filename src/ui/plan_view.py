from __future__ import annotations

import tkinter as tk
from tkinter import messagebox, ttk

from src.config import PRIORITY_LABELS


class PlanView(ttk.Frame):
    def __init__(self, parent, database, icon_store, on_data_changed) -> None:
        super().__init__(parent, padding=0)
        self.database = database
        self.icon_store = icon_store
        self.on_data_changed = on_data_changed

        self.plan_images: dict[int, tk.PhotoImage] = {}
        self.plan_choices: dict[str, int] = {}
        self.student_labels: dict[int, str] = {}
        self.current_plan_id: int | None = None
        self.priority_display_to_key = {label: key for key, label in PRIORITY_LABELS.items()}
        self.priority_key_to_display = PRIORITY_LABELS

        self.student_var = tk.StringVar()
        self.target_level_var = tk.StringVar(value="20")
        self.priority_var = tk.StringVar(value=self.priority_key_to_display["medium"])
        self.notes_var = tk.StringVar()
        self.total_required_var = tk.StringVar(value="合計必要EXP: 0")
        self.progress_text_var = tk.StringVar(value="進捗: 0%")

        self._build_ui()

    def _build_ui(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        header = ttk.Frame(self, style="Card.TFrame", padding=14)
        header.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        header.columnconfigure(0, weight=1)
        ttk.Label(header, text="絆上げ計画", style="Title.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(header, textvariable=self.total_required_var, style="Muted.TLabel").grid(row=1, column=0, sticky="w", pady=(4, 0))

        body = ttk.Frame(self)
        body.grid(row=1, column=0, sticky="nsew")
        body.columnconfigure(0, weight=3)
        body.columnconfigure(1, weight=2)
        body.rowconfigure(0, weight=1)

        left = ttk.Frame(body, style="Card.TFrame", padding=12)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        left.columnconfigure(0, weight=1)
        left.rowconfigure(0, weight=1)

        self.plan_tree = ttk.Treeview(left, columns=("current", "target", "exp", "priority", "progress"), show="tree headings")
        self.plan_tree.heading("#0", text="生徒")
        self.plan_tree.heading("current", text="現在")
        self.plan_tree.heading("target", text="目標")
        self.plan_tree.heading("exp", text="必要EXP")
        self.plan_tree.heading("priority", text="優先度")
        self.plan_tree.heading("progress", text="進捗")
        self.plan_tree.column("#0", width=180, anchor="w")
        self.plan_tree.column("current", width=80, anchor="center")
        self.plan_tree.column("target", width=80, anchor="center")
        self.plan_tree.column("exp", width=100, anchor="e")
        self.plan_tree.column("priority", width=80, anchor="center")
        self.plan_tree.column("progress", width=80, anchor="center")
        self.plan_tree.grid(row=0, column=0, sticky="nsew")
        self.plan_tree.bind("<<TreeviewSelect>>", self._on_plan_select)

        plan_scroll = ttk.Scrollbar(left, orient="vertical", command=self.plan_tree.yview)
        plan_scroll.grid(row=0, column=1, sticky="ns")
        self.plan_tree.configure(yscrollcommand=plan_scroll.set)

        right = ttk.LabelFrame(body, text="計画の追加 / 編集", padding=14)
        right.grid(row=0, column=1, sticky="nsew")
        right.columnconfigure(1, weight=1)

        ttk.Label(right, text="生徒").grid(row=0, column=0, sticky="w", pady=4)
        self.student_combo = ttk.Combobox(right, textvariable=self.student_var)
        self.student_combo.grid(row=0, column=1, sticky="ew", pady=4)

        ttk.Label(right, text="目標絆Lv").grid(row=1, column=0, sticky="w", pady=4)
        ttk.Spinbox(right, from_=1, to=100, textvariable=self.target_level_var, width=8).grid(
            row=1, column=1, sticky="w", pady=4
        )

        ttk.Label(right, text="優先度").grid(row=2, column=0, sticky="w", pady=4)
        self.priority_combo = ttk.Combobox(
            right,
            textvariable=self.priority_var,
            values=list(self.priority_display_to_key.keys()),
            state="readonly",
            width=10,
        )
        self.priority_combo.grid(row=2, column=1, sticky="w", pady=4)

        ttk.Label(right, text="メモ").grid(row=3, column=0, sticky="w", pady=4)
        ttk.Entry(right, textvariable=self.notes_var).grid(row=3, column=1, sticky="ew", pady=4)

        ttk.Label(right, textvariable=self.progress_text_var, style="Muted.TLabel").grid(
            row=4, column=0, columnspan=2, sticky="w", pady=(10, 4)
        )
        self.progress_bar = ttk.Progressbar(right, maximum=100)
        self.progress_bar.grid(row=5, column=0, columnspan=2, sticky="ew")

        button_row = ttk.Frame(right)
        button_row.grid(row=6, column=0, columnspan=2, sticky="ew", pady=(12, 0))
        ttk.Button(button_row, text="保存", style="Primary.TButton", command=self._save_plan).pack(side="left", padx=(0, 8))
        ttk.Button(button_row, text="削除", command=self._delete_plan).pack(side="left", padx=(0, 8))
        ttk.Button(button_row, text="入力クリア", command=self._clear_form).pack(side="left")

        ttk.Label(
            right,
            text="所持キャラがいる場合はその一覧を優先表示し、未登録キャラも必要ならそのまま計画に追加できます。",
            style="Muted.TLabel",
            wraplength=320,
            justify="left",
        ).grid(row=7, column=0, columnspan=2, sticky="w", pady=(12, 0))

    def refresh(self) -> None:
        owned_students = self.database.list_owned_students()
        candidates = owned_students if owned_students else self.database.search_students()
        name_counts: dict[str, int] = {}
        for student in candidates:
            name_counts[student["name"]] = name_counts.get(student["name"], 0) + 1

        self.plan_choices = {}
        self.student_labels = {}
        for student in candidates:
            label = student["name"]
            if name_counts[label] > 1:
                label = f"{label} [ID:{student['id']}]"
            self.plan_choices[label] = int(student["id"])
            self.student_labels[int(student["id"])] = label
        self.student_combo.configure(values=list(self.plan_choices.keys()))

        plans = self.database.list_plans()
        self.plan_tree.delete(*self.plan_tree.get_children())
        self.plan_images.clear()

        total_required = 0
        for plan in plans:
            total_required += int(plan["required_exp"])
            student = self.database.get_student(plan["student_id"])
            image = self.icon_store.get(
                None if student is None else student.get("icon_path"),
                plan["student_name"],
                size=(32, 32),
            )
            self.plan_images[int(plan["student_id"])] = image
            self.plan_tree.insert(
                "",
                "end",
                iid=str(plan["id"]),
                text=plan["student_name"],
                image=image,
                values=(
                    f"Lv{plan['current_bond_level']}",
                    f"Lv{plan['target_bond_level']}",
                    plan["required_exp"],
                    PRIORITY_LABELS.get(plan["priority"], plan["priority"]),
                    f"{int(plan['progress'] * 100)}%",
                ),
            )

        self.total_required_var.set(f"合計必要EXP: {total_required:,}")

        if self.current_plan_id is not None and str(self.current_plan_id) in self.plan_tree.get_children():
            self.plan_tree.selection_set(str(self.current_plan_id))
            self.plan_tree.focus(str(self.current_plan_id))
            self._on_plan_select()

    def _on_plan_select(self, _event=None) -> None:
        selection = self.plan_tree.selection()
        if not selection:
            return

        plan_id = int(selection[0])
        plan = next((row for row in self.database.list_plans() if int(row["id"]) == plan_id), None)
        if plan is None:
            return

        self.current_plan_id = plan_id
        label = self.student_labels.get(int(plan["student_id"]), plan["student_name"])
        self.student_var.set(label)
        self.target_level_var.set(str(plan["target_bond_level"]))
        self.priority_var.set(self.priority_key_to_display.get(plan["priority"], self.priority_key_to_display["medium"]))
        self.notes_var.set(plan["notes"])
        self._set_progress(plan["progress"])

    def _save_plan(self) -> None:
        student_id = self.plan_choices.get(self.student_var.get().strip())
        if student_id is None:
            messagebox.showwarning("入力エラー", "対象の生徒を候補から選択してください。")
            return

        try:
            target_level = max(1, min(100, int(self.target_level_var.get())))
        except ValueError:
            messagebox.showwarning("入力エラー", "目標絆Lvは整数で入力してください。")
            return

        priority = self.priority_display_to_key.get(self.priority_var.get().strip(), "medium")
        self.current_plan_id = self.database.save_plan(
            student_id=student_id,
            target_bond_level=target_level,
            priority=priority,
            notes=self.notes_var.get().strip(),
            plan_id=self.current_plan_id,
        )
        self.on_data_changed()

    def _delete_plan(self) -> None:
        if self.current_plan_id is None:
            return
        self.database.delete_plan(self.current_plan_id)
        self._clear_form()
        self.on_data_changed()

    def _clear_form(self) -> None:
        self.current_plan_id = None
        self.student_var.set("")
        self.target_level_var.set("20")
        self.priority_var.set(self.priority_key_to_display["medium"])
        self.notes_var.set("")
        self._set_progress(0.0)
        self.plan_tree.selection_remove(self.plan_tree.selection())

    def _set_progress(self, value: float) -> None:
        percentage = max(0.0, min(1.0, float(value)))
        self.progress_bar["value"] = percentage * 100
        self.progress_text_var.set(f"進捗: {int(percentage * 100)}%")
