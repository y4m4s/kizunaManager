from __future__ import annotations

import tkinter as tk
from pathlib import Path

try:
    from PIL import Image, ImageOps, ImageTk
except ImportError:  # pragma: no cover - optional at runtime
    Image = None
    ImageOps = None
    ImageTk = None


class IconStore:
    def __init__(self, root: tk.Misc) -> None:
        self.root = root
        self._cache: dict[tuple[str, int, int], tk.PhotoImage] = {}

    def clear(self) -> None:
        self._cache.clear()

    def get(self, path: str | Path | None, label: str, size: tuple[int, int] = (40, 40)) -> tk.PhotoImage:
        normalized_path = str(path or "")
        key = (normalized_path or label, size[0], size[1])
        if key in self._cache:
            return self._cache[key]

        image = self._load_real_image(normalized_path, size)
        if image is None:
            image = self._build_placeholder(label, size)

        self._cache[key] = image
        return image

    def _load_real_image(self, path: str, size: tuple[int, int]) -> tk.PhotoImage | None:
        if not path or Image is None or ImageTk is None or ImageOps is None:
            return None

        file_path = Path(path)
        if not file_path.exists():
            return None

        try:
            with Image.open(file_path) as img:
                fitted = ImageOps.contain(img.convert("RGBA"), size)
                canvas = Image.new("RGBA", size, (0, 0, 0, 0))
                offset_x = (size[0] - fitted.size[0]) // 2
                offset_y = (size[1] - fitted.size[1]) // 2
                canvas.paste(fitted, (offset_x, offset_y), fitted)
                return ImageTk.PhotoImage(canvas)
        except OSError:
            return None

    def _build_placeholder(self, label: str, size: tuple[int, int]) -> tk.PhotoImage:
        seed = sum(ord(char) for char in label) % 255
        red = 90 + seed % 80
        green = 120 + (seed * 2) % 80
        blue = 170 + (seed * 3) % 70
        color = f"#{red:02x}{green:02x}{blue:02x}"

        image = tk.PhotoImage(master=self.root, width=size[0], height=size[1])
        image.put(color, to=(0, 0, size[0], size[1]))
        image.put("#ffffff", to=(0, 0, size[0], 2))
        image.put("#ffffff", to=(0, 0, 2, size[1]))
        image.put("#cad7ee", to=(size[0] - 2, 0, size[0], size[1]))
        image.put("#cad7ee", to=(0, size[1] - 2, size[0], size[1]))
        return image
