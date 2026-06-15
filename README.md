# Blue Archive Kizuna Manager

Blue Archive の絆管理をローカルで使うための Web アプリです。
デスクトップアプリ (Windows / Electron) としても起動できます。

## 技術構成

- Frontend: React + TypeScript + Vite
- Backend: Node.js + TypeScript
- Database: SQLite
- Desktop: Electron (Windows)

## セットアップ

前提:

- Node.js 22 以上
- npm

依存関係のインストール:

```powershell
npm install
cd frontend
npm install
cd ..
```

ルートの `npm install` はデスクトップアプリ用 (Electron) の依存です。Web 版だけ使う場合は `frontend` 側のみで構いません。

## 開発起動

ルートでこれだけです。

```powershell
npm run dev
```

初回起動時に DB とキャッシュ JSON が無い場合は、Schale DB からマスターデータを自動取得します。

起動先:

- Backend API: `http://127.0.0.1:8787`
- Frontend: `http://127.0.0.1:5173`

## 本番相当の起動

```powershell
npm run build
npm run start
```

`npm run start` は `frontend/dist` を配信します。

## デスクトップアプリ (Windows)

Electron でラップしたデスクトップアプリとして起動できます。バックエンドは Electron 内蔵の Node.js で自動起動されるため、別途サーバーを立てる必要はありません。

開発起動 (フロントエンドをビルドしてからウィンドウ表示):

```powershell
npm run desktop
```

ビルド済みの `frontend/dist` をそのまま使う場合:

```powershell
npm run desktop:dev
```

配布用の実行ファイル (ポータブル exe) の作成:

```powershell
npm run desktop:dist
```

`release/Kizuna Manager <version>.exe` が生成されます。単体で配布・実行できます。

### デスクトップアプリのデータ保存場所

以下の優先順で決まります。

1. 環境変数 `KIZUNA_DATA_DIR` (明示指定)
2. パッケージ版 (exe): exe と同じフォルダにある `data` フォルダ
3. パッケージ版 (exe): `%APPDATA%\ba-kizuna-manager\data`
4. 開発起動 (`npm run desktop`): リポジトリの `data/` (Web 版と共通)

### 既存の SQLite データを使う

Web 版で使っていた既存の `data/` (DB・画像) をデスクトップアプリでそのまま使えます。

- 開発起動 (`npm run desktop`) の場合: リポジトリの `data/` をそのまま参照するので何もしなくてよいです。
- exe の場合: **exe をリポジトリ直下 (`data` フォルダの隣) に置く**だけで既存データを参照します。任意の場所に置きたい場合は、exe の隣に `data` フォルダをコピーするか、環境変数 `KIZUNA_DATA_DIR` でフォルダを指定してください。

DB に保存された画像パスが古い場所を指していても、起動時に現在のデータフォルダ基準で自動補正されます。

トラブルシューティング: 起動に失敗する場合は `%TEMP%\kizuna-desktop-debug.log` に起動ログが出力されます。

## 保存場所

- DB: `data/bond_manager.db`
- キャッシュ JSON: `data/cache/`
- 画像: `data/images/`

## 保持している UI 用画像

以下の 4 ファイルは `.gitignore` 例外として保持しています。
※Schale DBから落としたものとは別途用意したものであるため。

- `data/images/items/item_icon_favor_selection.webp`
- `data/images/items/Cafe_Interaction_Gift_02.png`
- `data/images/items/Cafe_Interaction_Gift_03.png`
- `data/images/items/Cafe_Interaction_Gift_04.png`

## ディレクトリ

```text
backend/
  src/
electron/
frontend/
  src/
data/
scripts/
```

## 補足

- 現在の正式な起動方法は `npm run dev` または `npm run build && npm run start` です。
