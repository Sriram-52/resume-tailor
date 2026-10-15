import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

/**
 * Geometry is inherited from the first version of the app: 8px radius, 32px
 * default height, 12.5px semibold label.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-[12.5px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        ghost: 'bg-card border border-border text-foreground hover:border-border-strong',
        subtle: 'bg-primary-soft border border-primary-line text-primary hover:bg-primary-soft/70',
        quiet: 'text-muted-foreground hover:bg-surface hover:text-foreground',
        danger: 'text-danger border border-transparent hover:border-danger',
        /** On the dark score panel and the bulk bar. */
        ink: 'text-ink-muted hover:bg-ink-2 hover:text-white'
      },
      size: {
        default: 'h-8 px-3.5',
        sm: 'h-7 px-2.5 text-[12px]',
        icon: 'h-8 w-8 p-0'
      }
    },
    defaultVariants: { variant: 'primary', size: 'default' }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
  }
)
Button.displayName = 'Button'

/** A bordered square button holding one icon — the card's like/ignore controls. */
export const IconButton = React.forwardRef<HTMLButtonElement, ButtonProps & { active?: boolean }>(
  ({ className, active, ...props }, ref) => (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn(
        'text-muted-foreground hover:text-foreground',
        active && 'border-primary-line bg-primary-soft text-primary',
        className
      )}
      {...props}
    />
  )
)
IconButton.displayName = 'IconButton'
