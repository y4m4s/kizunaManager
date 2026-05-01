export type SaveStatus = 'idle' | 'saving' | 'success'

type SaveIndicatorProps = {
  status: SaveStatus
  onFadeOut: () => void
}

export function SaveIndicator({ status, onFadeOut }: SaveIndicatorProps) {
  if (status === 'idle') return null

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={`save-indicator save-indicator-${status}`}
      onAnimationEnd={status === 'success' ? onFadeOut : undefined}
    >
      <span
        aria-label={status === 'saving' ? '保存中' : '保存完了'}
        className="save-indicator-icon"
      >
        {status === 'saving' ? '↻' : '✓'}
      </span>
    </div>
  )
}
