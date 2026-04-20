from __future__ import annotations

import tkinter as tk
from tkinter import ttk


class ProgressDialog(tk.Toplevel):
    def __init__(self, parent: tk.Misc, title: str, initial_message: str) -> None:
        super().__init__(parent)
        self.parent = parent
        self.message_var = tk.StringVar(value=initial_message)
        self.detail_var = tk.StringVar(value="0 / 1")

        self.title(title)
        self.resizable(False, False)
        self.transient(parent)
        self.protocol("WM_DELETE_WINDOW", self._ignore_close)

        container = ttk.Frame(self, padding=16)
        container.pack(fill="both", expand=True)

        ttk.Label(container, text=title, style="SubTitle.TLabel").pack(anchor="w")
        ttk.Label(
            container,
            textvariable=self.message_var,
            style="Muted.TLabel",
            justify="left",
            wraplength=420,
        ).pack(anchor="w", pady=(10, 8))

        self.progress = ttk.Progressbar(container, mode="determinate", maximum=1, value=0, length=420)
        self.progress.pack(fill="x")
        ttk.Label(container, textvariable=self.detail_var, style="Muted.TLabel").pack(anchor="e", pady=(8, 0))

        self.update_idletasks()
        self._center_on_parent()
        self.grab_set()

    def set_progress(self, message: str, current: int, total: int) -> None:
        safe_total = max(1, int(total))
        safe_current = max(0, min(int(current), safe_total))
        percent = int((safe_current / safe_total) * 100)

        self.message_var.set(message)
        self.progress.configure(maximum=safe_total, value=safe_current)
        self.detail_var.set(f"{safe_current} / {safe_total} ({percent}%)")
        self.update_idletasks()

    def close(self) -> None:
        try:
            self.grab_release()
        except tk.TclError:
            pass
        self.destroy()

    def _ignore_close(self) -> None:
        return

    def _center_on_parent(self) -> None:
        self.update_idletasks()
        parent_x = self.parent.winfo_rootx()
        parent_y = self.parent.winfo_rooty()
        parent_width = self.parent.winfo_width()
        parent_height = self.parent.winfo_height()
        width = self.winfo_width()
        height = self.winfo_height()

        x = parent_x + max(0, (parent_width - width) // 2)
        y = parent_y + max(0, (parent_height - height) // 2)
        self.geometry(f"+{x}+{y}")
