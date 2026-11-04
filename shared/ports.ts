// 起動スクリプト・バックエンド・フロントエンドで共通の既定ポート。
export const DEFAULT_BACKEND_PORT = 43187
export const DEFAULT_FRONTEND_PORT = 43188

// 開発起動ではAPI接続先とOriginを固定するため、動的ポートを意味する0は使わない。
export function parseDevPort(value: string | number | undefined, fallback: number, label: string): number {
  const port = value === undefined || value === '' ? fallback : Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label}のポートは 1〜65535 の整数で指定してください (0 は開発起動では使用できません)。`)
  }
  return port
}
