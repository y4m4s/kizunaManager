# ブルーアーカイブ 絆マネージャー — 設計仕様書

## 1. プロジェクト概要

ブルーアーカイブ（ブルアカ）の絆上げを効率的に管理するためのデスクトップGUIアプリケーション。
キャラと贈り物の相性確認、所持状況の管理、絆上げ計画の策定、最適なアイテム配分の導出を行う。

---

## 2. 機能要件

### 2.1 キャラ検索・贈り物相性表示
- キャラ名（日本語）で検索・フィルタリング
- 学校名でフィルタリング
- 選択したキャラに対応する贈り物と効果レベル（効果小/中/大/特大）を一覧表示
- 贈り物アイコン画像を表示（SchaleDBから取得）

### 2.2 ユーザーデータ管理
- 所持キャラの登録・削除
- 各キャラの現在の絆ランク（1〜100）と絆経験値の記録
- 贈り物（アイテム）の所持数管理
  - 通常贈り物（上級）: 35種類
  - 高級贈り物（最上級）: 13種類
  - 花束（全キャラ共通）: 3種類
  - 選択式贈り物ボックス（橙小/中/大/特大、紫小/中/大/特大）

### 2.3 絆上げ計画機能
- 絆上げしたいキャラを複数登録（目標絆ランク付き）
- 現在の絆ランク → 目標ランクまでの必要経験値を自動計算
- 優先度の設定（高/中/低）
- 進捗率の表示

### 2.4 アイテム配分最適化
- 登録された計画キャラ全体を俯瞰
- 手持ちの贈り物を各キャラにどう配分すれば効率的かを計算
- 最適化方針：
  - 各キャラの「好物」に該当する贈り物を優先割り当て
  - 複数キャラが同じ贈り物を好む場合、優先度・必要残EXP量で判断
  - 割り当て結果のシミュレーション表示（配分後の絆ランク予測）

### 2.5 絆経験値計算
- 絆ランクN → N+1に必要な経験値の計算
- 現在ランク → 目標ランクまでの累計必要経験値
- 贈り物の効果レベル別の獲得経験値を考慮

---

## 3. 技術選定

### 3.1 言語・フレームワーク
- **言語**: Python 3.10+
- **GUI**: CustomTkinter（tkinterベースでモダンなUI）
  - `pip install customtkinter`
  - 軽量で依存が少なく、クロスプラットフォーム対応
- **DB**: SQLite3（Python標準ライブラリ）
- **画像処理**: Pillow（アイコン表示用）
- **HTTP**: requests（マスターデータ取得用）

### 3.2 ディレクトリ構成（予定）
```
bluearchive-bond-manager/
├── main.py                  # エントリポイント
├── requirements.txt
├── README.md
├── data/
│   ├── bond_manager.db      # SQLiteデータベース（ユーザーデータ+マスターデータ）
│   └── images/              # キャッシュした画像
│       ├── students/        # キャラアイコン
│       └── items/           # 贈り物アイコン
├── src/
│   ├── __init__.py
│   ├── database.py          # DB初期化・CRUD操作
│   ├── master_data.py       # SchaleDBからのデータ取得・パース
│   ├── bond_calculator.py   # 絆経験値計算ロジック
│   ├── optimizer.py         # アイテム配分最適化ロジック
│   └── ui/
│       ├── __init__.py
│       ├── app.py           # メインウィンドウ
│       ├── search_view.py   # キャラ検索・相性表示画面
│       ├── inventory_view.py # 所持状況管理画面
│       ├── plan_view.py     # 絆上げ計画画面
│       └── optimize_view.py # 最適化結果画面
└── scripts/
    └── fetch_master_data.py # マスターデータ一括取得スクリプト
```

---

## 4. データソース — SchaleDB

### 4.1 概要
SchaleDB（https://schaledb.com / 旧 schale.gg）はブルアカの非公式データベース。
GitHubリポジトリ: https://github.com/SchaleDB/SchaleDB （2025年6月にアーカイブ済み、読み取り専用）

データは `data/{lang}/` 配下にJSONで格納されている。日本語版は `data/jp/`。

### 4.2 使用するデータファイル
以下のURLからrawデータを取得する：

```
https://raw.githubusercontent.com/SchaleDB/SchaleDB/main/data/jp/students.min.json
https://raw.githubusercontent.com/SchaleDB/SchaleDB/main/data/jp/items.min.json
https://raw.githubusercontent.com/SchaleDB/SchaleDB/main/data/jp/localization.min.json
```

#### 注意: リポジトリがアーカイブ済みのため、新キャラが追加されても更新されない可能性がある。
代替案として schaledb.com のAPIエンドポイント（schaledb.com は Vue で再構築されている）を使う方法もあるが、公式APIドキュメントは存在しない。
起動時にGitHub rawが取得失敗したらローカルキャッシュを使う仕様にすること。

### 4.3 students.min.json のデータ構造（贈り物関連フィールド）

各生徒オブジェクトの主要フィールド：

```json
{
  "Id": 10000,
  "Name": "アル",
  "School": "Gehenna",
  "FavorItemTags": ["TagA", "TagB"],
  "FavorItemUniqueTags": ["UniqueTagX"],
  ...
}
```

- **`Id`**: 生徒の固有ID（数値）
- **`Name`**: 日本語名
- **`School`**: 所属学校（英語）
- **`FavorItemTags`**: この生徒が好む贈り物のカテゴリタグ（配列）。items側のTagsとマッチさせて相性を判定する
- **`FavorItemUniqueTags`**: 愛用品・効果特大用タグ（配列）

### 4.4 items.min.json のデータ構造（贈り物関連）

```json
{
  "Id": 50001,
  "Name": "ネコ耳ヘッドフォン",
  "Tags": ["TagA"],
  "Rarity": "SR",
  "Category": "Favor",
  "ExpValue": 60,
  "Icon": "icon_filename",
  ...
}
```

- **`Tags`**: このアイテムが持つカテゴリタグ。生徒の`FavorItemTags`と一致すれば相性が良い
- **`ExpValue`**: 基本経験値
- **`Category`**: "Favor" が贈り物

### 4.5 贈り物の経験値と効果レベルの関係

贈り物を生徒に渡した時の経験値は「相性」によって変わる：

| 効果レベル | 経験値（通常贈り物） | 経験値（高級贈り物） | 条件 |
|-----------|-------------------|-------------------|------|
| 効果小    | 20               | 40                | タグ不一致 |
| 効果中    | 40               | 80                | FavorItemTags に部分一致 |
| 効果大    | 60               | 120               | FavorItemTags に完全一致 |
| 効果特大  | （通常にはなし）    | 240               | FavorItemUniqueTags 一致（愛用品） |

※ 花束は全キャラに対して一定の効果。

### 4.6 生徒アイコン画像のURL

```
https://raw.githubusercontent.com/SchaleDB/SchaleDB/main/images/student/icon/{student_id}.webp
```

### 4.7 贈り物アイコン画像のURL

```
https://raw.githubusercontent.com/SchaleDB/SchaleDB/main/images/item/icon/{item_icon}.webp
```

※ webp形式。Pillowで読み込み可能。

---

## 5. 絆経験値テーブル

### 5.1 ランク別必要経験値

ブルアカの絆ランクアップに必要な経験値は以下の公式に従う（有志検証データに基づく）。
正確なテーブルはSchaleDBにも含まれているが、以下は検証済みの値：

```python
# 各ランクの次のランクに上がるための必要経験値
# bond_exp_table[n] = ランクn → ランクn+1 に必要な経験値
BOND_EXP_TABLE = {
    1: 30, 2: 30, 3: 45, 4: 45, 5: 75, 6: 75, 7: 75, 8: 75, 9: 75,
    10: 100, 11: 100, 12: 100, 13: 100, 14: 100,
    15: 150, 16: 150, 17: 150, 18: 150, 19: 150,
    20: 300, 21: 300, 22: 300, 23: 300, 24: 300,
    25: 450, 26: 450, 27: 450, 28: 450, 29: 450,
    30: 525, 31: 525, 32: 525, 33: 525, 34: 525,
    35: 600, 36: 600, 37: 600, 38: 600, 39: 600,
    40: 825, 41: 825, 42: 825, 43: 825, 44: 825,
    45: 1050, 46: 1050, 47: 1050, 48: 1050, 49: 1050,
    # ランク50以降は段階的に増加
    # 50→51: 1200, 以降さらに増加
    # ランク100までの完全テーブルはSchaleDBまたは有志Wikiから取得すること
}
# 注意: この値は概算。正確な値はSchaleDBのデータまたは
# https://bluearchive.wikiru.jp/?SandBox/絆ランク から確認すること。
# 実装時はSchaleDBのデータを正としてテーブルを完成させる。
```

### 5.2 主要マイルストーン

| 目標ランク | 累計必要経験値（概算） | 備考 |
|-----------|---------------------|------|
| 20        | 約 1,575            | ステータスボーナス効率良い区間 |
| 50        | 約 29,175           | ステータスボーナス上限 |
| 80        | 約 120,000          | 100までの折り返し地点 |
| 100       | 240,225             | 最大 |

### 5.3 その他の経験値獲得手段（参考値）

- カフェタッチ: 1回あたり約20 EXP
- スケジュール（ロケーションRank12）: 1回あたり25 EXP（ボーナス時50）

---

## 6. データベース設計（SQLite）

### 6.1 マスターデータテーブル

```sql
-- 生徒マスター
CREATE TABLE IF NOT EXISTS master_students (
    id INTEGER PRIMARY KEY,          -- SchaleDB の Id
    name TEXT NOT NULL,              -- 日本語名
    school TEXT,                     -- 所属学校
    icon_path TEXT,                  -- ローカルアイコン画像パス
    favor_item_tags TEXT,            -- JSON配列文字列 '["TagA","TagB"]'
    favor_item_unique_tags TEXT,     -- JSON配列文字列
    raw_json TEXT                    -- 元データ全体（将来の拡張用）
);

-- アイテム（贈り物）マスター
CREATE TABLE IF NOT EXISTS master_items (
    id INTEGER PRIMARY KEY,          -- SchaleDB の Id
    name TEXT NOT NULL,              -- 日本語名
    tags TEXT,                       -- JSON配列文字列
    rarity TEXT,                     -- "R", "SR", "SSR" 等
    category TEXT,                   -- "Favor" = 贈り物
    exp_value INTEGER,               -- 基本経験値
    icon_path TEXT,                  -- ローカルアイコン画像パス
    raw_json TEXT
);

-- 絆経験値テーブル
CREATE TABLE IF NOT EXISTS master_bond_exp (
    level INTEGER PRIMARY KEY,       -- 絆ランク (1〜99)
    exp_required INTEGER NOT NULL,   -- このランクから次のランクへの必要経験値
    cumulative_exp INTEGER NOT NULL   -- ランク1からここまでの累計経験値
);
```

### 6.2 ユーザーデータテーブル

```sql
-- ユーザー所持キャラ・絆状況
CREATE TABLE IF NOT EXISTS user_students (
    student_id INTEGER PRIMARY KEY REFERENCES master_students(id),
    current_bond_level INTEGER DEFAULT 1,
    current_bond_exp INTEGER DEFAULT 0,   -- 現在のランク内での獲得済みEXP
    star_rank INTEGER DEFAULT 1,          -- 星ランク（1〜5、絆上限に関係）
    notes TEXT,                           -- メモ
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ユーザー贈り物インベントリ
CREATE TABLE IF NOT EXISTS user_inventory (
    item_id INTEGER PRIMARY KEY REFERENCES master_items(id),
    quantity INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 選択式ボックス在庫（橙/紫 × 小/中/大/特大）
CREATE TABLE IF NOT EXISTS user_gift_boxes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    box_type TEXT NOT NULL,  -- 'orange_S','orange_M','orange_L','orange_XL','purple_S','purple_M','purple_L','purple_XL'
    quantity INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 絆上げ計画
CREATE TABLE IF NOT EXISTS user_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES master_students(id),
    target_bond_level INTEGER NOT NULL,
    priority TEXT DEFAULT 'medium',  -- 'high', 'medium', 'low'
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. コア計算ロジック

### 7.1 必要経験値計算

```python
def calc_required_exp(current_level: int, current_exp: int, target_level: int) -> int:
    """
    現在の絆ランクと経験値から、目標ランクまでの残り必要経験値を計算する。
    current_level: 現在のランク (1-100)
    current_exp: 現在のランク内で獲得済みの経験値
    target_level: 目標ランク (1-100)
    """
    total = 0
    for lv in range(current_level, target_level):
        total += bond_exp_table[lv]
    return total - current_exp
```

### 7.2 贈り物効果判定

```python
def get_gift_effect(student: dict, item: dict) -> str:
    """
    生徒とアイテムの相性から効果レベルを判定する。
    Returns: 'small', 'medium', 'large', 'extra_large'
    """
    student_tags = set(student['favor_item_tags'])
    student_unique = set(student['favor_item_unique_tags'])
    item_tags = set(item['tags'])

    if item_tags & student_unique:
        return 'extra_large'  # 効果特大
    elif item_tags & student_tags:
        # 一致するタグ数で大/中を判定（要検証）
        return 'large'  # 効果大
    else:
        return 'small'  # 効果小
```

※ 中/大の判定ロジックは SchaleDB のデータを詳細に分析して確定させること。
  タグの一致方法（完全一致 vs 部分一致）は実データで検証する必要がある。

### 7.3 アイテム配分最適化（貪欲法）

```python
def optimize_allocation(plans, inventory, students, items):
    """
    優先度順にキャラを並べ、各キャラの好物を優先的に割り当てる。
    1. 計画をpriority降順 → 必要EXP降順でソート
    2. 各キャラについて:
       a. 手持ちアイテムの中から効果特大 > 大 > 中 の順に割り当て
       b. 割り当てたアイテム数と獲得予定EXPを記録
       c. インベントリから消費分を減算
    3. 結果を返す（各キャラ: 割り当てアイテム一覧、予測到達ランク）
    """
    pass  # 実装時に詳細化
```

---

## 8. GUI画面設計

### 8.1 メインウィンドウ
- サイドバー（ナビゲーション）: 検索 / 所持管理 / 計画 / 最適化
- メインコンテンツエリア: 各画面を切り替え表示
- ウィンドウサイズ: 1200x800 推奨

### 8.2 キャラ検索画面（search_view）
- 上部: 検索バー（インクリメンタル検索）＋学校フィルタドロップダウン
- 左: キャラ一覧（アイコン + 名前、スクロール可能）
- 右: 選択キャラの詳細
  - 贈り物相性テーブル（アイコン + 名前 + 効果レベル）
  - 効果特大 → 大 → 中 → 小 の順にソート

### 8.3 所持管理画面（inventory_view）
- タブ1: キャラ管理
  - 所持キャラ一覧（絆ランク表示付き）
  - キャラ追加/削除ボタン
  - 絆ランク・星ランク編集
- タブ2: 贈り物管理
  - 贈り物一覧（アイコン + 名前 + 所持数入力欄）
  - 選択ボックス在庫入力

### 8.4 絆上げ計画画面（plan_view）
- 計画一覧テーブル:
  - キャラ名 | 現在ランク | 目標ランク | 必要EXP | 優先度 | 進捗バー
- 計画追加/編集/削除
- 合計必要EXPの表示

### 8.5 最適化画面（optimize_view）
- 「最適化実行」ボタン
- 結果テーブル:
  - キャラ名 | 割り当てアイテム一覧 | 獲得予定EXP | 到達予測ランク
- 割り当て方針の切り替え（均等配分 / 優先度順 / 1人集中）

---

## 9. 開発フェーズ

### Phase 1: 基盤構築（優先）
- [ ] プロジェクト初期化（ディレクトリ構造、requirements.txt）
- [ ] SchaleDBからマスターデータ取得スクリプト（students, items）
- [ ] SQLiteデータベース初期化・マスターデータ投入
- [ ] キャラ検索画面（検索 + 贈り物相性表示）

### Phase 2: ユーザーデータ管理
- [ ] 所持キャラ登録・絆ランク管理
- [ ] 贈り物インベントリ管理
- [ ] データの永続化（SQLite）

### Phase 3: 計画・計算機能
- [ ] 絆経験値計算ロジック
- [ ] 絆上げ計画の作成・管理
- [ ] 進捗率・必要EXP表示

### Phase 4: 最適化・仕上げ
- [ ] アイテム配分最適化ロジック
- [ ] 最適化結果の可視化
- [ ] UIの仕上げ（レスポンシブ、テーマ統一）
- [ ] エラーハンドリング・データバックアップ機能

---

## 10. 注意事項・補足

### 10.1 SchaleDBリポジトリのアーカイブ対応
SchaleDBのGitHubリポジトリは2025年6月にアーカイブ済み。新キャラのデータが反映されない可能性がある。
対策：
- schaledb.com のフロントエンドが内部的に使っているAPIエンドポイントを調査する
- 手動でデータを追加できるUI（マスターデータ編集機能）を将来的に用意する

### 10.2 経験値テーブルの精度
上記の経験値テーブルは有志検証値に基づく概算。正確な値は以下のソースで確認：
- SchaleDB の data ファイル
- 有志Wiki: https://bluearchive.wikiru.jp/?SandBox/絆ランク
- 絆ランク皮算用: https://satsuki-gomeari.github.io/calculate_bond/
  （GitHub Pages、ソースコードにJSで経験値テーブルが埋め込まれている可能性あり）

### 10.3 タグマッチングの詳細
SchaleDBでの贈り物相性判定の正確なロジックは、SchaleDBのJavaScriptソースコードに実装がある。
特に「効果中」と「効果大」の判定基準（タグの一致数？タグの種類？）は
GitHub上のソースコードを確認して正確に再現すること。

### 10.4 画像のキャッシュ
SchaleDBから画像を毎回ダウンロードするのは非効率なので、初回取得時に
`data/images/` にキャッシュし、2回目以降はローカルから読み込むこと。
WebP形式なのでPillowで読み込む際は `pip install Pillow` が必要。

### 10.5 ロケール
UIは日本語で統一。フォントはシステムの日本語フォントにフォールバック。
CustomTkinterの場合、`CTkFont` でフォント指定可能。

---

## 11. 参考URL一覧

| リソース | URL |
|---------|-----|
| SchaleDB (Web) | https://schaledb.com |
| SchaleDB (GitHub, archived) | https://github.com/SchaleDB/SchaleDB |
| SchaleDB raw data (JP students) | https://raw.githubusercontent.com/SchaleDB/SchaleDB/main/data/jp/students.min.json |
| SchaleDB raw data (JP items) | https://raw.githubusercontent.com/SchaleDB/SchaleDB/main/data/jp/items.min.json |
| きなこもち 贈り物相性ツール | https://kina-ko-m-ochi.net/gift/ |
| 絆ランク皮算用 | https://satsuki-gomeari.github.io/calculate_bond/ |
| blue-utils.me 贈り物テーブル | https://blue-utils.me/table/favor?lang=En |
| 有志Wiki 絆ランク | https://bluearchive.wikiru.jp/?SandBox/絆ランク |
| Game8 贈り物逆引き | https://game8.jp/blue-archive/640072 |
| CustomTkinter ドキュメント | https://customtkinter.tomschimansky.com/ |
