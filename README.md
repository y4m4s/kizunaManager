# ブルーアーカイブ 絆マネージャー

ブルーアーカイブの絆管理を、ローカル完結で軽く扱うためのデスクトップアプリです。  
現在のメイン構成は `React + TypeScript + Vite` のフロントエンドと、`Python + SQLite + pywebview` のデスクトップバックエンドです。

## 主な機能

- 検索画面
  - `贈り物から検索` と `生徒から選択` の2モード
  - 相性ごとの贈り物表示
  - 中の非表示や結果行の一時非表示
- 管理画面
  - 上部検索バーから管理対象の生徒を追加
  - 一覧の中で `現在絆 / 目標 / 優先度 / 必要EXP` を直接編集
  - 優先度は `最優先 / 優先 / 見送り / 終了`
  - 優先度順で自動ソート
- 最適化画面
  - 贈り物在庫をタイル形式で編集
  - 選択式ボックス在庫を `橙大` 扱いで計算に含める
  - `最優先 / 優先` の生徒を対象に配分を計算
  - 使わなかった贈り物の種類と残数も表示
- マスターデータ更新
  - GUI の `最新データ更新` と `画像ダウンロード` ボタンから実行
  - 実行中は進捗モーダルを表示

## 技術スタック

- フロントエンド: React 19, TypeScript, Vite, ESLint
- デスクトップ実行基盤: pywebview
- バックエンド相当: Python, sqlite3, requests
- ローカルデータ: SQLite
- 画像処理: Pillow

補足:  
`src/ui/` には旧 Tk 系 UI コードも残っていますが、現在のメイン導線は `main.py` から起動する React + pywebview 構成です。

## セットアップ

### 1. Python 依存を入れる

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. フロントエンド依存を入れる

```powershell
cd frontend
npm install
cd ..
```

## 起動方法

### 通常起動

事前にフロントエンドをビルドしてください。

```powershell
cd frontend
npm run build
cd ..
python main.py
```

`main.py` は `frontend/dist/index.html` を読み込み、pywebview のデスクトップウィンドウとして起動します。

### 開発起動

ターミナルを2つ使います。

ターミナル1:

```powershell
cd frontend
npm run dev
```

ターミナル2:

```powershell
cd c:\BA
.venv\Scripts\Activate.ps1
python main.py --dev
```

注意:  
`http://localhost:5173` をブラウザで直接開いても、Python 側 API が無いためデータは表示されません。  
必ず `python main.py --dev` で開いた pywebview ウィンドウを使ってください。

## マスターデータ更新

初回起動時は、サンプルのマスターデータで自動起動できます。  
通常起動時は、必要に応じて `schaledb.com` から最新データを確認し、古い場合は更新します。

GUI から更新:

- `最新データ更新`: 最新データ取得 + DB反映 + 未取得画像のダウンロード
- `画像ダウンロード`: 画像だけ再取得

手動更新:

```powershell
python scripts/fetch_master_data.py
python scripts/fetch_master_data.py --with-icons
```

## 保存先

- DB: `data/bond_manager.db`
- キャッシュ: `data/cache/`
- 画像: `data/images/`
- フロントのビルド成果物: `frontend/dist/`

## ディレクトリ構成

```text
main.py
requirements.txt
README.md
.gitignore
data/
frontend/
scripts/
src/
```

## 開発ショートカット

- `launch-dev.cmd` をダブルクリックすると、開発用の起動をまとめて実行できます。
- `frontend` の dev server が未起動なら自動で別ウィンドウで `npm run dev` を立ち上げ、その後に `python main.py --dev` を起動します。
- すでに `http://127.0.0.1:5173` が起動済みなら、そのまま再利用してアプリだけを開きます。
