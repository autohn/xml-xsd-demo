import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-border bg-muted text-muted-foreground',
        primary: 'border-primary/50 bg-primary/15 text-primary',
        destructive: 'border-destructive/50 bg-destructive/15 text-destructive',
        success: 'border-success/50 bg-success/15 text-success',
        blue: 'border-gm-blue/50 bg-gm-blue/15 text-gm-blue',
        purple: 'border-gm-purple/50 bg-gm-purple/15 text-gm-purple',
        aqua: 'border-gm-aqua/50 bg-gm-aqua/15 text-gm-aqua',
        mono: 'border-border bg-gm-bg0 font-mono text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
