import * as React from 'react'
import { cn } from '../../lib/utils'

/** A white card on the warm ground. 12px radius, hairline border, 1px lift. */
export function Panel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[12px] border border-border bg-card shadow-[0_1px_2px_rgba(28,26,23,0.04)]',
        className
      )}
      {...props}
    />
  )
}

export function PanelHeader({
  className,
  children,
  hint
}: {
  className?: string
  children: React.ReactNode
  hint?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-border bg-card-muted px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground',
        className
      )}
    >
      {children}
      {hint && (
        <span className="ml-1 text-[11px] font-normal normal-case tracking-normal text-faint">
          {hint}
        </span>
      )}
    </div>
  )
}

export function PanelBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn('flex flex-col gap-3.5 p-4', className)} {...props} />
}

/** The title block at the top of a full screen (Resume, Settings). */
export function ScreenHeader({
  title,
  sub,
  children
}: {
  title: string
  sub?: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-end gap-2.5">
      <div>
        <h2 className="m-0 text-[21px] font-semibold tracking-[-0.02em]">{title}</h2>
        {sub && <p className="mt-1 max-w-xl text-[12.5px] text-muted-foreground text-pretty">{sub}</p>}
      </div>
      <div className="flex-1" />
      {children}
    </div>
  )
}

/** The amber strip used for "session expired" and "resume out of sync". */
export function Notice({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-[10px] border border-warn-line bg-warn-soft px-3 py-2.5 text-[12.5px] text-warn',
        className
      )}
    >
      {children}
    </div>
  )
}

export function SectionLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        'text-[10px] font-semibold uppercase tracking-[0.07em] text-faint',
        className
      )}
      {...props}
    />
  )
}
