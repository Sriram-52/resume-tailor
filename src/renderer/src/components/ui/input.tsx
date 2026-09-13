import * as React from 'react'
import { cn } from '../../lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-8 w-full rounded-[8px] border border-border bg-card px-2.5 text-[12.5px] text-foreground placeholder:text-faint focus-visible:border-primary-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-[8px] border border-border bg-card p-2.5 text-[12.5px] leading-relaxed text-foreground placeholder:text-faint focus-visible:border-primary-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
      className
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>): React.JSX.Element {
  return <label className={cn('text-[11.5px] font-semibold text-foreground', className)} {...props} />
}

export function Hint({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return (
    <p className={cn('text-[11px] leading-relaxed text-faint text-pretty', className)} {...props} />
  )
}
