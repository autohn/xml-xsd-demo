import { memo, useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import type { SimpleTypeDef } from '@/xsd/model'
import { fromInputValue, inputHintFor, sampleValue, toInputValue } from '@/xsd/datatypes'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  type: SimpleTypeDef
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  invalid?: boolean
  readOnly?: boolean
  name?: string
}

const hintCache = new WeakMap<SimpleTypeDef, ReturnType<typeof inputHintFor>>()
export function hintFor(t: SimpleTypeDef) {
  let h = hintCache.get(t)
  if (!h) {
    h = inputHintFor(t)
    hintCache.set(t, h)
  }
  return h
}

/** One input control chosen from the XSD simple type (enumeration → select, date → date picker, …). */
export const SimpleField = memo(function SimpleField({ id, type, value, onChange, onBlur, invalid, readOnly, name }: Props) {
  const hint = useMemo(() => hintFor(type), [type])
  const common = { id, 'aria-invalid': invalid || undefined, onBlur, disabled: readOnly }

  switch (hint.kind) {
    case 'select': {
      const opts = hint.options ?? []
      return (
        <Select value={value === '' ? undefined : value} onValueChange={onChange} disabled={readOnly}>
          <SelectTrigger id={id} aria-invalid={invalid || undefined} onBlur={onBlur}>
            <SelectValue placeholder="Выберите значение…" />
          </SelectTrigger>
          <SelectContent>
            {opts.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <span className="block max-w-[28rem] whitespace-normal">{o.label && o.label !== o.value ? o.label : o.value}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    case 'boolean':
      return (
        <Select value={value === '' ? undefined : value} onValueChange={onChange} disabled={readOnly}>
          <SelectTrigger id={id} aria-invalid={invalid || undefined} onBlur={onBlur}>
            <SelectValue placeholder="Да / Нет" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Да (true)</SelectItem>
            <SelectItem value="false">Нет (false)</SelectItem>
            {value === '1' && <SelectItem value="1">Да (1)</SelectItem>}
            {value === '0' && <SelectItem value="0">Нет (0)</SelectItem>}
          </SelectContent>
        </Select>
      )
    case 'date':
    case 'datetime':
    case 'time':
    case 'month': {
      const htmlType = hint.kind === 'datetime' ? 'datetime-local' : hint.kind
      return (
        <Input
          {...common}
          type={htmlType}
          step={hint.kind === 'datetime' || hint.kind === 'time' ? '1' : undefined}
          min={hint.min}
          max={hint.max}
          value={toInputValue(type, value)}
          onChange={(e) => onChange(fromInputValue(type, e.target.value))}
          className="font-mono"
        />
      )
    }
    case 'textarea':
    case 'binary':
      return (
        <div className="relative">
          <Textarea {...common} rows={hint.kind === 'binary' ? 3 : 4} value={value} onChange={(e) => onChange(e.target.value)} placeholder={hint.placeholder} className="pr-11" />
          <Sample type={type} name={name} onChange={onChange} disabled={readOnly} className="absolute top-2 right-2" />
        </div>
      )
    default:
      return (
        <div className="relative">
          <Input
            {...common}
            type="text"
            inputMode={hint.inputMode}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={hint.placeholder}
            autoComplete="off"
            spellCheck={false}
            className={cn('pr-11', (hint.kind === 'integer' || hint.kind === 'decimal') && 'font-mono')}
          />
          <Sample type={type} name={name} onChange={onChange} disabled={readOnly} className="absolute top-1/2 right-1.5 -translate-y-1/2" />
        </div>
      )
  }
})

function Sample({ type, name, onChange, disabled, className }: { type: SimpleTypeDef; name?: string; onChange: (v: string) => void; disabled?: boolean; className?: string }) {
  if (disabled) return null
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      tabIndex={-1}
      title="Подставить пример значения"
      aria-label="Подставить пример значения"
      className={cn('text-muted-foreground hover:text-primary', className)}
      onClick={() => onChange(sampleValue(type, { name, seed: Math.floor(Math.random() * 1e9) }))}
    >
      <Sparkles />
    </Button>
  )
}
