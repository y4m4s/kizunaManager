import { useEffect } from 'react'

export type ToastKind = 'info' | 'saving' | 'success' | 'error'

type ToastProps = {
  duration?: number | null
  kind?: ToastKind
  message: string
  onClose: () => void
  open: boolean
}

const FADE_DURATION = 320

export function Toast({ duration = 2600, kind = 'info', message, onClose, open }: ToastProps) {
  const autoClose = duration !== null
  const effectiveDuration = duration ?? 0

  useEffect(() => {
    if (!open || !message || !autoClose) {
      return
    }

    const closeTimer = window.setTimeout(onClose, effectiveDuration + FADE_DURATION)

    return () => {
      window.clearTimeout(closeTimer)
    }
  }, [autoClose, effectiveDuration, message, onClose, open])

  if (!open || !message) {
    return null
  }

  const iconLabel =
    kind === 'saving'
      ? '保存中'
      : kind === 'success'
        ? '完了'
        : kind === 'error'
          ? 'エラー'
          : '通知'
  const iconText = kind === 'saving' ? '↻' : kind === 'success' ? '✓' : kind === 'error' ? '!' : 'i'

  return (
    <div aria-atomic="true" aria-live="polite" className="toast-viewport">
      <div
        key={message}
        className={[
          'toast-card',
          `toast-${kind}`,
          autoClose ? 'toast-card-auto' : 'toast-card-static',
        ].join(' ')}
        role="status"
        style={autoClose ? { animationDuration: `${effectiveDuration + FADE_DURATION}ms` } : undefined}
      >
        <span aria-label={iconLabel} className="toast-icon">
          {iconText}
        </span>
        <span>{message}</span>
      </div>
    </div>
  )
}
