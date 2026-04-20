from __future__ import annotations

import queue
import threading
import tkinter as tk
from tkinter import messagebox, ttk
from typing import Any, Callable

try:
    import customtkinter as ctk
except ImportError:  # pragma: no cover - optional at runtime
    ctk = None

from src.config import APP_NAME, APP_VERSION, DEFAULT_WINDOW_SIZE
from src.database import Database
from src.master_data import cache_icons, update_master_data_with_icons
from src.ui.icons import IconStore
from src.ui.manage_inline_view import ManageView
from src.ui.optimize_view import OptimizeView
from src.ui.progress_dialog import ProgressDialog
from src.ui.reference_search_view import SearchView

TaskProgressFn = Callable[[str, int, int], None]
TaskRunnerFn = Callable[[TaskProgressFn], dict[str, Any]]
TaskSuccessFn = Callable[[dict[str, Any]], None]


class BondManagerApp:
    def __init__(self, database) -> None:
        self.database = database
        self.root = self._create_root()
        self.icon_store = IconStore(self.root)
        self.status_var = tk.StringVar(value="")
        self.active_view = "search"
        self.views: dict[str, ttk.Frame] = {}
        self.nav_buttons: dict[str, ttk.Button] = {}
        self.action_buttons: list[ttk.Button] = []
        self._task_queue: queue.Queue[tuple[str, Any]] | None = None
        self._task_thread: threading.Thread | None = None
        self._progress_dialog: ProgressDialog | None = None

        self._configure_root()
        self._configure_styles()
        self._build_layout()
        self.refresh_all()
        self.show_view("search")

    def _create_root(self):
        if ctk is not None:
            ctk.set_appearance_mode("system")
            ctk.set_default_color_theme("blue")
            return ctk.CTk()
        return tk.Tk()

    def _configure_root(self) -> None:
        self.root.title(f"{APP_NAME} {APP_VERSION}")
        self.root.geometry(DEFAULT_WINDOW_SIZE)
        self.root.minsize(1120, 760)
        try:
            self.root.configure(bg="#eef4ff")
        except tk.TclError:
            if ctk is not None and isinstance(self.root, ctk.CTk):
                self.root.configure(fg_color="#eef4ff")

    def _configure_styles(self) -> None:
        style = ttk.Style(self.root)
        style.theme_use("clam")

        default_font = ("Yu Gothic UI", 10)
        title_font = ("Yu Gothic UI Semibold", 16)
        subtitle_font = ("Yu Gothic UI Semibold", 11)

        style.configure(".", font=default_font)
        style.configure("Title.TLabel", font=title_font, foreground="#13314e", background="#eaf2ff")
        style.configure("SubTitle.TLabel", font=subtitle_font, foreground="#264d73", background="#ffffff")
        style.configure("Muted.TLabel", foreground="#617691", background="#ffffff")
        style.configure("Sidebar.TFrame", background="#dbe8fb")
        style.configure("Content.TFrame", background="#eef4ff")
        style.configure("Card.TFrame", background="#ffffff", relief="flat")
        style.configure("Nav.TButton", anchor="w", padding=(14, 10), background="#dbe8fb")
        style.configure("Primary.TButton", padding=(12, 8))
        style.configure("Treeview", rowheight=34, fieldbackground="#ffffff", background="#ffffff")
        style.configure("Treeview.Heading", font=("Yu Gothic UI Semibold", 10))
        style.configure("TLabelframe", background="#ffffff")
        style.configure("TLabelframe.Label", font=subtitle_font)
        style.configure("TNotebook", background="#eef4ff")
        style.configure("TNotebook.Tab", padding=(12, 8))
        style.configure("TCombobox", padding=6)
        style.configure("HeaderBar.TFrame", background="#ffffff")

    def _build_layout(self) -> None:
        shell = ttk.Frame(self.root, style="Content.TFrame", padding=12)
        shell.pack(fill="both", expand=True)
        shell.columnconfigure(1, weight=1)
        shell.rowconfigure(0, weight=1)

        sidebar = ttk.Frame(shell, style="Sidebar.TFrame", padding=(16, 20))
        sidebar.grid(row=0, column=0, sticky="nsw")
        sidebar.configure(width=220)

        content = ttk.Frame(shell, style="Content.TFrame")
        content.grid(row=0, column=1, sticky="nsew", padx=(12, 0))
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=1)

        ttk.Label(sidebar, text=APP_NAME, style="Title.TLabel").pack(anchor="w")
        ttk.Label(sidebar, text="軽量・ローカル完結・扱いやすいUX", style="Muted.TLabel").pack(anchor="w", pady=(4, 18))

        for key, label in (
            ("search", "検索"),
            ("manage", "管理"),
            ("optimize", "最適化"),
        ):
            button = ttk.Button(sidebar, text=label, style="Nav.TButton", command=lambda name=key: self.show_view(name))
            button.pack(fill="x", pady=4)
            self.nav_buttons[key] = button

        ttk.Separator(sidebar, orient="horizontal").pack(fill="x", pady=16)
        ttk.Label(sidebar, textvariable=self.status_var, style="Muted.TLabel", wraplength=180, justify="left").pack(
            anchor="w"
        )

        header = ttk.Frame(content, style="HeaderBar.TFrame", padding=(18, 14))
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(0, weight=1)
        ttk.Label(header, text="Blue Archive Bond Manager", style="Title.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(header, text="検索から管理、配分までを1画面でつなぐデスクトップツール", style="Muted.TLabel").grid(
            row=1, column=0, sticky="w", pady=(4, 0)
        )

        action_frame = ttk.Frame(header, style="HeaderBar.TFrame")
        action_frame.grid(row=0, column=1, rowspan=2, sticky="e")

        refresh_button = ttk.Button(
            action_frame,
            text="最新データ更新",
            style="Primary.TButton",
            command=self._handle_update_master_data,
        )
        refresh_button.pack(side="left", padx=(0, 8))
        self.action_buttons.append(refresh_button)

        icon_button = ttk.Button(
            action_frame,
            text="画像ダウンロード",
            command=self._handle_download_icons,
        )
        icon_button.pack(side="left")
        self.action_buttons.append(icon_button)

        self.container = ttk.Frame(content, style="Content.TFrame")
        self.container.grid(row=1, column=0, sticky="nsew", pady=(12, 0))
        self.container.columnconfigure(0, weight=1)
        self.container.rowconfigure(0, weight=1)

        view_classes = {
            "search": SearchView,
            "manage": ManageView,
            "optimize": OptimizeView,
        }
        for name, view_class in view_classes.items():
            frame = view_class(self.container, self.database, self.icon_store, on_data_changed=self.refresh_all)
            frame.grid(row=0, column=0, sticky="nsew")
            self.views[name] = frame

    def show_view(self, name: str) -> None:
        self.active_view = name
        frame = self.views[name]
        frame.tkraise()
        self._refresh_nav_style()
        if hasattr(frame, "refresh"):
            frame.refresh()

    def _refresh_nav_style(self) -> None:
        for name, button in self.nav_buttons.items():
            button.configure(text=f"● {button.cget('text').replace('● ', '').replace('○ ', '')}")
            if name != self.active_view:
                button.configure(text=f"○ {button.cget('text').replace('● ', '').replace('○ ', '')}")

    def refresh_all(self) -> None:
        counts = self.database.get_master_counts()
        source = self.database.get_meta("master_source") or "unknown"
        refreshed_at = self.database.get_meta("master_refreshed_at") or ""
        refresh_text = self._format_timestamp(refreshed_at)
        self.status_var.set(
            f"マスターデータ: {source}\n生徒 {counts['students']} / 贈り物 {counts['items']}\n更新: {refresh_text}"
        )
        for frame in self.views.values():
            if hasattr(frame, "refresh"):
                frame.refresh()

    def run(self) -> None:
        self.root.protocol("WM_DELETE_WINDOW", self._close)
        self.root.mainloop()

    def _close(self) -> None:
        self.database.close()
        self.root.destroy()

    def _handle_update_master_data(self) -> None:
        self._start_background_task(
            title="最新データ更新",
            initial_message="SchaleDB から最新の生徒データ、贈り物データ、未取得画像を順番に更新しています。",
            worker=self._run_update_master_data,
            on_success=self._show_master_update_result,
        )

    def _handle_download_icons(self) -> None:
        self._start_background_task(
            title="画像ダウンロード",
            initial_message="生徒と贈り物の画像を確認し、未取得分をダウンロードしています。",
            worker=self._run_download_icons,
            on_success=self._show_icon_download_result,
        )

    def _start_background_task(
        self,
        title: str,
        initial_message: str,
        worker: TaskRunnerFn,
        on_success: TaskSuccessFn,
    ) -> None:
        if self._task_thread is not None and self._task_thread.is_alive():
            messagebox.showinfo("処理実行中", "別の処理が進行中です。完了してから実行してください。")
            return

        self._set_action_buttons_enabled(False)
        self._progress_dialog = ProgressDialog(self.root, title, initial_message)
        self._task_queue = queue.Queue()

        def background_job() -> None:
            def report(message: str, current: int, total: int) -> None:
                if self._task_queue is not None:
                    self._task_queue.put(("progress", (message, current, total)))

            try:
                result = worker(report)
            except Exception as exc:  # pragma: no cover - GUI thread handling
                error_text = f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__
                if self._task_queue is not None:
                    self._task_queue.put(("error", error_text))
                return

            if self._task_queue is not None:
                self._task_queue.put(("success", result))

        self._task_thread = threading.Thread(target=background_job, daemon=True)
        self._task_thread.start()
        self.root.after(100, lambda: self._poll_task_queue(title, on_success))

    def _poll_task_queue(self, title: str, on_success: TaskSuccessFn) -> None:
        if self._task_queue is None:
            return

        success_payload: dict[str, Any] | None = None
        error_message: str | None = None

        while True:
            try:
                event_type, payload = self._task_queue.get_nowait()
            except queue.Empty:
                break

            if event_type == "progress" and self._progress_dialog is not None:
                message, current, total = payload
                self._progress_dialog.set_progress(message, current, total)
            elif event_type == "success":
                success_payload = payload
            elif event_type == "error":
                error_message = str(payload)

        if error_message is not None:
            self._finish_background_task()
            messagebox.showerror(title, error_message)
            return

        if success_payload is not None:
            self._finish_background_task()
            self.icon_store.clear()
            self.refresh_all()
            on_success(success_payload)
            return

        if self._task_thread is not None and self._task_thread.is_alive():
            self.root.after(100, lambda: self._poll_task_queue(title, on_success))
            return

        self._finish_background_task()
        messagebox.showerror(title, "処理結果を受け取れませんでした。もう一度お試しください。")

    def _finish_background_task(self) -> None:
        if self._progress_dialog is not None and self._progress_dialog.winfo_exists():
            self._progress_dialog.close()
        self._progress_dialog = None
        self._task_queue = None
        self._task_thread = None
        self._set_action_buttons_enabled(True)

    def _set_action_buttons_enabled(self, enabled: bool) -> None:
        for button in self.action_buttons:
            if enabled:
                button.state(["!disabled"])
            else:
                button.state(["disabled"])

    def _run_update_master_data(self, progress: TaskProgressFn) -> dict[str, Any]:
        worker_database = Database()
        try:
            worker_database.initialize()
            return update_master_data_with_icons(worker_database, timeout=30, progress_callback=progress)
        finally:
            worker_database.close()

    def _run_download_icons(self, progress: TaskProgressFn) -> dict[str, Any]:
        worker_database = Database()
        try:
            worker_database.initialize()
            return cache_icons(worker_database, timeout=30, progress_callback=progress)
        finally:
            worker_database.close()

    def _show_master_update_result(self, result: dict[str, Any]) -> None:
        counts = result.get("counts", {})
        source = result.get("source", "unknown")
        icons = result.get("icons", {})
        messagebox.showinfo(
            "最新データ更新",
            (
                "最新データを反映しました。\n\n"
                f"取得元: {source}\n"
                f"生徒: {counts.get('students', 0)}\n"
                f"贈り物: {counts.get('items', 0)}\n"
                f"画像DL: {icons.get('downloaded', 0)}件\n"
                f"画像スキップ: {icons.get('skipped', 0)}件\n"
                f"画像失敗: {icons.get('failed', 0)}件"
            ),
        )

    def _show_icon_download_result(self, result: dict[str, Any]) -> None:
        messagebox.showinfo(
            "画像ダウンロード",
            (
                "画像の確認が完了しました。\n\n"
                f"ダウンロード: {result.get('downloaded', 0)}件\n"
                f"スキップ: {result.get('skipped', 0)}件\n"
                f"失敗: {result.get('failed', 0)}件"
            ),
        )

    def _format_timestamp(self, value: str) -> str:
        if not value:
            return "-"
        normalized = value.replace("T", " ")
        normalized = normalized.split("+", maxsplit=1)[0]
        normalized = normalized.split(".", maxsplit=1)[0]
        return normalized
