import { useEffect, useState } from 'react'
import type React from 'react'

export function Button({
  children,
  variant = 'primary',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}): React.JSX.Element {
  return (
    <button className={`btn btn-${variant}`} {...rest}>
      {children}
    </button>
  )
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  full
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  full?: boolean
}): React.JSX.Element {
  return (
    <label className={`field ${full ? 'field-full' : ''}`}>
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export function Area({
  label,
  value,
  onChange,
  placeholder,
  rows = 4
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}): React.JSX.Element {
  return (
    <label className="field field-full">
      {label && <span>{label}</span>}
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

/**
 * Comma-separated list field. Holds the raw text while you type (so you can
 * actually type commas and spaces) and only splits into an array on blur.
 */
export function CsvField({
  label,
  value,
  onChange
}: {
  label: string
  value: string[]
  onChange: (v: string[]) => void
}): React.JSX.Element {
  const [text, setText] = useState(value.join(', '))
  useEffect(() => setText(value.join(', ')), [value])
  return (
    <label className="field field-full">
      <span>{label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          onChange(
            text
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          )
        }
      />
    </label>
  )
}

/**
 * Multi-line list field, one item per line. Holds raw text while editing and
 * splits on blur, so newlines and spacing survive as you type.
 */
export function LinesArea({
  label,
  value,
  onChange,
  rows = 4
}: {
  label: string
  value: string[]
  onChange: (v: string[]) => void
  rows?: number
}): React.JSX.Element {
  const [text, setText] = useState(value.join('\n'))
  useEffect(() => setText(value.join('\n')), [value])
  return (
    <label className="field field-full">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          onChange(
            text
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean)
          )
        }
      />
    </label>
  )
}

export function Spinner({ text }: { text: string }): React.JSX.Element {
  return (
    <span className="spinner">
      <span className="dot" /> {text}
    </span>
  )
}
