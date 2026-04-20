from pathlib import Path

APP_NAME = "ブルーアーカイブ 絆マネージャー"
APP_VERSION = "0.1.0"

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CACHE_DIR = DATA_DIR / "cache"
IMAGE_DIR = DATA_DIR / "images"
STUDENT_IMAGE_DIR = IMAGE_DIR / "students"
ITEM_IMAGE_DIR = IMAGE_DIR / "items"
DB_PATH = DATA_DIR / "bond_manager.db"
RECOVERED_DB_PATH = DATA_DIR / "bond_manager.recovered.db"
CACHE_META_PATH = CACHE_DIR / "meta.json"

DEFAULT_WINDOW_SIZE = "1240x820"

MASTER_LANG = "jp"
MASTER_RESOURCES = ("students", "items")
MASTER_PRIMARY_BASE_URL = "https://schaledb.com"
MASTER_FALLBACK_BASE_URL = "https://raw.githubusercontent.com/SchaleDB/SchaleDB/main"

MASTER_SOURCE_LABELS = {
    "web": "schaledb_web",
    "github": "schaledb_github_archive",
    "cache": "cache",
    "sample": "sample",
}

MASTER_RESOURCE_LABELS = {
    "students": "生徒データ",
    "items": "贈り物データ",
}

GIFT_BOX_TYPES = [
    ("orange_S", "橙 小"),
    ("orange_M", "橙 中"),
    ("orange_L", "橙 大"),
    ("orange_XL", "橙 特大"),
    ("purple_S", "紫 小"),
    ("purple_M", "紫 中"),
    ("purple_L", "紫 大"),
    ("purple_XL", "紫 特大"),
]

SELECTABLE_BOX_KEY = "orange_L"
SELECTABLE_BOX_ITEM_ID = -1001
SELECTABLE_BOX_NAME = "選択式ボックス"
SELECTABLE_BOX_ICON_FILE = "item_icon_favor_selection.webp"

PRIORITY_ORDER = {
    "top_priority": 5,
    "priority": 4,
    "semi_priority": 3,
    "defer": 2,
    "done": 1,
}
PRIORITY_LABELS = {
    "top_priority": "最優先",
    "priority": "優先",
    "semi_priority": "準優先",
    "defer": "見送り",
    "done": "終了",
}

OPTIMIZE_STRATEGIES = {
    "priority": "優先度順",
    "balanced": "均等配分",
    "focus": "1人集中",
}

HIDDEN_ITEM_NAMES = {"初音ミクのフォトカード"}
HIDDEN_ITEM_ICON_NAMES = {"item_icon_favor_ssr_2"}

SCHOOL_NAME_MAP = {
    "Abydos": "アビドス",
    "Arius": "アリウス",
    "ETC": "その他",
    "Gehenna": "ゲヘナ",
    "Highlander": "ハイランダー",
    "Hyakkiyako": "百鬼夜行",
    "Millennium": "ミレニアム",
    "RedWinter": "レッドウィンター",
    "SRT": "SRT",
    "Sakugawa": "柵川",
    "Shanhaijing": "山海経",
    "Tokiwadai": "常盤台",
    "Trinity": "トリニティ",
    "Valkyrie": "ヴァルキューレ",
    "WildHunt": "ワイルドハント",
}


def normalize_school_name(value: str) -> str:
    school = str(value or "").strip()
    return SCHOOL_NAME_MAP.get(school, school)


def is_hidden_item(name: str = "", icon_name: str = "") -> bool:
    return str(name or "").strip() in HIDDEN_ITEM_NAMES or str(icon_name or "").strip() in HIDDEN_ITEM_ICON_NAMES
