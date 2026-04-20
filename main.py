from __future__ import annotations

import os
import sys
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

import webview

from src.api import Api
from src.config import DATA_DIR
from src.database import Database
from src.master_data import ensure_bootstrap_data, refresh_master_data

ASSET_SERVER_PORT = 8765
VITE_DEV_URL = "http://localhost:5173"
FRONTEND_DIST = Path(__file__).parent / "frontend" / "dist" / "index.html"


def _start_asset_server(directory: Path, port: int) -> None:
    """data/ 配下の画像などを HTTP で配信するサーバーをデーモンスレッドで起動する。"""

    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *_) -> None:  # ログ抑制
            pass

        def end_headers(self) -> None:
            # ローカルフロントからのアクセスを許可
            self.send_header("Access-Control-Allow-Origin", "*")
            super().end_headers()

    orig_dir = Path.cwd()
    os.chdir(str(directory))

    server = HTTPServer(("127.0.0.1", port), QuietHandler)

    def serve() -> None:
        os.chdir(str(directory))  # スレッド内でも確実に変更
        server.serve_forever()

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    os.chdir(str(orig_dir))  # メインスレッドのカレントディレクトリを元に戻す


def main() -> None:
    dev_mode = "--dev" in sys.argv

    # ── データベース初期化 ──────────────────────────────────────
    database = Database()
    database.initialize()
    ensure_bootstrap_data(database)
    if not dev_mode:
        # 本番起動時のみ自動更新（開発中は毎回更新しない）
        refresh_master_data(database, timeout=10, max_age_hours=24)

    # ── API / アセットサーバー起動 ──────────────────────────────
    api = Api(database)
    _start_asset_server(DATA_DIR, ASSET_SERVER_PORT)

    # ── フロントエンド URL 決定 ─────────────────────────────────
    if dev_mode:
        url = VITE_DEV_URL
    else:
        if not FRONTEND_DIST.exists():
            print(
                "[ERROR] frontend/dist/index.html が見つかりません。\n"
                "  cd frontend && npm run build を実行してください。",
                file=sys.stderr,
            )
            sys.exit(1)
        url = FRONTEND_DIST.as_uri()

    # ── pywebview ウィンドウ起動 ────────────────────────────────
    window = webview.create_window(
        title="ブルーアーカイブ 絆マネージャー",
        url=url,
        js_api=api,
        width=1280,
        height=860,
        min_size=(1000, 700),
    )
    api.set_window(window)

    webview.start(debug=dev_mode)

    # ── 終了処理 ────────────────────────────────────────────────
    database.close()


if __name__ == "__main__":
    main()
