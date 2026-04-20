# Blue Archive Kizuna Manager

Blue Archive の絆管理をローカルで使うための Web アプリです。

## 技術構成

- Frontend: React + TypeScript + Vite
- Backend: Node.js + TypeScript
- Database: SQLite

## セットアップ

前提:

- Node.js 22 以上
- npm

依存関係のインストール:

```powershell
cd frontend
npm install
cd ..
```

## 開発起動

ルートでこれだけです。

```powershell
npm run dev
```

起動先:

- Backend API: `http://127.0.0.1:8787`
- Frontend: `http://127.0.0.1:5173`

## 本番相当の起動

```powershell
npm run build
npm run start
```

`npm run start` は `frontend/dist` を配信します。

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
frontend/
  src/
data/
scripts/
```

## 補足

- 現在の正式な起動方法は `npm run dev` または `npm run build && npm run start` です。
