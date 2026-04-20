import { SHELL_HEADING, SHELL_SUBTITLE } from '../../constants'

type TopBarProps = {
  busy: boolean
  onDownloadIcons: () => void
  onUpdateMaster: () => void
}

export function TopBar({
  busy,
  onDownloadIcons,
  onUpdateMaster,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div>
        <h2 className="topbar-title">{SHELL_HEADING}</h2>
        <p className="topbar-sub">{SHELL_SUBTITLE}</p>
      </div>

      <div className="topbar-actions">
        <button
          className="btn btn-primary"
          disabled={busy}
          type="button"
          onClick={onUpdateMaster}
        >
          最新データ更新
        </button>
        <button
          className="btn"
          disabled={busy}
          type="button"
          onClick={onDownloadIcons}
        >
          画像ダウンロード
        </button>
      </div>
    </header>
  )
}
