import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { PriorityKey } from '../../types'

type PriorityOption = { readonly value: PriorityKey; readonly label: string }

type PrioritySelectProps = {
  disabled?: boolean
  options: readonly PriorityOption[]
  studentName: string
  value: PriorityKey
  onChange: (priority: PriorityKey) => void
}

export function PrioritySelect({
  disabled = false,
  onChange,
  options,
  studentName,
  value,
}: PrioritySelectProps) {
  const [open, setOpen] = useState(false)
  const listboxId = useId()
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const selectedOption = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) {
      return
    }

    const selectedOptionButton = optionRefs.current[value]
    selectedOptionButton?.focus()

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open, value])

  function closeAndFocusButton() {
    setOpen(false)
    window.requestAnimationFrame(() => buttonRef.current?.focus())
  }

  function selectPriority(nextPriority: PriorityKey) {
    if (nextPriority !== value) {
      onChange(nextPriority)
    }
    closeAndFocusButton()
  }

  function focusOption(index: number) {
    const option = options[index]
    if (!option) {
      return
    }
    optionRefs.current[option.value]?.focus()
  }

  function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  function handleOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
    priority: PriorityKey,
  ) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusOption((index + 1) % options.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusOption((index - 1 + options.length) % options.length)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      focusOption(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      focusOption(options.length - 1)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectPriority(priority)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      closeAndFocusButton()
    }
  }

  return (
    <span
      ref={rootRef}
      className={`opt-priority-select-shell${open ? ' open' : ''}`}
      data-priority={value}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
    >
      <button
        ref={buttonRef}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${studentName} の優先度`}
        className="opt-priority-select"
        disabled={disabled}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleButtonKeyDown}
      >
        {selectedOption?.label}
      </button>

      {open ? (
        <span
          id={listboxId}
          aria-label={`${studentName} の優先度`}
          className="opt-priority-menu"
          role="listbox"
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => {
                optionRefs.current[option.value] = element
              }}
              aria-selected={option.value === value}
              className="opt-priority-option"
              data-priority={option.value}
              role="option"
              tabIndex={option.value === value ? 0 : -1}
              type="button"
              onClick={() => selectPriority(option.value)}
              onKeyDown={(event) => handleOptionKeyDown(event, index, option.value)}
            >
              <span className="opt-priority-option-dot" />
              <span>{option.label}</span>
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}
