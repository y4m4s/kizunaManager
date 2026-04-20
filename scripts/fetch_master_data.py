from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.database import Database
from src.master_data import cache_icons, download_master_data, sync_cache_to_database


def main() -> None:
    parser = argparse.ArgumentParser(description="SchaleDB のマスターデータを取得して SQLite に投入します。")
    parser.add_argument("--timeout", type=int, default=30, help="HTTPタイムアウト秒数")
    parser.add_argument("--with-icons", action="store_true", help="生徒/贈り物アイコンも合わせて取得します")
    args = parser.parse_args()

    database = Database()
    database.initialize()

    payloads = download_master_data(timeout=args.timeout)
    source = sync_cache_to_database(database)
    counts = database.get_master_counts()
    icon_counts = {"students": 0, "items": 0}
    if args.with_icons:
        icon_counts = cache_icons(database, timeout=args.timeout)

    print(f"downloaded: {', '.join(sorted(payloads.keys()))}")
    print(f"master source: {source}")
    print(f"students: {counts['students']}")
    print(f"items: {counts['items']}")
    if args.with_icons:
        print(f"student icons: {icon_counts['students']}")
        print(f"item icons: {icon_counts['items']}")


if __name__ == "__main__":
    main()
