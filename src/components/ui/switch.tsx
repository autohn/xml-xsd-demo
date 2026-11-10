import * as React from 'react'
import { Switch as SwitchPrimitive, Checkbox as CheckboxPrimitive } from 'radix-ui'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-input bg-gm-bg3 shadow-[inset_0_2px_0_0_var(--shadow-ink)] transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-foreground shadow-sm transition-transform data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-gm-bg0" />
    </SwitchPrimitive.Root>
  )
}

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-input bg-gm-bg0 shadow-[inset_0_2px_0_0_var(--shadow-ink)] transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-4" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Switch, Checkbox }
