import * as React from 'react'
import { cn } from '@/lib/utils'

const fieldBase =
  'w-full min-w-0 rounded-lg border-2 border-input bg-gm-bg0 px-3.5 text-sm text-foreground shadow-[inset_0_2px_0_0_var(--shadow-ink)] transition-colors placeholder:text-muted-foreground/70 hover:border-gm-grey focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/20'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(fieldBase, 'h-10', className)} {...props} />
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(fieldBase, 'min-h-20 py-2.5 font-mono text-[13px]', className)} {...props} />
}

export { Input, Textarea, fieldBase }
