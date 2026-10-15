import { useEffect, useState } from 'react'
import type React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from './lib/utils'
import { Button as UIButton } from './components/ui/button'
import { Input, Textarea, Label } from './components/ui/input'

/**
 * Form helpers shared by the resume and tailoring screens.
 *
 * These wrap the shadcn primitives rather than styling anything themselves, so
 * every control in the app comes from one place. The list fields keep raw text
 * in state while you type and only split on blur — otherwise commas and blank
 * lines vanish under your cursor.
 */

export function Button({
  children,
  variant = 'primary',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}): React.JSX.Element {
  return (
    <UIButton variant={variant} {...rest}>
      {children}
    </UIButton>
  )
}

function FieldShell({
  label,
  full,
  children
}: {
  label?: string
  full?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className={cn('flex flex-col gap-1.5', full && 'w-full')}>
      {label && <Label>{label}</Label>}
      {children}
    </label>
  )
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  full,
  onEnter
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  full?: boolean
  /** Called when the user presses Enter in the input. */
  onEnter?: () => void
}): React.JSX.Element {
  return (
    <FieldShell label={label} full={full}>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (onEnter && e.key === 'Enter') {
            e.preventDefault()
            onEnter()
          }
        }}
      />
    </FieldShell>
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
    <FieldShell label={label} full>
      <Textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
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
    <FieldShell label={label} full>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text.split(',').map((s) => s.trim()).filter(Boolean))}
      />
    </FieldShell>
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
    <FieldShell label={label} full>
      <Textarea
        rows={rows}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text.split('\n').map((l) => l.trim()).filter(Boolean))}
      />
    </FieldShell>
  )
}

export function Spinner({ text }: { text: string }): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {text}
    </span>
  )
}

/** Muted explanatory text, used throughout the resume and tailoring screens. */
export function Muted({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return (
    <p
      className={cn('text-[12.5px] leading-relaxed text-muted-foreground text-pretty', className)}
      {...props}
    />
  )
}
