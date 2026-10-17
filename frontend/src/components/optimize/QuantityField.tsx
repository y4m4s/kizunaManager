import { useRef } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { isQuantityExpression, parseQuantityList, resolveQuantityInput } from '../../lib/quantityInput'

type QuantityFieldProps = {
  ariaLabel: string
  value: string
  savedQuantity: number
  onChange: (value: string) => void
  onCommit: () => void
  onRevert: () => void
  onPasteList?: (values: number[]) => void
}

type Direction = 'next' | 'prev' | 'up' | 'down'

// 同じグリッド内の所持数入力へフォーカスを移す。
// next / prev は並び順、up / down は画面上で真上・真下にあるタイル。
function focusSibling(input: HTMLInputElement, direction: Direction): boolean {
  const grid = input.closest('[data-quantity-grid]')
  if (!grid) {
    return false
  }
  const fields = [...grid.querySelectorAll<HTMLInputElement>('input[data-quantity-field]')]
  const index = fields.indexOf(input)
  let target: HTMLInputElement | undefined

  if (direction === 'next' || direction === 'prev') {
    target = fields[index + (direction === 'next' ? 1 : -1)]
  } else {
    const origin = input.getBoundingClientRect()
    const originX = origin.left + origin.width / 2
    let bestKey: [number, number] | null = null
    for (const field of fields) {
      if (field === input) {
        continue
      }
      const rect = field.getBoundingClientRect()
      const dy = direction === 'down' ? rect.top - origin.bottom : origin.top - rect.bottom
      if (dy < 0) {
        continue
      }
      // 近い行を優先し、同じ行の中では横位置が近いものを選ぶ (幅2のタイルにも対応)
      const dx = Math.abs(rect.left + rect.width / 2 - originX)
      const key: [number, number] = [Math.round(dy), dx]
      if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
        bestKey = key
        target = field
      }
    }
  }

  if (!target) {
    return false
  }
  target.focus()
  return true
}

export function QuantityField({
  ariaLabel,
  value,
  savedQuantity,
  onChange,
  onCommit,
  onRevert,
  onPasteList,
}: QuantityFieldProps) {
  const justFocusedRef = useRef(false)
  const resolved = resolveQuantityInput(value, savedQuantity)
  const showPreview = isQuantityExpression(value)

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) {
      return
    }
    const input = event.currentTarget
    if (event.key === 'Enter') {
      event.preventDefault()
      // フォーカスが移ると blur で保存される。移動先が無いときはその場で確定する。
      if (!focusSibling(input, event.shiftKey ? 'prev' : 'next')) {
        input.blur()
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusSibling(input, event.key === 'ArrowDown' ? 'down' : 'up')
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onRevert()
      input.blur()
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    if (!onPasteList) {
      return
    }
    const values = parseQuantityList(event.clipboardData.getData('text'))
    if (values) {
      event.preventDefault()
      onPasteList(values)
    }
  }

  return (
    <div className="quantity-field">
      <input
        aria-invalid={resolved === null}
        aria-label={ariaLabel}
        autoComplete="off"
        className={`text-input compact inventory-tile-input${resolved === null ? ' is-invalid' : ''}`}
        data-quantity-field=""
        inputMode="numeric"
        type="text"
        value={value}
        onBlur={onCommit}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          // 全選択しておけば、そのまま打てば置き換え、「+3」と打てば今の数に加算になる
          event.currentTarget.select()
        }}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => {
          justFocusedRef.current = document.activeElement !== event.currentTarget
        }}
        onMouseUp={(event) => {
          // クリックでフォーカスしたとき、mouseup で全選択が解除されないようにする
          if (justFocusedRef.current) {
            event.preventDefault()
            justFocusedRef.current = false
          }
        }}
        onPaste={handlePaste}
      />
      {showPreview ? (
        <span className={`quantity-field-preview${resolved === null ? ' is-invalid' : ''}`}>
          {resolved === null ? '?' : `→ ${resolved}`}
        </span>
      ) : null}
    </div>
  )
}
