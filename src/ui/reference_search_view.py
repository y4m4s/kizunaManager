from __future__ import annotations

import math
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps
except ImportError:  # pragma: no cover - optional at runtime
    Image = None
    ImageDraw = None
    ImageFont = None
    ImageOps = None

from src.optimizer import EFFECT_ORDER, get_gift_effect, is_search_visible_match, sort_matching_items

TABLE_EFFECTS = ("extra_large", "large", "medium")
TABLE_HEADERS = {"extra_large": "特大", "large": "大", "medium": "中"}


class VerticalScrolledFrame(ttk.Frame):
    def __init__(self, parent) -> None:
        super().__init__(parent)
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)
        self.canvas = tk.Canvas(self, background="#ffffff", highlightthickness=0)
        self.canvas.grid(row=0, column=0, sticky="nsew")
        scrollbar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.canvas.configure(yscrollcommand=scrollbar.set)
        self.inner = ttk.Frame(self, style="Card.TFrame")
        self._window_id = self.canvas.create_window((0, 0), window=self.inner, anchor="nw")
        self.inner.bind("<Configure>", self._on_inner_configure)
        self.canvas.bind("<Configure>", self._on_canvas_configure)

    def _on_inner_configure(self, _event=None) -> None:
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))

    def _on_canvas_configure(self, event: tk.Event) -> None:
        self.canvas.itemconfigure(self._window_id, width=event.width)


class SearchView(ttk.Frame):
    def __init__(self, parent, database, icon_store, on_data_changed) -> None:
        super().__init__(parent, padding=0)
        self.database = database
        self.icon_store = icon_store
        self.on_data_changed = on_data_changed

        self.active_tab = "gift"
        self.hide_medium = False
        self.selected_gift_ids: set[int] = set()
        self.selected_student_ids: list[int] = []
        self.hidden_result_ids: set[int] = set()
        self.current_results: list[dict] = []

        self.all_students: dict[int, dict] = {}
        self.all_items: dict[int, dict] = {}
        self.result_student_images: dict[int, tk.PhotoImage] = {}
        self.result_item_images: dict[int, tk.PhotoImage] = {}
        self.gift_tile_frames: dict[int, tk.Frame] = {}
        self.gift_tile_images: dict[int, tk.PhotoImage] = {}
        self.student_candidate_map: dict[str, int] = {}

        self.student_query_var = tk.StringVar()
        self.placeholder_var = tk.StringVar(value="ここに検索結果が表示されます。")

        self._build_ui()

    def _setup_entry_placeholder(self, entry: ttk.Entry, placeholder: str) -> None:
        """Entry にプレースホルダーテキストを設定する。"""
        placeholder_color = "#9ca3af"
        default_color = entry.cget("foreground") or "#111827"

        def on_focus_in(_=None) -> None:
            if entry.get() == placeholder:
                entry.delete(0, tk.END)
                entry.configure(foreground=default_color)

        def on_focus_out(_=None) -> None:
            if not entry.get():
                entry.insert(0, placeholder)
                entry.configure(foreground=placeholder_color)

        entry.insert(0, placeholder)
        entry.configure(foreground=placeholder_color)
        entry.bind("<FocusIn>", on_focus_in)
        entry.bind("<FocusOut>", on_focus_out)

    def _build_ui(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        container = ttk.Frame(self, style="Card.TFrame", padding=20)
        container.grid(row=0, column=0, rowspan=2, sticky="nsew")
        container.columnconfigure(0, weight=1)
        container.rowconfigure(6, weight=1)

        title = ttk.Frame(container, style="Card.TFrame")
        title.grid(row=0, column=0, sticky="ew")
        title.columnconfigure(0, weight=1)
        ttk.Label(title, text="ブルーアーカイブ 贈り物相性検索ツール", style="Title.TLabel").grid(
            row=0, column=0, sticky="w"
        )

        tab_bar = tk.Frame(container, bg="#ffffff", highlightbackground="#d8dee8", highlightthickness=1)
        tab_bar.grid(row=1, column=0, sticky="ew", pady=(18, 16))
        self.tab_buttons: dict[str, tk.Button] = {}
        for column, (key, label) in enumerate((("gift", "贈り物から検索"), ("student", "生徒から選択"))):
            button = tk.Button(
                tab_bar,
                text=label,
                relief="flat",
                borderwidth=0,
                padx=18,
                pady=10,
                command=lambda name=key: self._switch_tab(name),
                cursor="hand2",
            )
            button.grid(row=0, column=column, sticky="w")
            self.tab_buttons[key] = button

        self.panel_gift = ttk.Frame(container, style="Card.TFrame")
        self.panel_gift.grid(row=2, column=0, sticky="nsew")
        self.panel_gift.columnconfigure(0, weight=1)
        ttk.Label(self.panel_gift, text="贈り物を選択してください (複数選択可)", style="SubTitle.TLabel").grid(
            row=0, column=0, sticky="w", pady=(0, 8)
        )
        gift_grid_card = ttk.Frame(self.panel_gift, style="Card.TFrame")
        gift_grid_card.grid(row=1, column=0, sticky="nsew")
        gift_grid_card.columnconfigure(0, weight=1)
        gift_grid_card.rowconfigure(0, weight=1)
        self.gift_grid_scroll = VerticalScrolledFrame(gift_grid_card)
        self.gift_grid_scroll.canvas.configure(height=280)
        self.gift_grid_scroll.grid(row=0, column=0, sticky="nsew")

        self.panel_student = ttk.Frame(container, style="Card.TFrame")
        self.panel_student.grid(row=3, column=0, sticky="ew")
        self.panel_student.columnconfigure(0, weight=1)

        # 選択済み生徒チップの表示エリア（ボーダー付きコンテナ）
        chips_container = tk.Frame(
            self.panel_student,
            background="#ffffff",
            highlightthickness=1,
            highlightbackground="#d1d5db",
            bd=0,
        )
        chips_container.grid(row=0, column=0, sticky="ew", pady=(0, 10))
        chips_container.columnconfigure(0, weight=1)

        # 検索入力行（チップコンテナ内）
        student_input_row = tk.Frame(chips_container, background="#ffffff")
        student_input_row.grid(row=0, column=0, sticky="ew", padx=8, pady=(8, 4))
        student_input_row.columnconfigure(0, weight=1)
        self.student_entry = ttk.Entry(student_input_row, textvariable=self.student_query_var)
        self.student_entry.grid(row=0, column=0, sticky="ew")
        self._setup_entry_placeholder(self.student_entry, "生徒名を入力…")
        ttk.Button(student_input_row, text="追加", command=self._add_candidate_student).grid(
            row=0, column=1, sticky="e", padx=(8, 0)
        )

        # 選択済みチップ表示フレーム
        self.selected_students_frame = tk.Frame(chips_container, background="#ffffff")
        self.selected_students_frame.grid(row=1, column=0, sticky="ew", padx=8, pady=(0, 8))

        self.student_query_var.trace_add("write", lambda *_: self._refresh_student_candidates())

        # 候補リストボックス（入力中のみ表示）
        self.student_listbox = tk.Listbox(
            self.panel_student,
            height=5,
            borderwidth=1,
            relief="solid",
            activestyle="none",
            highlightthickness=0,
        )
        self.student_listbox.bind("<Double-Button-1>", lambda _: self._add_candidate_student())

        action_row = ttk.Frame(container, style="Card.TFrame")
        action_row.grid(row=4, column=0, sticky="ew", pady=(18, 12))
        ttk.Button(action_row, text="この条件で検索する", style="Primary.TButton", command=self._run_search).pack(
            side="left"
        )
        ttk.Button(action_row, text="クリア", command=self._clear_current_selection).pack(side="left", padx=(8, 0))

        ttk.Separator(container, orient="horizontal").grid(row=5, column=0, sticky="ew", pady=(8, 18))

        results = ttk.Frame(container, style="Card.TFrame")
        results.grid(row=6, column=0, sticky="nsew")
        results.columnconfigure(0, weight=1)
        results.rowconfigure(2, weight=1)

        header = ttk.Frame(results, style="Card.TFrame")
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(0, weight=1)
        ttk.Label(header, text="検索結果", style="SubTitle.TLabel").grid(row=0, column=0, sticky="w")
        self.unhide_button = ttk.Button(header, text="非表示を解除", command=self._unhide_all_results)
        self.unhide_button.grid(row=0, column=1, sticky="e", padx=(0, 8))
        self.toggle_medium_button = ttk.Button(header, text="効果「中」を非表示にする", command=self._toggle_medium)
        self.toggle_medium_button.grid(row=0, column=2, sticky="e")

        self.results_table = ttk.Frame(results, style="Card.TFrame")
        self.results_table.grid(row=1, column=0, sticky="ew", pady=(10, 0))
        self.results_table.columnconfigure(0, weight=3)
        self.results_table.columnconfigure(1, weight=2)
        self.results_table.columnconfigure(2, weight=2)
        self.results_table.columnconfigure(3, weight=2)
        self.results_rows = VerticalScrolledFrame(results)
        self.results_rows.grid(row=2, column=0, sticky="nsew", pady=(0, 12))

        self.placeholder_label = ttk.Label(
            self.results_rows.inner,
            textvariable=self.placeholder_var,
            style="Muted.TLabel",
            justify="center",
            anchor="center",
        )
        self.placeholder_label.grid(row=0, column=0, sticky="ew", pady=20)

        footer = ttk.Frame(results, style="Card.TFrame")
        footer.grid(row=3, column=0, sticky="ew")
        footer.columnconfigure(0, weight=1)
        self.save_image_button = ttk.Button(footer, text="この結果を画像で保存", command=self._save_results_image)
        self.save_image_button.grid(row=0, column=0, sticky="e")

        self._switch_tab("gift")
        self._render_results_table_header()
        self._update_result_controls()

    def refresh(self) -> None:
        students = self.database.search_students(sort_by="name")
        items = [
            item
            for item in self.database.list_items()
            if str(item.get("gift_kind", "gift")).lower() != "bouquet"
        ]
        self.all_students = {int(student["id"]): student for student in students}
        self.all_items = {int(item["id"]): item for item in items}
        self.selected_gift_ids.intersection_update(self.all_items.keys())
        self.selected_student_ids = [student_id for student_id in self.selected_student_ids if student_id in self.all_students]
        self.hidden_result_ids.intersection_update(self.all_students.keys())
        self._render_gift_grid()
        self._refresh_student_candidates()
        self._render_selected_students()
        self._rerun_if_needed()

    def _switch_tab(self, tab_name: str) -> None:
        self.active_tab = tab_name
        self.panel_gift.grid_remove()
        self.panel_student.grid_remove()
        if tab_name == "gift":
            self.panel_gift.grid()
        else:
            self.panel_student.grid()
        self._refresh_tab_buttons()
        self.hide_medium = False
        self.hidden_result_ids.clear()
        self.current_results = []
        self._update_medium_button_text()
        self._render_results_table_header()
        self._render_results()
        self._update_result_controls()

    def _refresh_tab_buttons(self) -> None:
        for key, button in self.tab_buttons.items():
            is_active = key == self.active_tab
            button.configure(
                bg="#ffffff" if not is_active else "#eff6ff",
                fg="#4b5563" if not is_active else "#2563eb",
                font=("Yu Gothic UI", 10, "bold" if is_active else "normal"),
            )

    def _render_gift_grid(self) -> None:
        for child in self.gift_grid_scroll.inner.winfo_children():
            child.destroy()
        self.gift_tile_frames.clear()
        self.gift_tile_images.clear()

        items = sorted(
            self.all_items.values(),
            key=lambda row: (0 if str(row.get("rarity", "")).upper() == "SSR" else 1, row["name"]),
        )

        columns = 8
        for index, item in enumerate(items):
            item_id = int(item["id"])
            row = index // columns
            column = index % columns
            selected = item_id in self.selected_gift_ids
            background = self._gift_tile_bg(item, selected)
            wrapper = tk.Frame(
                self.gift_grid_scroll.inner,
                width=88,
                height=88,
                cursor="hand2",
                background=background,
                highlightthickness=2,
                highlightbackground="#3b82f6" if selected else background,
                highlightcolor="#3b82f6",
                bd=0,
            )
            wrapper.grid(row=row, column=column, padx=6, pady=6, sticky="nsew")
            wrapper.grid_propagate(False)
            image = self.icon_store.get(item.get("icon_path"), item["name"], size=(56, 56))
            self.gift_tile_images[item_id] = image
            label = tk.Label(wrapper, image=image, background=background)
            label.place(relx=0.5, rely=0.5, anchor="center")
            for widget in (wrapper, label):
                widget.bind("<Button-1>", lambda _event, selected_id=item_id: self._toggle_gift(selected_id))
            self.gift_tile_frames[item_id] = wrapper

        for column in range(columns):
            self.gift_grid_scroll.inner.columnconfigure(column, weight=1)

    def _gift_tile_bg(self, item: dict, selected: bool) -> str:
        rarity = str(item.get("rarity", "")).upper()
        if rarity == "SSR":
            return "#d8b4fe" if selected else "#f3e8ff"
        return "#fde68a" if selected else "#fff7d6"

    def _gift_wrapper_color(self, item: dict) -> str:
        return "#f3e8ff" if str(item.get("rarity", "")).upper() == "SSR" else "#fff7d6"

    def _toggle_gift(self, item_id: int) -> None:
        if item_id in self.selected_gift_ids:
            self.selected_gift_ids.remove(item_id)
        else:
            self.selected_gift_ids.add(item_id)

        frame = self.gift_tile_frames.get(item_id)
        item = self.all_items.get(item_id)
        if frame is None or item is None:
            return

        selected = item_id in self.selected_gift_ids
        background = self._gift_tile_bg(item, selected)
        frame.configure(background=background, highlightbackground="#3b82f6" if selected else background)
        for child in frame.winfo_children():
            child.configure(background=background)

    def _refresh_student_candidates(self) -> None:
        raw_query = self.student_query_var.get()
        placeholder = "生徒名を入力…"
        query = "" if raw_query == placeholder else raw_query.strip().lower()

        selected = set(self.selected_student_ids)
        matched = [
            student
            for student in self.all_students.values()
            if int(student["id"]) not in selected and (not query or query in student["name"].lower())
        ]
        matched.sort(key=lambda row: row["name"])
        limited = matched[:40]
        self.student_candidate_map = {
            self._student_option_label(student): int(student["id"])
            for student in limited
        }
        self.student_listbox.delete(0, tk.END)
        for label in self.student_candidate_map:
            self.student_listbox.insert(tk.END, label)
        if limited:
            self.student_listbox.selection_set(0)

        # 入力中のみ候補リストを表示
        if query:
            self.student_listbox.grid(row=1, column=0, sticky="ew", pady=(4, 0))
        else:
            self.student_listbox.grid_remove()

    def _student_option_label(self, student: dict) -> str:
        school = student.get("school") or "学校不明"
        return f"{student['name']} / {school}"

    def _add_candidate_student(self) -> None:
        selection = self.student_listbox.curselection()
        if not selection:
            messagebox.showwarning("未選択", "候補から追加したい生徒を選択してください。")
            return

        label = self.student_listbox.get(selection[0])
        student_id = self.student_candidate_map.get(label)
        if student_id is None or student_id in self.selected_student_ids:
            return
        self.selected_student_ids.append(student_id)
        self.student_query_var.set("")
        self._refresh_student_candidates()
        self._render_selected_students()

    def _render_selected_students(self) -> None:
        for child in self.selected_students_frame.winfo_children():
            child.destroy()

        if not self.selected_student_ids:
            ttk.Label(
                self.selected_students_frame,
                text="ここに選択中の生徒が表示されます。",
                style="Muted.TLabel",
            ).pack(anchor="w")
            return

        for student_id in self.selected_student_ids:
            student = self.all_students.get(student_id)
            if student is None:
                continue
            chip = tk.Frame(
                self.selected_students_frame,
                background="#e5e7eb",
                highlightthickness=0,
                bd=0,
                padx=10,
                pady=6,
            )
            chip.pack(side="left", padx=(0, 8), pady=4)
            tk.Label(chip, text=student["name"], background="#e5e7eb", foreground="#111827").pack(side="left")
            tk.Button(
                chip,
                text="×",
                command=lambda value=student_id: self._remove_selected_student(value),
                relief="flat",
                borderwidth=0,
                background="#e5e7eb",
                foreground="#374151",
                padx=6,
                pady=0,
                cursor="hand2",
            ).pack(side="left")

    def _remove_selected_student(self, student_id: int) -> None:
        self.selected_student_ids = [value for value in self.selected_student_ids if value != student_id]
        self._refresh_student_candidates()
        self._render_selected_students()

    def _run_search(self) -> None:
        self.hide_medium = False
        self.hidden_result_ids.clear()
        self._update_medium_button_text()

        if self.active_tab == "gift":
            if not self.selected_gift_ids:
                messagebox.showwarning("未選択", "贈り物を1つ以上選択してください。")
                return
            self.current_results = self._build_gift_search_results()
        else:
            if not self.selected_student_ids:
                messagebox.showwarning("未選択", "生徒を1人以上追加してください。")
                return
            self.current_results = self._build_student_search_results()

        self._render_results()

    def _build_gift_search_results(self) -> list[dict]:
        selected_items = [self.all_items[item_id] for item_id in sorted(self.selected_gift_ids) if item_id in self.all_items]
        results: list[dict] = []

        for student in self.all_students.values():
            grouped = {effect: [] for effect in TABLE_EFFECTS}
            for item in selected_items:
                effect = get_gift_effect(student, item)
                if effect in grouped and is_search_visible_match(item, effect):
                    grouped[effect].append(item)

            if not any(grouped.values()):
                continue

            results.append(
                {
                    "student_id": int(student["id"]),
                    "student_name": student["name"],
                    "icon_path": student.get("icon_path", ""),
                    "effects": grouped,
                }
            )

        def sort_key(row: dict) -> tuple[int, int, int, int, str]:
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

    def _build_student_search_results(self) -> list[dict]:
        results: list[dict] = []
        inventory = self.database.get_inventory_map()
        items = list(self.all_items.values())

        for student_id in self.selected_student_ids:
            student = self.all_students.get(student_id)
            if student is None:
                continue
            grouped = {effect: [] for effect in TABLE_EFFECTS}
            for item in sort_matching_items(student, items, inventory, visible_only=True):
                effect = str(item.get("effect", ""))
                if effect in grouped:
                    grouped[effect].append(item)
            if not any(grouped.values()):
                continue
            results.append(
                {
                    "student_id": int(student["id"]),
                    "student_name": student["name"],
                    "icon_path": student.get("icon_path", ""),
                    "effects": grouped,
                }
            )
        return results

    def _render_results_table_header(self) -> None:
        for child in self.results_table.winfo_children():
            child.destroy()

        for column, text in enumerate(("生徒", "特大", "大", "中")):
            header = tk.Label(
                self.results_table,
                text=text,
                background="#f8fafc",
                foreground="#111827",
                font=("Yu Gothic UI", 10, "bold"),
                padx=8,
                pady=10,
                borderwidth=1,
                relief="solid",
            )
            header.grid(row=0, column=column, sticky="nsew")
            if self.hide_medium and column == 3:
                header.grid_remove()

    def _render_results(self) -> None:
        for child in self.results_rows.inner.winfo_children():
            child.destroy()
        self.result_student_images.clear()
        self.result_item_images.clear()

        visible_results = self._visible_results()
        if not visible_results:
            self.placeholder_var.set("条件に合う結果が見つかりませんでした。" if self.current_results else "ここに検索結果が表示されます。")
            self.placeholder_label = ttk.Label(
                self.results_rows.inner,
                textvariable=self.placeholder_var,
                style="Muted.TLabel",
                justify="center",
                anchor="center",
            )
            self.placeholder_label.grid(row=0, column=0, sticky="ew", pady=20)
            self._update_result_controls()
            return

        for index, row in enumerate(visible_results):
            self._render_result_row(index, row)

        self._update_result_controls()

    def _visible_results(self) -> list[dict]:
        results = [row for row in self.current_results if int(row["student_id"]) not in self.hidden_result_ids]
        if self.active_tab == "gift" and self.hide_medium:
            results = [row for row in results if row["effects"]["extra_large"] or row["effects"]["large"]]
        return results

    def _render_result_row(self, row_index: int, row: dict) -> None:
        student_id = int(row["student_id"])
        outer = ttk.Frame(self.results_rows.inner, style="Card.TFrame")
        outer.grid(row=row_index, column=0, sticky="ew")
        outer.columnconfigure(0, weight=3)
        outer.columnconfigure(1, weight=2)
        outer.columnconfigure(2, weight=2)
        outer.columnconfigure(3, weight=2)

        student_bg = "#ffffff"
        student_cell = tk.Frame(outer, background=student_bg, borderwidth=1, relief="solid", cursor="hand2")
        student_cell.grid(row=0, column=0, sticky="nsew")
        student = self.all_students.get(student_id)
        image = self.icon_store.get(None if student is None else student.get("icon_path"), row["student_name"], size=(40, 40))
        self.result_student_images[student_id] = image
        tk.Label(student_cell, image=image, background=student_bg).pack(side="left", padx=(10, 8), pady=8)
        tk.Label(
            student_cell,
            text=row["student_name"],
            background=student_bg,
            foreground="#111827",
            font=("Yu Gothic UI", 10, "bold"),
        ).pack(side="left", padx=(0, 10))

        if self.active_tab == "gift":
            student_cell.configure(cursor="")
            tk.Button(
                student_cell,
                text="×",
                relief="flat",
                borderwidth=0,
                background=student_bg,
                foreground="#9ca3af",
                activebackground=student_bg,
                activeforeground="#ef4444",
                font=("Yu Gothic UI", 12),
                cursor="hand2",
                command=lambda value=student_id: self._confirm_hide_result(value),
                padx=6,
                pady=0,
            ).pack(side="right", padx=(4, 6))
        else:
            student_cell.configure(cursor="")

        for column, effect in enumerate(TABLE_EFFECTS, start=1):
            cell = tk.Frame(outer, background="#ffffff", borderwidth=1, relief="solid")
            cell.grid(row=0, column=column, sticky="nsew")
            if self.hide_medium and effect == "medium":
                cell.grid_remove()
                continue
            self._populate_gift_cell(cell, row["effects"][effect])

    def _populate_gift_cell(self, parent: tk.Frame, items: list[dict]) -> None:
        if not items:
            tk.Label(parent, text="", background="#ffffff").pack(fill="both", expand=True, pady=18)
            return

        columns = 4
        for index, item in enumerate(items):
            wrapper_color = self._gift_wrapper_color(item)
            wrapper = tk.Frame(parent, background=wrapper_color, padx=4, pady=4)
            wrapper.grid(row=index // columns, column=index % columns, padx=6, pady=6, sticky="w")
            image = self.icon_store.get(item.get("icon_path"), item["name"], size=(44, 44))
            self.result_item_images[int(item["id"])] = image
            tk.Label(wrapper, image=image, background=wrapper_color).pack()
            if str(item.get("rarity", "")).upper() == "SSR":
                wrapper.configure(highlightthickness=1, highlightbackground="#d8b4fe")

        for column in range(columns):
            parent.columnconfigure(column, weight=1)

    def _toggle_medium(self) -> None:
        self.hide_medium = not self.hide_medium
        self._update_medium_button_text()
        self._render_results_table_header()
        self._render_results()

    def _update_medium_button_text(self) -> None:
        self.toggle_medium_button.configure(text="効果「中」を表示する" if self.hide_medium else "効果「中」を非表示にする")

    def _update_result_controls(self) -> None:
        has_results = bool(self.current_results)
        if has_results and self.active_tab == "gift":
            self.toggle_medium_button.state(["!disabled"])
            self.toggle_medium_button.grid()
        else:
            self.toggle_medium_button.grid_remove()

        if has_results and self.hidden_result_ids:
            self.unhide_button.state(["!disabled"])
            self.unhide_button.grid()
        else:
            self.unhide_button.grid_remove()

        if has_results:
            self.save_image_button.state(["!disabled"])
            self.results_table.grid()
        else:
            self.save_image_button.state(["disabled"])
            self.results_table.grid_remove()

    def _confirm_hide_result(self, student_id: int) -> None:
        self.hidden_result_ids.add(student_id)
        self._render_results()

    def _unhide_all_results(self) -> None:
        self.hidden_result_ids.clear()
        self._render_results()

    def _clear_current_selection(self) -> None:
        if self.active_tab == "gift":
            for item_id in list(self.selected_gift_ids):
                frame = self.gift_tile_frames.get(item_id)
                item = self.all_items.get(item_id)
                if frame is not None and item is not None:
                    background = self._gift_tile_bg(item, False)
                    frame.configure(background=background, highlightbackground=background)
                    for child in frame.winfo_children():
                        child.configure(background=background)
            self.selected_gift_ids.clear()
        else:
            self.selected_student_ids.clear()
            self._refresh_student_candidates()
            self._render_selected_students()

    def _rerun_if_needed(self) -> None:
        if not self.current_results:
            self._render_results()
            return
        try:
            self._run_search()
        except Exception:
            self.current_results = []
            self._render_results()

    def _save_results_image(self) -> None:
        visible_results = self._visible_results()
        if not visible_results:
            messagebox.showwarning("保存できません", "保存できる検索結果がありません。")
            return
        if Image is None or ImageDraw is None or ImageFont is None or ImageOps is None:
            messagebox.showwarning("保存できません", "Pillow が利用できないため画像保存を行えません。")
            return

        default_name = "gift-search-results.png" if self.active_tab == "gift" else "student-gift-results.png"
        save_path = filedialog.asksaveasfilename(
            title="検索結果を保存",
            defaultextension=".png",
            initialfile=default_name,
            filetypes=[("PNG画像", "*.png")],
        )
        if not save_path:
            return

        image = self._build_results_image(visible_results)
        image.save(save_path)
        messagebox.showinfo("保存完了", f"検索結果を保存しました。\n{save_path}")

    def _build_results_image(self, rows: list[dict]):
        font = self._load_font(18)
        font_bold = self._load_font(16, bold=True)
        visible_effects = [effect for effect in TABLE_EFFECTS if not (self.hide_medium and effect == "medium")]
        student_width = 260
        effect_width = 250 if len(visible_effects) == 3 else 310
        table_width = student_width + effect_width * len(visible_effects)
        padding = 24
        header_height = 52
        icon_size = 44
        icons_per_row = 4

        row_heights: list[int] = []
        for row in rows:
            max_height = 68
            for effect in visible_effects:
                count = len(row["effects"][effect])
                lines = max(1, math.ceil(count / icons_per_row))
                max_height = max(max_height, 16 + lines * (icon_size + 12))
            row_heights.append(max_height)

        total_height = padding * 2 + header_height + sum(row_heights)
        image = Image.new("RGBA", (table_width + padding * 2, total_height), "#ffffff")
        draw = ImageDraw.Draw(image)
        x = padding
        y = padding

        current_x = x
        draw.rectangle((current_x, y, current_x + student_width, y + header_height), fill="#f8fafc", outline="#d8dee8")
        self._draw_centered_text(draw, (current_x, y, current_x + student_width, y + header_height), "生徒", font_bold)
        current_x += student_width
        for effect in visible_effects:
            draw.rectangle((current_x, y, current_x + effect_width, y + header_height), fill="#f8fafc", outline="#d8dee8")
            self._draw_centered_text(draw, (current_x, y, current_x + effect_width, y + header_height), TABLE_HEADERS[effect], font_bold)
            current_x += effect_width

        y += header_height
        for row, row_height in zip(rows, row_heights):
            current_x = x
            draw.rectangle((current_x, y, current_x + student_width, y + row_height), fill="#ffffff", outline="#d8dee8")
            self._draw_student_image_cell(image, draw, row, current_x, y, student_width, row_height, font)
            current_x += student_width
            for effect in visible_effects:
                draw.rectangle((current_x, y, current_x + effect_width, y + row_height), fill="#ffffff", outline="#d8dee8")
                self._draw_effect_image_cell(image, row["effects"][effect], current_x, y, effect_width)
                current_x += effect_width
            y += row_height

        return image.convert("RGB")

    def _draw_student_image_cell(self, image, draw, row: dict, x: int, y: int, width: int, height: int, font) -> None:
        avatar = self._load_pil_icon(row.get("icon_path", ""), row["student_name"], (40, 40))
        image.paste(avatar, (x + 12, y + max(12, (height - 40) // 2)), avatar)
        self._draw_left_text(draw, (x + 64, y, x + width - 12, y + height), row["student_name"], font)

    def _draw_effect_image_cell(self, image, items: list[dict], x: int, y: int, width: int) -> None:
        if not items:
            return
        icon_size = 44
        gap = 10
        columns = 4
        start_x = x + 12
        start_y = y + 12
        for index, item in enumerate(items):
            icon_x = start_x + (index % columns) * (icon_size + gap)
            icon_y = start_y + (index // columns) * (icon_size + gap)
            wrapper_color = self._gift_wrapper_color(item)
            icon = self._load_pil_icon(item.get("icon_path", ""), item["name"], (icon_size, icon_size))
            wrapper = Image.new("RGBA", (icon_size + 8, icon_size + 8), wrapper_color)
            wrapper.paste(icon, (4, 4), icon)
            image.paste(wrapper, (icon_x, icon_y), wrapper)

    def _load_pil_icon(self, path: str, label: str, size: tuple[int, int]):
        file_path = Path(path) if path else None
        if file_path is not None and file_path.exists():
            try:
                with Image.open(file_path) as source:
                    fitted = ImageOps.contain(source.convert("RGBA"), size)
                    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
                    offset_x = (size[0] - fitted.size[0]) // 2
                    offset_y = (size[1] - fitted.size[1]) // 2
                    canvas.paste(fitted, (offset_x, offset_y), fitted)
                    return canvas
            except OSError:
                pass

        seed = sum(ord(char) for char in label) % 255
        color = (90 + seed % 80, 120 + (seed * 2) % 80, 170 + (seed * 3) % 70, 255)
        return Image.new("RGBA", size, color)

    def _load_font(self, size: int, bold: bool = False):
        candidates = []
        if bold:
            candidates.extend(
                [
                    Path(r"C:\Windows\Fonts\YuGothB.ttc"),
                    Path(r"C:\Windows\Fonts\meiryob.ttc"),
                ]
            )
        candidates.extend(
            [
                Path(r"C:\Windows\Fonts\YuGothM.ttc"),
                Path(r"C:\Windows\Fonts\meiryo.ttc"),
            ]
        )
        for candidate in candidates:
            if candidate.exists():
                try:
                    return ImageFont.truetype(str(candidate), size=size)
                except OSError:
                    continue
        return ImageFont.load_default()

    def _draw_centered_text(self, draw, box: tuple[int, int, int, int], text: str, font) -> None:
        bbox = draw.textbbox((0, 0), text, font=font)
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        x = box[0] + ((box[2] - box[0]) - width) / 2
        y = box[1] + ((box[3] - box[1]) - height) / 2
        draw.text((x, y), text, fill="#111827", font=font)

    def _draw_left_text(self, draw, box: tuple[int, int, int, int], text: str, font) -> None:
        bbox = draw.textbbox((0, 0), text, font=font)
        height = bbox[3] - bbox[1]
        y = box[1] + ((box[3] - box[1]) - height) / 2
        draw.text((box[0], y), text, fill="#111827", font=font)
