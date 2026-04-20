from __future__ import annotations

import tkinter as tk
from tkinter import ttk

from src.optimizer import sort_matching_items


class SearchView(ttk.Frame):
    def __init__(self, parent, database, icon_store, on_data_changed) -> None:
        super().__init__(parent, padding=0)
        self.database = database
        self.icon_store = icon_store
        self.on_data_changed = on_data_changed
        self.student_images: dict[int, tk.PhotoImage] = {}
        self.item_images: dict[int, tk.PhotoImage] = {}
        self.current_student_id: int | None = None

        self.query_var = tk.StringVar()
        self.school_var = tk.StringVar(value="すべて")
        self.sort_var = tk.StringVar(value="所持優先")
        self.student_name_var = tk.StringVar(value="生徒を選択してください")
        self.student_info_var = tk.StringVar(value="左の一覧から生徒を選ぶと、贈り物相性が表示されます。")
        self.sort_options = {
            "所持優先": "owned",
            "名前順": "name",
            "学校順": "school",
        }

        self._build_ui()
        self.query_var.trace_add("write", lambda *_: self._reload_students())
        self.school_var.trace_add("write", lambda *_: self._reload_students())
        self.sort_var.trace_add("write", lambda *_: self._reload_students())

    def _build_ui(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        filters = ttk.Frame(self, style="Card.TFrame", padding=14)
        filters.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        filters.columnconfigure(0, weight=1)

        ttk.Label(filters, text="生徒検索", style="SubTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Entry(filters, textvariable=self.query_var).grid(row=1, column=0, sticky="ew", pady=(10, 0), padx=(0, 12))
        self.school_combo = ttk.Combobox(filters, textvariable=self.school_var, state="readonly", width=20)
        self.school_combo.grid(row=1, column=1, sticky="w", pady=(10, 0), padx=(0, 12))
        self.sort_combo = ttk.Combobox(
            filters,
            textvariable=self.sort_var,
            values=list(self.sort_options.keys()),
            state="readonly",
            width=12,
        )
        self.sort_combo.grid(row=1, column=2, sticky="w", pady=(10, 0))

        body = ttk.Panedwindow(self, orient="horizontal")
        body.grid(row=1, column=0, sticky="nsew")

        left_card = ttk.Frame(body, style="Card.TFrame", padding=12)
        right_card = ttk.Frame(body, style="Card.TFrame", padding=16)
        body.add(left_card, weight=1)
        body.add(right_card, weight=2)

        left_card.columnconfigure(0, weight=1)
        left_card.rowconfigure(0, weight=1)
        right_card.columnconfigure(0, weight=1)
        right_card.rowconfigure(2, weight=1)

        self.student_tree = ttk.Treeview(left_card, columns=("school", "bond"), show="tree headings")
        self.student_tree.heading("#0", text="生徒")
        self.student_tree.heading("school", text="学校")
        self.student_tree.heading("bond", text="所持")
        self.student_tree.column("#0", width=200, anchor="w")
        self.student_tree.column("school", width=120, anchor="w")
        self.student_tree.column("bond", width=90, anchor="center")
        self.student_tree.grid(row=0, column=0, sticky="nsew")
        self.student_tree.bind("<<TreeviewSelect>>", self._on_student_select)

        left_scroll = ttk.Scrollbar(left_card, orient="vertical", command=self.student_tree.yview)
        left_scroll.grid(row=0, column=1, sticky="ns")
        self.student_tree.configure(yscrollcommand=left_scroll.set)

        header = ttk.Frame(right_card, style="Card.TFrame")
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(1, weight=1)

        self.student_icon_label = ttk.Label(header)
        self.student_icon_label.grid(row=0, column=0, rowspan=2, sticky="nw")
        ttk.Label(header, textvariable=self.student_name_var, style="Title.TLabel").grid(
            row=0, column=1, sticky="w", padx=(12, 0)
        )
        ttk.Label(header, textvariable=self.student_info_var, style="Muted.TLabel", wraplength=580, justify="left").grid(
            row=1, column=1, sticky="w", padx=(12, 0), pady=(4, 0)
        )

        self.quick_add_button = ttk.Button(header, text="所持に追加", command=self._quick_add_student)
        self.quick_add_button.grid(row=0, column=2, sticky="e")

        ttk.Label(right_card, text="贈り物相性", style="SubTitle.TLabel").grid(row=1, column=0, sticky="w", pady=(18, 8))

        self.match_tree = ttk.Treeview(right_card, columns=("effect", "exp", "qty"), show="tree headings")
        self.match_tree.heading("#0", text="贈り物")
        self.match_tree.heading("effect", text="効果")
        self.match_tree.heading("exp", text="獲得EXP")
        self.match_tree.heading("qty", text="所持数")
        self.match_tree.column("#0", width=360, anchor="w")
        self.match_tree.column("effect", width=90, anchor="center")
        self.match_tree.column("exp", width=100, anchor="e")
        self.match_tree.column("qty", width=90, anchor="e")
        self.match_tree.grid(row=2, column=0, sticky="nsew")
        self.match_tree.tag_configure("gift_sr", background="#fff7d6")
        self.match_tree.tag_configure("gift_ssr", background="#f4e9ff")
        self.match_tree.tag_configure("gift_bouquet", background="#e3f6ff")

        match_scroll = ttk.Scrollbar(right_card, orient="vertical", command=self.match_tree.yview)
        match_scroll.grid(row=2, column=1, sticky="ns")
        self.match_tree.configure(yscrollcommand=match_scroll.set)

    def refresh(self) -> None:
        schools = ["すべて", *self.database.list_schools()]
        self.school_combo.configure(values=schools)
        if self.school_var.get() not in schools:
            self.school_var.set("すべて")
        self._reload_students()

    def _reload_students(self) -> None:
        selected = self.current_student_id
        school = "" if self.school_var.get() == "すべて" else self.school_var.get()
        sort_by = self.sort_options.get(self.sort_var.get(), "owned")
        students = self.database.search_students(query=self.query_var.get(), school=school, sort_by=sort_by)

        self.student_tree.delete(*self.student_tree.get_children())
        self.student_images.clear()

        for student in students:
            image = self.icon_store.get(student.get("icon_path"), student["name"], size=(34, 34))
            self.student_images[int(student["id"])] = image
            owned_label = f"所持 Lv{student['current_bond_level']}" if student["is_owned"] else "未登録"
            self.student_tree.insert(
                "",
                "end",
                iid=str(student["id"]),
                text=student["name"],
                image=image,
                values=(student["school"], owned_label),
            )

        if selected is not None and str(selected) in self.student_tree.get_children():
            self.student_tree.selection_set(str(selected))
            self.student_tree.focus(str(selected))
            self._load_student_detail(selected)
        elif students:
            first_id = int(students[0]["id"])
            self.student_tree.selection_set(str(first_id))
            self.student_tree.focus(str(first_id))
            self._load_student_detail(first_id)
        else:
            self.current_student_id = None
            self.student_name_var.set("一致する生徒がいません")
            self.student_info_var.set("検索条件を変更してください。")
            self.match_tree.delete(*self.match_tree.get_children())
            self.quick_add_button.state(["disabled"])
            placeholder = self.icon_store.get(None, "?", size=(64, 64))
            self.student_icon_label.configure(image=placeholder)
            self.student_icon_label.image = placeholder

    def _on_student_select(self, _event=None) -> None:
        selection = self.student_tree.selection()
        if not selection:
            return
        self._load_student_detail(int(selection[0]))

    def _load_student_detail(self, student_id: int) -> None:
        student = self.database.get_student(student_id)
        if student is None:
            return

        self.current_student_id = student_id
        icon = self.icon_store.get(student.get("icon_path"), student["name"], size=(64, 64))
        self.student_icon_label.configure(image=icon)
        self.student_icon_label.image = icon

        status = "所持済み" if student["is_owned"] else "未登録"
        info = (
            f"{student['school']} / {status} / 現在絆 Lv{student['current_bond_level']} "
            f"(EXP {student['current_bond_exp']})"
        )
        self.student_name_var.set(student["name"])
        self.student_info_var.set(info)
        if student["is_owned"]:
            self.quick_add_button.state(["disabled"])
        else:
            self.quick_add_button.state(["!disabled"])

        inventory = self.database.get_inventory_map()
        items = self.database.list_items()
        matches = sort_matching_items(student, items, inventory, visible_only=True)

        self.match_tree.delete(*self.match_tree.get_children())
        self.item_images.clear()
        for item in matches:
            image = self.icon_store.get(item.get("icon_path"), item["name"], size=(30, 30))
            self.item_images[int(item["id"])] = image
            row_tag = {
                "sr": "gift_sr",
                "ssr": "gift_ssr",
                "bouquet": "gift_bouquet",
            }.get(item.get("display_group", "default"), "")
            self.match_tree.insert(
                "",
                "end",
                iid=str(item["id"]),
                text=item["name"],
                image=image,
                values=(item["effect_label"], item["gained_exp"], item["quantity"]),
                tags=(() if not row_tag else (row_tag,)),
            )

    def _quick_add_student(self) -> None:
        if self.current_student_id is None:
            return
        self.database.upsert_user_student(self.current_student_id, 1, 0, "")
        self.on_data_changed()
