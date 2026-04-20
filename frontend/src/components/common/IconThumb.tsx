import { useState } from 'react'
import { assetUrl } from '../../api'

type IconThumbProps = {
  filePath?: string | null
  label: string
  size?: number
  rounded?: 'soft' | 'circle'
  tone?: 'student' | 'gift'
}

function initials(label: string): string {
  return label.trim().slice(0, 2) || '?'
}

export function IconThumb({
  filePath,
  label,
  size = 40,
  rounded = 'soft',
  tone = 'student',
}: IconThumbProps) {
  const [failed, setFailed] = useState(false)
  const src = failed ? null : assetUrl(filePath)
  const className = [
    'icon-thumb',
    `icon-thumb-${rounded}`,
    `icon-thumb-${tone}`,
    'icon-thumb-fallback',
  ].join(' ')

  if (!src) {
    return (
      <div
        className={className}
        style={{ width: size, height: size }}
        aria-label={label}
      >
        <span>{initials(label)}</span>
      </div>
    )
  }

  return (
    <img
      alt={label}
      className={[
        'icon-thumb',
        `icon-thumb-${rounded}`,
        `icon-thumb-${tone}`,
        'icon-thumb-loaded',
      ].join(' ')}
      height={size}
      src={src}
      width={size}
      onError={() => setFailed(true)}
    />
  )
}
