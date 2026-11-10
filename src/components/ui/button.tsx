import * as React from 'react'
import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "retro-press inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border-2 text-sm font-medium whitespace-nowrap cursor-pointer disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground hover:brightness-105',
        secondary: 'border-border bg-secondary text-secondary-foreground hover:bg-gm-bg4',
        outline: 'border-border bg-card text-foreground hover:bg-accent',
        ghost: 'border-transparent bg-transparent shadow-none hover:bg-accent hover:shadow-none hover:translate-y-0',
        destructive: 'border-destructive bg-destructive text-primary-foreground hover:brightness-105',
        success: 'border-success bg-success text-primary-foreground hover:brightness-105',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-8 gap-1.5 px-3.5 text-xs',
        lg: 'h-12 px-7 text-base',
        icon: 'size-9',
        'icon-sm': 'size-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
