import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-[20px] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-surface text-muted-foreground',
        /** ATS — ours. Never used for Fit. */
        ats: 'bg-primary-soft border border-primary-line text-primary tnum',
        ok: 'bg-ok-soft text-ok tnum',
        warn: 'bg-warn-soft text-warn',
        danger: 'bg-danger-soft text-danger',
        count: 'bg-surface text-muted-foreground tnum font-medium'
      }
    },
    defaultVariants: { tone: 'neutral' }
  }
)

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>): React.JSX.Element {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

/** The keyboard hint shown next to a tab or a search field. */
export function Kbd({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="tnum rounded-[5px] border border-border bg-card-muted px-1.5 text-[10.5px] text-faint">
      {children}
    </span>
  )
}
