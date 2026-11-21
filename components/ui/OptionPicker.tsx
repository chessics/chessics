'use client'

import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import './option-picker.css'

export interface PickerOption<T extends string> {
  value: T
  label: string
  detail?: string
}

export default function OptionPicker<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
  emphasised = false,
}: {
  label: string
  value: T
  options: readonly PickerOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
  emphasised?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const id = useId()
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))
  const selected = options[selectedIndex]

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.focus({ preventScroll: true })
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function openAt(index: number) {
    if (disabled) return
    setActive(index)
    setOpen(true)
  }

  function close(focusButton = true) {
    setOpen(false)
    if (focusButton) buttonRef.current?.focus()
  }

  function pick(index: number) {
    const option = options[index]
    if (option && option.value !== value) onChange(option.value)
    close()
  }

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openAt(selectedIndex)
    }
  }

  function onListKey(e: KeyboardEvent<HTMLUListElement>) {
    const last = options.length - 1
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => Math.min(last, i + 1))
        return
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
        return
      case 'Home':
        e.preventDefault()
        setActive(0)
        return
      case 'End':
        e.preventDefault()
        setActive(last)
        return
      case 'Enter':
      case ' ':
        e.preventDefault()
        pick(active)
        return
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        close()
        return
      case 'Tab':
        close(false)
        return
    }
    if (e.key.length === 1 && /\S/.test(e.key)) {
      const letter = e.key.toLowerCase()
      const order = options.map((_, i) => (active + 1 + i) % options.length)
      const hit = order.find((i) => options[i].label.toLowerCase().startsWith(letter))
      if (hit !== undefined) setActive(hit)
    }
  }

  return (
    <div ref={rootRef} className={`option-picker${className ? ` ${className}` : ''}`} data-open={open || undefined} data-set={emphasised || undefined}>
      <button
        ref={buttonRef}
        type="button"
        className="option-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        disabled={disabled}
        onClick={() => (open ? close() : openAt(selectedIndex))}
        onKeyDown={onButtonKey}
      >
        <span className="option-picker-value">{selected?.label}</span>
        <ChevronDown size={14} aria-hidden className="option-picker-caret" />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          aria-activedescendant={`${id}-opt-${active}`}
          className="option-picker-list"
          onKeyDown={onListKey}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={o.value === value}
              data-index={i}
              data-active={i === active || undefined}
              className="option-picker-option"
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(i)}
            >
              <span className="option-picker-check" aria-hidden>
                {o.value === value && <Check size={13} />}
              </span>
              <span className="option-picker-label">{o.label}</span>
              {o.detail && <span className="option-picker-detail">{o.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
