'use client'

import { useEffect, useState } from 'react'
import { applyThemeChoice, storedThemeChoice, type ThemeChoice as Choice } from '@/lib/theme'

const CHOICES: ReadonlyArray<{ value: Choice; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export default function ThemeChoice() {
  const [choice, setChoice] = useState<Choice | null>(null)
  useEffect(() => setChoice(storedThemeChoice(window.localStorage)), [])

  return (
    <div role="group" aria-label="Theme" className="settings-segments">
      {CHOICES.map((c) => (
        <button
          key={c.value}
          type="button"
          aria-pressed={choice === c.value}
          onClick={() => {
            applyThemeChoice(c.value, document.documentElement, window.localStorage)
            setChoice(c.value)
          }}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}
