import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '../../lib/utils'

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full border-0 p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 data-[state=checked]:bg-primary data-[state=unchecked]:bg-border-strong',
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-3 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
))
Switch.displayName = 'Switch'

/** A switch with its label and explanation, as used throughout Settings. */
export function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange
}: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-2.5">
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
      <div>
        <div className="text-[12.5px] font-medium">{label}</div>
        {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-faint text-pretty">{hint}</p>}
      </div>
    </div>
  )
}
