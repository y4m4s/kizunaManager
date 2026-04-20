from __future__ import annotations

import tkinter as tk
from tkinter import messagebox, ttk

from src.config import GIFT_BOX_TYPES


class InventoryView(ttk.Frame):
    def __init__(self, parent, database, icon_store, on_data_changed) -> None:
        super().__init__(parent, padding=0)
        self.database = database
        self.icon_store = icon_store
        self.on_data_changed = on_data_changed

        self.student_images: dict[int, tk.PhotoImage] = {}
        self.item_images: dict[int, tk.PhotoImage] = {}
        self.student_choices: dict[str, int] = {}
        self.student_labels: dict[int, str] = {}
        self.current_student_id: int | None = None
        self.current_item_id: int | None = None

        self.student_picker_var = tk.StringVar()
        self.student_level_var = tk.StringVar(value="1")
        self.student_exp_var = tk.StringVar(value="0")
        self.student_notes_var = tk.StringVar()

        self.item_query_var = tk.StringVar()
        self.item_quantity_var = tk.StringVar(value="0")
        self.item_name_var = tk.StringVar(value="贈り物を選択してください")
        self.box_vars = {key: tk.StringVar(value="0") for key, _ in GIFT_BOX_TYPES}

        self._build_ui()
        self.item_query_var.trace_add("write", lambda *_: self._reload_items())

    def _build_ui(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)

        notebook = ttk.Notebook(self)
        notebook.grid(row=0, column=0, sticky="nsew")

        student_tab = ttk.Frame(notebook, padding=14)
        gift_tab = ttk.Frame(notebook, padding=14)
        notebook.add(student_tab, text="キャラ管理")
        notebook.add(gift_tab, text="贈り物管理")

        self._build_student_tab(student_tab)
        self._build_gift_tab(gift_tab)

    def _build_student_tab(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(0, weight=1)
        parent.columnconfigure(1, weight=1)
        parent.rowconfigure(0, weight=1)

        left = ttk.Frame(parent, style="Card.TFrame", padding=12)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        left.columnconfigure(0, weight=1)
        left.rowconfigure(0, weight=1)

        self.student_tree = ttk.Treeview(left, columns=("bond",), show="tree headings")
        self.student_tree.heading("#0", text="生徒")
        self.student_tree.heading("bond", text="絆")
        self.student_tree.column("#0", width=220, anchor="w")
        self.student_tree.column("bond", width=90, anchor="center")
        self.student_tree.grid(row=0, column=0, sticky="nsew")
        self.student_tree.bind("<<TreeviewSelect>>", self._on_student_select)

        student_scroll = ttk.Scrollbar(left, orient="vertical", command=self.student_tree.yview)
        student_scroll.grid(row=0, column=1, sticky="ns")
        self.student_tree.configure(yscrollcommand=student_scroll.set)

        right = ttk.LabelFrame(parent, text="所持キャラの編集", padding=14)
        right.grid(row=0, column=1, sticky="nsew")
        right.columnconfigure(1, weight=1)

        ttk.Label(right, text="生徒").grid(row=0, column=0, sticky="w", pady=4)
        self.student_picker = ttk.Combobox(right, textvariable=self.student_picker_var)
        self.student_picker.grid(row=0, column=1, sticky="ew", pady=4)

        ttk.Label(right, text="現在絆Lv").grid(row=1, column=0, sticky="w", pady=4)
        ttk.Spinbox(right, from_=1, to=100, textvariable=self.student_level_var, width=8).grid(
            row=1, column=1, sticky="w", pady=4
        )

        ttk.Label(right, text="現在EXP").grid(row=2, column=0, sticky="w", pady=4)
        ttk.Entry(right, textvariable=self.student_exp_var).grid(row=2, column=1, sticky="ew", pady=4)

        ttk.Label(right, text="メモ").grid(row=3, column=0, sticky="w", pady=4)
        ttk.Entry(right, textvariable=self.student_notes_var).grid(row=3, column=1, sticky="ew", pady=4)

        button_row = ttk.Frame(right)
        button_row.grid(row=4, column=0, columnspan=2, sticky="ew", pady=(12, 0))
        ttk.Button(button_row, text="保存", style="Primary.TButton", command=self._save_student).pack(
            side="left", padx=(0, 8)
        )
        ttk.Button(button_row, text="削除", command=self._delete_student).pack(side="left", padx=(0, 8))
        ttk.Button(button_row, text="入力クリア", command=self._clear_student_form).pack(side="left")

        ttk.Label(
            right,
            text="生徒を選ぶと所持データとして登録されます。検索画面からのクイック追加にも対応しています。",
            style="Muted.TLabel",
            wraplength=320,
            justify="left",
        ).grid(row=5, column=0, columnspan=2, sticky="w", pady=(12, 0))

    def _build_gift_tab(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(0, weight=3)
        parent.columnconfigure(1, weight=2)
        parent.rowconfigure(1, weight=1)

        header = ttk.Frame(parent, style="Card.TFrame", padding=12)
        header.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        header.columnconfigure(1, weight=1)
        ttk.Label(header, text="贈り物検索", style="SubTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Entry(header, textvariable=self.item_query_var).grid(row=0, column=1, sticky="ew", padx=(12, 0))

        left = ttk.Frame(parent, style="Card.TFrame", padding=12)
        left.grid(row=1, column=0, sticky="nsew", padx=(0, 8))
        left.columnconfigure(0, weight=1)
        left.rowconfigure(0, weight=1)

        self.item_tree = ttk.Treeview(left, columns=("rarity", "exp", "qty"), show="tree headings")
        self.item_tree.heading("#0", text="贈り物")
        self.item_tree.heading("rarity", text="区分")
        self.item_tree.heading("exp", text="基礎EXP")
        self.item_tree.heading("qty", text="所持数")
        self.item_tree.column("#0", width=260, anchor="w")
        self.item_tree.column("rarity", width=90, anchor="center")
        self.item_tree.column("exp", width=90, anchor="e")
        self.item_tree.column("qty", width=90, anchor="e")
        self.item_tree.grid(row=0, column=0, sticky="nsew")
        self.item_tree.bind("<<TreeviewSelect>>", self._on_item_select)

        item_scroll = ttk.Scrollbar(left, orient="vertical", command=self.item_tree.yview)
        item_scroll.grid(row=0, column=1, sticky="ns")
        self.item_tree.configure(yscrollcommand=item_scroll.set)

        right = ttk.Frame(parent, style="Card.TFrame", padding=12)
        right.grid(row=1, column=1, sticky="nsew")
        right.columnconfigure(1, weight=1)

        ttk.Label(right, textvariable=self.item_name_var, style="SubTitle.TLabel").grid(
            row=0, column=0, columnspan=2, sticky="w"
        )
        ttk.Label(right, text="所持数").grid(row=1, column=0, sticky="w", pady=(10, 4))
        ttk.Entry(right, textvariable=self.item_quantity_var).grid(row=1, column=1, sticky="ew", pady=(10, 4))
        ttk.Button(right, text="数量を保存", style="Primary.TButton", command=self._save_item_quantity).grid(
            row=2, column=0, columnspan=2, sticky="w", pady=(8, 16)
        )

        box_frame = ttk.LabelFrame(right, text="選択式ボックス在庫", padding=12)
        box_frame.grid(row=3, column=0, columnspan=2, sticky="ew")
        box_frame.columnconfigure(1, weight=1)
        box_frame.columnconfigure(3, weight=1)
        for index, (key, label) in enumerate(GIFT_BOX_TYPES):
            row = index // 2
            col = (index % 2) * 2
            ttk.Label(box_frame, text=label).grid(row=row, column=col, sticky="w", padx=(0, 8), pady=4)
            ttk.Entry(box_frame, textvariable=self.box_vars[key], width=10).grid(
                row=row, column=col + 1, sticky="ew", pady=4
            )

        ttk.Button(right, text="ボックス在庫を保存", command=self._save_boxes).grid(
            row=4, column=0, columnspan=2, sticky="w", pady=(12, 0)
        )
        ttk.Label(
            right,
            text="現行版では選択式ボックスは在庫として保持し、最適化画面では参考情報として扱います。",
            style="Muted.TLabel",
            wraplength=320,
            justify="left",
        ).grid(row=5, column=0, columnspan=2, sticky="w", pady=(12, 0))

    def refresh(self) -> None:
        self._reload_students()
        self._reload_items()
        self._reload_boxes()

    def _reload_students(self) -> None:
        students = self.database.search_students()
        owned_students = [student for student in students if student["is_owned"]]

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
        self.student_picker.configure(values=list(self.student_choices.keys()))

        current = self.current_student_id
        self.student_tree.delete(*self.student_tree.get_children())
        self.student_images.clear()
        for student in owned_students:
            image = self.icon_store.get(student.get("icon_path"), student["name"], size=(32, 32))
            self.student_images[int(student["id"])] = image
            self.student_tree.insert(
                "",
                "end",
                iid=str(student["id"]),
                text=student["name"],
                image=image,
                values=(f"Lv{student['current_bond_level']}",),
            )

        if current is not None and str(current) in self.student_tree.get_children():
            self.student_tree.selection_set(str(current))
            self.student_tree.focus(str(current))

    def _reload_items(self) -> None:
        query = self.item_query_var.get().strip()
        items = self.database.list_items(query=query)
        current = self.current_item_id

        self.item_tree.delete(*self.item_tree.get_children())
        self.item_images.clear()
        for item in items:
            image = self.icon_store.get(item.get("icon_path"), item["name"], size=(30, 30))
            self.item_images[int(item["id"])] = image
            rarity = "花束" if item["gift_kind"] == "bouquet" else (item["rarity"] or "-")
            self.item_tree.insert(
                "",
                "end",
                iid=str(item["id"]),
                text=item["name"],
                image=image,
                values=(rarity, item["exp_value"], item["quantity"]),
            )

        if current is not None and str(current) in self.item_tree.get_children():
            self.item_tree.selection_set(str(current))
            self.item_tree.focus(str(current))

    def _reload_boxes(self) -> None:
        stored = self.database.list_boxes()
        for key, variable in self.box_vars.items():
            variable.set(str(stored.get(key, 0)))

    def _on_student_select(self, _event=None) -> None:
        selection = self.student_tree.selection()
        if not selection:
            return
        student_id = int(selection[0])
        student = self.database.get_student(student_id)
        if student is None:
            return

        self.current_student_id = student_id
        label = self.student_labels.get(student_id, student["name"])
        self.student_picker_var.set(label)
        self.student_level_var.set(str(student["current_bond_level"]))
        self.student_exp_var.set(str(student["current_bond_exp"]))
        self.student_notes_var.set(student["notes"])

    def _save_student(self) -> None:
        student_id = self.student_choices.get(self.student_picker_var.get().strip())
        if student_id is None:
            messagebox.showwarning("入力エラー", "登録する生徒を候補から選択してください。")
            return

        try:
            level = max(1, min(100, int(self.student_level_var.get())))
            current_exp = max(0, int(self.student_exp_var.get() or 0))
        except ValueError:
            messagebox.showwarning("入力エラー", "絆Lv / EXP は整数で入力してください。")
            return

        self.database.upsert_user_student(student_id, level, current_exp, self.student_notes_var.get().strip())
        self.current_student_id = student_id
        self.on_data_changed()

    def _delete_student(self) -> None:
        if self.current_student_id is None:
            return
        self.database.delete_user_student(self.current_student_id)
        self._clear_student_form()
        self.on_data_changed()

    def _clear_student_form(self) -> None:
        self.current_student_id = None
        self.student_picker_var.set("")
        self.student_level_var.set("1")
        self.student_exp_var.set("0")
        self.student_notes_var.set("")
        self.student_tree.selection_remove(self.student_tree.selection())

    def _on_item_select(self, _event=None) -> None:
        selection = self.item_tree.selection()
        if not selection:
            return
        item_id = int(selection[0])
        item = self.database.get_item(item_id)
        if item is None:
            return
        self.current_item_id = item_id
        self.item_name_var.set(item["name"])
        self.item_quantity_var.set(str(item["quantity"]))

    def _save_item_quantity(self) -> None:
        if self.current_item_id is None:
            messagebox.showwarning("未選択", "数量を保存する贈り物を選んでください。")
            return
        try:
            quantity = max(0, int(self.item_quantity_var.get() or 0))
        except ValueError:
            messagebox.showwarning("入力エラー", "所持数は整数で入力してください。")
            return

        self.database.set_inventory_quantity(self.current_item_id, quantity)
        self.on_data_changed()

    def _save_boxes(self) -> None:
        for key, variable in self.box_vars.items():
            try:
                quantity = max(0, int(variable.get() or 0))
            except ValueError:
                messagebox.showwarning("入力エラー", "ボックス在庫は整数で入力してください。")
                return
            self.database.set_box_quantity(key, quantity)
        self.on_data_changed()
