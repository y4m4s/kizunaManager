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
- マスター更新前の自動バックアップ: `data/backups/before-master-*.db`

マスターが空、不正、または既存件数の80%未満の場合は更新を中止します。更新データから一時的に消えた生徒・贈り物も、登録情報や在庫とともに保持します。バックアップは自動削除しません。

バックアップを使う場合はアプリを終了してから、対象のDBをデータ保存先の `bond_manager.db` としてコピーしてください。`bond_manager.recovered*.db` がある場合はそちらが優先されるため、復元先も確認してください。

## 保持している UI 用画像

固定UI画像は `frontend/public/ui/` に配置し、Webビルドと配布exeに同梱します。ユーザーのdataフォルダや画像ダウンロードは不要です。

- `frontend/public/ui/item_icon_favor_selection.webp`
- `frontend/public/ui/Cafe_Interaction_Gift_01.png`
- `frontend/public/ui/Cafe_Interaction_Gift_02.png`
- `frontend/public/ui/Cafe_Interaction_Gift_03.png`
- `frontend/public/ui/Cafe_Interaction_Gift_04.png`

## 分配と検証

分配は相性・代替品の有無・優先度を比較する逐次計算です。最優先と優先を先に処理し、準優先はその残りから配分します。同じグループでは代替性を優先して評価するため、最優先の全目標を先に満たす保証や、全体の厳密な最適解の保証はありません。端数調整で戻った在庫も再配分します。

```powershell
npm run test:backend
frontend/node_modules/.bin/tsc -p backend/tsconfig.json
npm run build
npm run lint
```

DB・HTTPテストはOSの一時フォルダに保存先を明示した検証DBを作成します。通常のdataフォルダは使いません。

APIはループバックのHostとOriginを検証します。本番は同一Originのみ、開発時は `http://127.0.0.1:5173` と `http://localhost:5173` も許可します。書き込みには `Content-Type: application/json` が必要です。

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
