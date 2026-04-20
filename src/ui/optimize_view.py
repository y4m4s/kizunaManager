from __future__ import annotations

import tkinter as tk
from tkinter import messagebox, ttk

from src.config import GIFT_BOX_TYPES, OPTIMIZE_STRATEGIES, PRIORITY_LABELS
from src.optimizer import optimize_allocation


class OptimizeView(ttk.Frame):
    def __init__(self, parent, database, icon_store, on_data_changed) -> None:
        super().__init__(parent, padding=0)
        self.database = database
        self.icon_store = icon_store
        self.on_data_changed = on_data_changed

        self.result_images: dict[int, tk.PhotoImage] = {}
        self.item_images: dict[int, tk.PhotoImage] = {}
        self.current_item_id: int | None = None
        self.strategy_label_to_key = {label: key for key, label in OPTIMIZE_STRATEGIES.items()}
        self.strategy_key_to_label = OPTIMIZE_STRATEGIES
        self.strategy_var = tk.StringVar(value=self.strategy_key_to_label["priority"])
        self.summary_var = tk.StringVar(value="計画と手持ち在庫をもとに配分を計算します。")
        self.leftover_var = tk.StringVar(value="")
        self.boxes_var = tk.StringVar(value="")
        self.item_query_var = tk.StringVar()
        self.item_quantity_var = tk.StringVar(value="0")
        self.item_name_var = tk.StringVar(value="贈り物を選択してください")
        self.box_vars = {key: tk.StringVar(value="0") for key, _ in GIFT_BOX_TYPES}

        self._build_ui()
        self.item_query_var.trace_add("write", lambda *_: self._reload_items())

    def _build_ui(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        header = ttk.Frame(self, style="Card.TFrame", padding=14)
        header.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        header.columnconfigure(1, weight=1)

        ttk.Label(header, text="配分最適化", style="Title.TLabel").grid(row=0, column=0, sticky="w")
        self.strategy_combo = ttk.Combobox(
            header,
            state="readonly",
            values=list(self.strategy_label_to_key.keys()),
            textvariable=self.strategy_var,
            width=14,
        )
        self.strategy_combo.grid(row=0, column=1, sticky="e")
        ttk.Button(header, text="最適化を実行", style="Primary.TButton", command=self._run_optimization).grid(
            row=0, column=2, sticky="e", padx=(12, 0)
        )
        ttk.Label(header, textvariable=self.summary_var, style="Muted.TLabel", wraplength=900, justify="left").grid(
            row=1, column=0, columnspan=3, sticky="w", pady=(8, 0)
        )

        body = ttk.Frame(self)
        body.grid(row=1, column=0, sticky="nsew")
        body.columnconfigure(0, weight=3)
        body.columnconfigure(1, weight=2)
        body.rowconfigure(0, weight=1)

        left = ttk.Frame(body)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        left.columnconfigure(0, weight=1)
        left.rowconfigure(0, weight=1)

        table_card = ttk.Frame(left, style="Card.TFrame", padding=12)
        table_card.grid(row=0, column=0, sticky="nsew")
        table_card.columnconfigure(0, weight=1)
        table_card.rowconfigure(0, weight=1)

        self.result_tree = ttk.Treeview(
            table_card,
            columns=("priority", "target", "allocated", "predicted", "items"),
            show="tree headings",
        )
        self.result_tree.heading("#0", text="生徒")
        self.result_tree.heading("priority", text="優先度")
        self.result_tree.heading("target", text="目標")
        self.result_tree.heading("allocated", text="獲得予定EXP")
        self.result_tree.heading("predicted", text="到達予測")
        self.result_tree.heading("items", text="配分内容")
        self.result_tree.column("#0", width=170, anchor="w")
        self.result_tree.column("priority", width=80, anchor="center")
        self.result_tree.column("target", width=80, anchor="center")
        self.result_tree.column("allocated", width=110, anchor="e")
        self.result_tree.column("predicted", width=100, anchor="center")
        self.result_tree.column("items", width=480, anchor="w")
        self.result_tree.grid(row=0, column=0, sticky="nsew")

        scroll = ttk.Scrollbar(table_card, orient="vertical", command=self.result_tree.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self.result_tree.configure(yscrollcommand=scroll.set)

        footer = ttk.Frame(left, style="Card.TFrame", padding=12)
        footer.grid(row=1, column=0, sticky="ew", pady=(10, 0))
        footer.columnconfigure(0, weight=1)
        ttk.Label(footer, textvariable=self.leftover_var, style="Muted.TLabel", wraplength=900, justify="left").grid(
            row=0, column=0, sticky="w"
        )
        ttk.Label(footer, textvariable=self.boxes_var, style="Muted.TLabel", wraplength=900, justify="left").grid(
            row=1, column=0, sticky="w", pady=(6, 0)
        )

        right = ttk.Frame(body, style="Card.TFrame", padding=12)
        right.grid(row=0, column=1, sticky="nsew")
        right.columnconfigure(0, weight=1)
        right.rowconfigure(1, weight=1)

        inventory_header = ttk.Frame(right, style="Card.TFrame")
        inventory_header.grid(row=0, column=0, sticky="ew", pady=(0, 10))
        inventory_header.columnconfigure(1, weight=1)
        ttk.Label(inventory_header, text="贈り物在庫", style="SubTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Entry(inventory_header, textvariable=self.item_query_var).grid(row=0, column=1, sticky="ew", padx=(12, 0))

        self.item_tree = ttk.Treeview(right, columns=("exp", "qty"), show="tree headings")
        self.item_tree.heading("#0", text="贈り物")
        self.item_tree.heading("exp", text="基礎EXP")
        self.item_tree.heading("qty", text="所持数")
        self.item_tree.column("#0", width=260, anchor="w")
        self.item_tree.column("exp", width=90, anchor="e")
        self.item_tree.column("qty", width=90, anchor="e")
        self.item_tree.grid(row=1, column=0, sticky="nsew")
        self.item_tree.bind("<<TreeviewSelect>>", self._on_item_select)

        item_scroll = ttk.Scrollbar(right, orient="vertical", command=self.item_tree.yview)
        item_scroll.grid(row=1, column=1, sticky="ns")
        self.item_tree.configure(yscrollcommand=item_scroll.set)

        edit_card = ttk.Frame(right, style="Card.TFrame")
        edit_card.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(12, 0))
        edit_card.columnconfigure(1, weight=1)
        ttk.Label(edit_card, textvariable=self.item_name_var, style="SubTitle.TLabel").grid(
            row=0, column=0, columnspan=2, sticky="w"
        )
        ttk.Label(edit_card, text="所持数").grid(row=1, column=0, sticky="w", pady=(10, 4))
        ttk.Entry(edit_card, textvariable=self.item_quantity_var).grid(row=1, column=1, sticky="ew", pady=(10, 4))
        ttk.Button(edit_card, text="数量を保存", style="Primary.TButton", command=self._save_item_quantity).grid(
            row=2, column=0, columnspan=2, sticky="w", pady=(8, 16)
        )

        box_frame = ttk.LabelFrame(edit_card, text="選択式ボックス在庫", padding=12)
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

        ttk.Button(edit_card, text="ボックス在庫を保存", command=self._save_boxes).grid(
            row=4, column=0, columnspan=2, sticky="w", pady=(12, 0)
        )

    def refresh(self) -> None:
        self._refresh_box_summary()
        self._reload_items()
        self._reload_boxes()

    def _refresh_box_summary(self) -> None:
        boxes = self.database.list_boxes()
        if not boxes:
            self.boxes_var.set("選択式ボックス在庫: なし")
            return
        summary = ", ".join(f"{key} {quantity}" for key, quantity in boxes.items())
        self.boxes_var.set(f"選択式ボックス在庫: {summary}")

    def _reload_items(self) -> None:
        query = self.item_query_var.get().strip()
        items = self.database.list_items(query=query)
        current = self.current_item_id

        self.item_tree.delete(*self.item_tree.get_children())
        self.item_images.clear()
        for item in items:
            image = self.icon_store.get(item.get("icon_path"), item["name"], size=(30, 30))
            self.item_images[int(item["id"])] = image
            self.item_tree.insert(
                "",
                "end",
                iid=str(item["id"]),
                text=item["name"],
                image=image,
                values=(item["exp_value"], item["quantity"]),
            )

        if current is not None and str(current) in self.item_tree.get_children():
            self.item_tree.selection_set(str(current))
            self.item_tree.focus(str(current))

    def _reload_boxes(self) -> None:
        stored = self.database.list_boxes()
        for key, variable in self.box_vars.items():
            variable.set(str(stored.get(key, 0)))

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

    def _run_optimization(self) -> None:
        plans, inventory, students_by_id, items_by_id = self.database.snapshot_for_optimizer()
        self.result_tree.delete(*self.result_tree.get_children())
        self.result_images.clear()
        self._refresh_box_summary()

        if not plans:
            self.summary_var.set("最適化対象の生徒がいません。管理画面で優先にした生徒だけが計算対象になります。")
            self.leftover_var.set("")
            return
        if not inventory:
            self.summary_var.set("贈り物在庫が未登録です。この画面右側で数量を入力してください。")
            self.leftover_var.set("")
            return

        strategy = self.strategy_label_to_key.get(self.strategy_var.get(), "priority")
        result = optimize_allocation(
            plans=plans,
            inventory=inventory,
            students_by_id=students_by_id,
            items_by_id=items_by_id,
            strategy=strategy,
        )

        for row in result["results"]:
            student = students_by_id.get(int(row["student_id"]))
            image = self.icon_store.get(
                None if student is None else student.get("icon_path"),
                row["student_name"],
                size=(32, 32),
            )
            self.result_images[int(row["student_id"])] = image
            items_text = ", ".join(
                f"{allocation['item_name']} x{allocation['count']} ({allocation['effect_label']})"
                for allocation in row["allocated_items"]
            )
            if not items_text:
                items_text = "割り当てなし"
            self.result_tree.insert(
                "",
                "end",
                iid=str(row["student_id"]),
                text=row["student_name"],
                image=image,
                values=(
                    PRIORITY_LABELS.get(row["priority"], row["priority"]),
                    f"Lv{row['target_bond_level']}",
                    row["allocated_exp"],
                    f"Lv{row['predicted_level']}",
                    items_text,
                ),
            )

        summary = result["summary"]
        label = OPTIMIZE_STRATEGIES.get(strategy, strategy)
        self.summary_var.set(
            f"{label}で計算しました。配分EXP {summary['total_allocated_exp']:,} / "
            f"必要EXP {summary['total_required_exp']:,} / 達成率 {int(summary['completion_rate'] * 100)}%"
        )

        if result["leftovers"]:
            leftover_text = ", ".join(
                f"{item['item_name']} x{item['quantity']}" for item in result["leftovers"][:8]
            )
            if len(result["leftovers"]) > 8:
                leftover_text += " ほか"
            self.leftover_var.set(f"未使用の贈り物: {leftover_text}")
        else:
            self.leftover_var.set("未使用の贈り物: なし")
