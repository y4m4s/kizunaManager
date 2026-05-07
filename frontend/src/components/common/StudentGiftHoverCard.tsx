import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../api'
import { SEARCH_EFFECT_COLUMNS } from '../../constants'
import { effectIconUrl } from '../../lib/uiAssets'
import type { SearchResult, SlimItem } from '../../types'
import { IconThumb } from './IconThumb'

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

type GiftLoadState = {
  key: string
  result: SearchResult | null
  status: LoadStatus
}

type FloatingPlacement = 'top' | 'bottom'

type FloatingPosition = {
  arrowLeft: number
  left: number
  placement: FloatingPlacement
  ready: boolean
  top: number
}

type StudentGiftHoverCardProps = {
  iconPath?: string | null
  iconSize?: number
  refreshKey?: number | string
  studentId: number
  studentName: string
}

const VIEWPORT_MARGIN = 12
const CARD_OFFSET = 12
const ARROW_WIDTH = 10

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function countItems(result: SearchResult | null): number {
  if (!result) {
    return 0
  }
  return SEARCH_EFFECT_COLUMNS.reduce(
    (total, column) => total + result.effects[column.key].length,
    0,
  )
}

function GiftTile({ item }: { item: SlimItem }) {
  const toneClass = item.rarity === 'SSR' ? 'rarity-ssr' : 'rarity-sr'
  const quantityLabel = item.quantity > 0 ? ` x${item.quantity}` : ''

  return (
    <div
      className={`student-gift-card-item ${toneClass}`}
      title={`${item.name} / ${item.effect_label}${quantityLabel}`}
    >
      <IconThumb filePath={item.icon_path} label={item.name} size={34} tone="gift" />
      {item.quantity > 0 ? (
        <span className="student-gift-card-qty">{`x${item.quantity}`}</span>
      ) : null}
    </div>
  )
}

export function StudentGiftHoverCard({
  iconPath,
  iconSize = 38,
  refreshKey,
  studentId,
  studentName,
}: StudentGiftHoverCardProps) {
  const cardId = useId()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const requestIdRef = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const dataKey = `${studentId}:${String(refreshKey ?? '')}`
  const [open, setOpen] = useState(false)
  const [cardPosition, setCardPosition] = useState<FloatingPosition>({
    arrowLeft: 18,
    left: 0,
    placement: 'bottom',
    ready: false,
    top: 0,
  })
  const [loadState, setLoadState] = useState<GiftLoadState>(() => ({
    key: dataKey,
    result: null,
    status: 'idle',
  }))
  const result = loadState.key === dataKey ? loadState.result : null
  const status = loadState.key === dataKey ? loadState.status : 'idle'
  const totalItems = countItems(result)

  const updatePosition = useCallback(() => {
    const card = cardRef.current
    const root = rootRef.current
    if (!card || !root) {
      return
    }

    const rootRect = root.getBoundingClientRect()
    const cardRect = card.getBoundingClientRect()
    const anchor = pointerRef.current ?? {
      x: rootRect.left + Math.min(28, rootRect.width / 2),
      y: rootRect.top + (rootRect.height / 2),
    }
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - anchor.y - VIEWPORT_MARGIN
    const spaceAbove = anchor.y - VIEWPORT_MARGIN
    const placement: FloatingPlacement =
      spaceBelow >= cardRect.height || spaceBelow >= spaceAbove ? 'bottom' : 'top'
    const desiredTop =
      placement === 'bottom'
        ? anchor.y + CARD_OFFSET
        : anchor.y - cardRect.height - CARD_OFFSET
    const maxTop = viewportHeight - cardRect.height - VIEWPORT_MARGIN
    const top = clamp(desiredTop, VIEWPORT_MARGIN, maxTop)
    const desiredLeft = anchor.x - 24
    const maxLeft = viewportWidth - cardRect.width - VIEWPORT_MARGIN
    const left = clamp(desiredLeft, VIEWPORT_MARGIN, maxLeft)
    const arrowLeft = clamp(
      anchor.x - left - (ARROW_WIDTH / 2),
      14,
      cardRect.width - 24,
    )

    setCardPosition((current) => {
      const next = {
        arrowLeft,
        left,
        placement,
        ready: true,
        top,
      }
      return current.arrowLeft === next.arrowLeft &&
        current.left === next.left &&
        current.placement === next.placement &&
        current.ready === next.ready &&
        current.top === next.top
        ? current
        : next
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      return
    }

    updatePosition()

    function handleViewportChange() {
      updatePosition()
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open, status, totalItems, updatePosition])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  function scheduleClose() {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false)
      closeTimerRef.current = null
    }, 90)
  }

  function ensureLoaded() {
    if (status === 'loading' || status === 'loaded') {
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoadState({
      key: dataKey,
      result: null,
      status: 'loading',
    })

    void api.run_student_search([studentId])
      .then((rows) => {
        if (requestIdRef.current !== requestId) {
          return
        }
        setLoadState({
          key: dataKey,
          result: rows.find((row) => row.student_id === studentId) ?? null,
          status: 'loaded',
        })
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) {
          return
        }
        setLoadState({
          key: dataKey,
          result: null,
          status: 'error',
        })
      })
  }

  function showCard(event?: PointerEvent<HTMLDivElement>) {
    if (event) {
      pointerRef.current = { x: event.clientX, y: event.clientY }
    } else if (!open) {
      pointerRef.current = null
    }
    clearCloseTimer()
    if (!open) {
      setCardPosition((current) => ({ ...current, ready: false }))
    }
    setOpen(true)
    ensureLoaded()
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    pointerRef.current = { x: event.clientX, y: event.clientY }
    if (open) {
      updatePosition()
    }
  }

  const groups = SEARCH_EFFECT_COLUMNS.map((column) => ({
    ...column,
    items: result?.effects[column.key] ?? [],
  })).filter((group) => group.items.length > 0)
  const cardStyle = {
    '--student-gift-card-arrow-left': `${cardPosition.arrowLeft}px`,
    left: `${cardPosition.left}px`,
    top: `${cardPosition.top}px`,
  } as CSSProperties
  const card = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          id={cardId}
          ref={cardRef}
          className={`student-gift-hover-card${cardPosition.ready ? ' ready' : ''}`}
          data-placement={cardPosition.placement}
          role="tooltip"
          style={cardStyle}
          onPointerEnter={clearCloseTimer}
          onPointerLeave={scheduleClose}
        >
          <div className="student-gift-card-head">
            <strong>有効な贈り物</strong>
            {status === 'loaded' ? <span>{`${totalItems}種`}</span> : null}
          </div>

          {status === 'loading' ? (
            <div className="student-gift-card-state">読み込み中...</div>
          ) : null}

          {status === 'error' ? (
            <div className="student-gift-card-state">取得できませんでした</div>
          ) : null}

          {status === 'loaded' && groups.length ? (
            <div className="student-gift-card-groups">
              {groups.map((group) => {
                const iconSrc = effectIconUrl(group.key)
                return (
                  <div key={group.key} className="student-gift-card-group">
                    <div className="student-gift-card-group-title">
                      {iconSrc ? (
                        <img
                          alt=""
                          className="student-gift-card-effect-icon"
                          height={18}
                          src={iconSrc}
                          width={18}
                        />
                      ) : null}
                      <strong>{group.label}</strong>
                      <span>{`${group.items.length}種`}</span>
                    </div>
                    <div className="student-gift-card-grid">
                      {group.items.map((item) => (
                        <GiftTile key={`${item.id}:${item.effect}`} item={item} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          {status === 'loaded' && !groups.length ? (
            <div className="student-gift-card-state">該当する贈り物はありません</div>
          ) : null}
        </div>,
        document.body,
      )
    : null

  return (
    <div
      ref={rootRef}
      aria-describedby={open ? cardId : undefined}
      className="student-gift-hover"
      tabIndex={0}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
      onFocus={() => showCard()}
      onPointerEnter={showCard}
      onPointerLeave={scheduleClose}
      onPointerMove={handlePointerMove}
    >
      <div className="student-gift-hover-trigger">
        <IconThumb filePath={iconPath} label={studentName} size={iconSize} tone="student" />
        <strong className="student-gift-hover-name">{studentName}</strong>
      </div>
      {card}
    </div>
  )
}
