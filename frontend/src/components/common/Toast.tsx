import { useEffect } from 'react'

type ToastProps = {
  duration?: number
  message: string
  onClose: () => void
  open: boolean
}

const FADE_DURATION = 320

export function Toast({ duration = 2600, message, onClose, open }: ToastProps) {
  useEffect(() => {
    if (!open || !message) {
      return
    }

    const closeTimer = window.setTimeout(onClose, duration + FADE_DURATION)

    return () => {
      window.clearTimeout(closeTimer)
    }
  }, [duration, message, onClose, open])

  if (!open || !message) {
    return null
  }

  return (
    <div aria-atomic="true" aria-live="polite" className="toast-viewport">
      <div
        key={message}
        className="toast-card"
        role="status"
        style={{ animationDuration: `${duration + FADE_DURATION}ms` }}
      >
        {message}
      </div>
    </div>
  )
}
