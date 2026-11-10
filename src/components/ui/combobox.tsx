import * as React from 'react'
import { Command } from 'cmdk'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { fieldBase } from './input'
import { cn } from '@/lib/utils'

export interface ComboOption {
  value: string
  label: string
  hint?: string
  group?: string
}

/** Searchable select (shadcn "Combobox" pattern: Popover + cmdk). */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Выберите…',
  searchPlaceholder = 'Поиск…',
  empty = 'Ничего не найдено',
  className,
  id,
}: {
  options: ComboOption[]
  value: string | undefined
  onChange: (v: string) => void
  placeholder?: string
  searchPlaceholder?: string
  empty?: string
  className?: string
  id?: string
}) {
  const [open, setOpen] = React.useState(false)
  const current = options.find((o) => o.value === value)
  const groups = React.useMemo(() => {
    const map = new Map<string, ComboOption[]>()
    for (const o of options) {
      const g = o.group ?? ''
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(o)
    }
    return [...map.entries()]
  }, [options])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(fieldBase, 'flex h-10 cursor-pointer items-center justify-between gap-2 text-left', className)}
        >
          <span className={cn('truncate', !current && 'text-muted-foreground/70')}>{current?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(30rem,calc(100vw-2rem))] p-0" align="start">
        <Command
          className="flex flex-col"
          filter={(val, search, keywords) => {
            const hay = `${val} ${keywords?.join(' ') ?? ''}`.toLowerCase()
            return hay.includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <div className="flex items-center gap-2 border-b-2 border-border px-3">
            <Search className="size-4 shrink-0 opacity-60" />
            <Command.Input
              placeholder={searchPlaceholder}
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
          </div>
          <Command.List className="max-h-72 overflow-auto p-1.5">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">{empty}</Command.Empty>
            {groups.map(([g, items]) => (
              <Command.Group key={g} heading={g || undefined} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
                {items.map((o) => (
                  <Command.Item
                    key={o.value}
                    value={o.value}
                    keywords={[o.label, o.hint ?? '']}
                    onSelect={() => {
                      onChange(o.value)
                      setOpen(false)
                    }}
                    className="flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2 text-sm data-[selected=true]:bg-accent"
                  >
                    <Check className={cn('mt-0.5 size-4 shrink-0 text-primary', o.value === value ? 'opacity-100' : 'opacity-0')} />
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[13px]">{o.label}</span>
                      {o.hint && <span className="line-clamp-2 block text-xs text-muted-foreground">{o.hint}</span>}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
