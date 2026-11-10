import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Copy, Info, Lock, Plus, Trash2, X } from 'lucide-react'
import type { AnyInst, AttributeDef, ChoiceInst, ElementInst, Inst, Path, SeqInst, Slot, Particle } from '@/xsd/model'
import { choiceSelect, cloneInst, pathKey, setAttr, slotAdd, slotMove, slotRemove } from '@/xsd/instance'
import { typeLabel } from '@/xsd/datatypes'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/popover'
import { SimpleField, hintFor } from './SimpleField'
import { fieldDomId, fieldError, useForm, useStatus } from './store'
import { particleTitle, qname, shortTitle } from './labels'

const RAILS = ['border-l-gm-aqua', 'border-l-gm-blue', 'border-l-gm-purple', 'border-l-gm-orange', 'border-l-gm-green', 'border-l-gm-yellow']
const railOf = (depth: number) => RAILS[depth % RAILS.length]

type CtlMode = 'none' | 'remove' | 'list'
interface ItemCtl {
  ctlMode: CtlMode
  index: number
  len: number
  canRemove: boolean
  canAdd: boolean
}
const NO_CTL: ItemCtl = { ctlMode: 'none', index: 0, len: 1, canRemove: false, canAdd: false }

function DocTip({ doc }: { doc?: string }) {
  if (!doc) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" tabIndex={-1} className="inline-flex cursor-help text-muted-foreground/70 transition-colors hover:text-primary" aria-label="Описание из схемы">
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-md">{doc}</TooltipContent>
    </Tooltip>
  )
}

/* ───────────────────────────── item controls ───────────────────────────── */

function ItemControls({ slotPath, ctl }: { slotPath: Path; ctl: ItemCtl }) {
  const { update } = useForm()
  if (ctl.ctlMode === 'none') return null
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  if (ctl.ctlMode === 'remove') {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={(e) => { stop(e); update(slotPath, (s: Slot) => slotRemove(s, 0)) }} className="text-muted-foreground hover:text-destructive" title="Убрать необязательный элемент">
        <X /> Убрать
      </Button>
    )
  }
  const { index, len } = ctl
  return (
    <span className="flex items-center gap-0.5" onClick={stop}>
      <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} title="Выше" aria-label="Поднять выше" onClick={() => update(slotPath, (s: Slot) => slotMove(s, index, index - 1))}>
        <ChevronUp />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" disabled={index === len - 1} title="Ниже" aria-label="Опустить ниже" onClick={() => update(slotPath, (s: Slot) => slotMove(s, index, index + 1))}>
        <ChevronDown />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!ctl.canAdd}
        title="Дублировать"
        aria-label="Дублировать"
        onClick={() =>
          update(slotPath, (s: Slot): Slot => {
            if (s.items.length >= s.particle.max) return s
            const items = [...s.items]
            items.splice(index + 1, 0, cloneInst(s.items[index]))
            return { ...s, items }
          })
        }
      >
        <Copy />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" disabled={!ctl.canRemove} title="Удалить" aria-label="Удалить" className="hover:text-destructive" onClick={() => update(slotPath, (s: Slot) => slotRemove(s, index))}>
        <Trash2 />
      </Button>
    </span>
  )
}

/* ───────────────────────────── element ───────────────────────────── */

interface ElementViewProps extends ItemCtl {
  inst: ElementInst
  pk: string
  path: Path
  slotPath: Path
  depth: number
  required: boolean
}

const sameElementProps = (a: ElementViewProps, b: ElementViewProps) =>
  a.inst === b.inst && a.pk === b.pk && a.depth === b.depth && a.required === b.required && a.ctlMode === b.ctlMode && a.index === b.index && a.len === b.len && a.canRemove === b.canRemove && a.canAdd === b.canAdd

export const ElementView = memo(function ElementView(props: ElementViewProps) {
  const { inst, pk, path, depth, required } = props
  const { store, update, prefixes } = useForm()
  const type = inst.decl.type
  const isSimpleOnly = type.kind === 'simple' || (type.kind === 'complex' && type.contentKind === 'simple' && type.attributes.length === 0)
  const [open, setOpen] = useState(depth <= 2)
  const reveal = useStatus(store, (s) => s.reveal)
  const expand = useStatus(store, (s) => s.expand)
  const errCount = useStatus(store, (s) => (s.showAll ? (s.counts.get(pk) ?? 0) : 0))

  useEffect(() => {
    if (reveal && (pk === '' || reveal.key === pk || reveal.key.startsWith(pk + '/'))) setOpen(true)
  }, [reveal, pk])
  useEffect(() => {
    if (expand) setOpen(expand.mode === 'open')
  }, [expand])

  const title = shortTitle(inst.decl.doc, inst.decl.name)
  const showName = title !== inst.decl.name
  const nameChip = (
    <Badge variant="mono" className="font-mono">
      {'<'}
      {qname(inst.decl, prefixes)}
      {'>'}
    </Badge>
  )

  if (isSimpleOnly) {
    const textPath: Path = [...path, 'text']
    return (
      <div id={fieldDomId(pk)} className="group/field space-y-1.5 py-1" data-kind="field">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <label htmlFor={fieldDomId(pathKey(textPath))} className="text-sm font-medium">
            {title}
            {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
          </label>
          <DocTip doc={inst.decl.doc && inst.decl.doc.length > title.length ? inst.decl.doc : undefined} />
          {showName && nameChip}
          <TypeChip inst={inst} />
          <span className="ml-auto flex items-center gap-1">
            {inst.decl.nillable && <NilSwitch inst={inst} path={path} />}
            <ItemControls slotPath={props.slotPath} ctl={props} />
          </span>
        </div>
        {!showName && <div className="-mt-0.5">{nameChip}</div>}
        {!inst.nil && <ValueInput inst={inst} path={path} textPath={textPath} />}
        {inst.nil && <p className="text-xs text-muted-foreground">xsi:nil="true" — значение не передаётся</p>}
      </div>
    )
  }

  return (
    <section id={fieldDomId(pk)} className={cn('rounded-2xl border-2 border-l-[6px] bg-card shadow-[0_3px_0_0_var(--shadow-ink)]', railOf(depth))} data-kind="complex">
      <div className="flex items-center gap-2 p-2.5 pl-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-xl p-1 text-left transition-colors hover:bg-accent/60"
        >
          {open ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[15px] leading-snug font-semibold">
                {title}
                {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
              </span>
              {showName && nameChip}
              <TypeChip inst={inst} />
              {errCount > 0 && (
                <Badge variant="destructive">
                  {errCount} {plural(errCount, 'ошибка', 'ошибки', 'ошибок')}
                </Badge>
              )}
            </span>
          </span>
        </button>
        <DocTip doc={inst.decl.doc && inst.decl.doc.length > title.length ? inst.decl.doc : undefined} />
        {inst.decl.nillable && <NilSwitch inst={inst} path={path} />}
        <ItemControls slotPath={props.slotPath} ctl={props} />
      </div>
      {open && !inst.nil && (
        <div className="space-y-3 px-3 pb-3 pl-3">
          <ElementBody inst={inst} path={path} depth={depth} />
        </div>
      )}
      {open && inst.nil && <p className="px-5 pb-3 text-xs text-muted-foreground">xsi:nil="true" — содержимое не передаётся</p>}
    </section>
  )
}, sameElementProps)

function ElementBody({ inst, path, depth }: { inst: ElementInst; path: Path; depth: number }) {
  const type = inst.decl.type
  const textPath: Path = [...path, 'text']
  const contentPath: Path = [...path, 'content']
  return (
    <>
      {type.kind === 'complex' && type.attributes.length > 0 && (
        <div className="space-y-2.5 rounded-xl border-2 border-dashed border-border/80 p-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Атрибуты</p>
          {type.attributes.map((a) => (
            <AttrField key={a.key} inst={inst} attr={a} path={path} />
          ))}
        </div>
      )}
      {type.kind === 'complex' && type.contentKind === 'simple' && <ValueInput inst={inst} path={path} textPath={textPath} />}
      {type.kind === 'complex' && type.contentKind === 'elements' && type.mixed && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Текст (mixed content)</p>
          <MixedText inst={inst} textPath={textPath} />
        </div>
      )}
      {inst.content && <SlotView slot={inst.content} path={contentPath} pk={pathKey(contentPath)} depth={depth + 1} />}
      {type.kind === 'complex' && type.contentKind === 'empty' && type.attributes.length === 0 && <p className="text-xs text-muted-foreground">Пустой элемент — содержимого нет.</p>}
      {type.kind === 'complex' && type.anyAttribute && <p className="text-xs text-muted-foreground">Допускаются произвольные атрибуты (xs:anyAttribute) — в форме не редактируются.</p>}
    </>
  )
}

function TypeChip({ inst }: { inst: ElementInst }) {
  const t = inst.decl.type
  const label = t.kind === 'simple' ? (t.name ?? typeLabel(t)) : (t.name ?? 'тип')
  return (
    <Badge variant={t.kind === 'simple' ? 'blue' : 'purple'} title={t.kind === 'simple' ? typeLabel(t) : 'Сложный тип'}>
      {label}
    </Badge>
  )
}

function NilSwitch({ inst, path }: { inst: ElementInst; path: Path }) {
  const { update } = useForm()
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
      nil
      <Switch checked={inst.nil} onCheckedChange={(v) => update(path, (el: ElementInst) => ({ ...el, nil: v, text: v ? '' : el.text }))} aria-label="xsi:nil" />
    </label>
  )
}

function MixedText({ inst, textPath }: { inst: ElementInst; textPath: Path }) {
  const { update } = useForm()
  return <Textarea rows={2} value={inst.text} onChange={(e) => update(textPath, () => e.target.value)} />
}

function ValueInput({ inst, path, textPath }: { inst: ElementInst; path: Path; textPath: Path }) {
  const { store, update } = useForm()
  const type = inst.decl.type.kind === 'simple' ? inst.decl.type : inst.decl.type.simpleContent
  const key = pathKey(textPath)
  const error = useStatus(store, (s) => fieldError(s, key))
  const pathRef = useRef(textPath)
  pathRef.current = textPath
  const onChange = useCallback((v: string) => update(pathRef.current, () => v), [update])
  const onBlur = useCallback(() => store.touch(key), [store, key])
  if (!type) return null
  const fixed = inst.decl.fixed
  const hints = hintFor(type).hints
  return (
    <div className="space-y-1">
      <SimpleField id={fieldDomId(key)} type={type} value={inst.text} onChange={onChange} onBlur={onBlur} invalid={!!error} readOnly={fixed != null} name={inst.decl.name} />
      <FieldNote error={error} hints={hints} locked={fixed != null ? fixed : undefined} />
    </div>
  )
}

function FieldNote({ error, hints, locked }: { error?: string; hints?: string[]; locked?: string }) {
  return (
    <>
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      {!error && hints && hints.length > 0 && <p className="text-xs text-muted-foreground">{hints.join(' · ')}</p>}
      {locked != null && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="size-3" /> фиксированное значение схемы
        </p>
      )}
    </>
  )
}

function AttrField({ inst, attr, path }: { inst: ElementInst; attr: AttributeDef; path: Path }) {
  const { store, update, prefixes } = useForm()
  const attrPath: Path = [...path, 'attrs', attr.key]
  const key = pathKey(attrPath)
  const present = attr.key in inst.attrs
  const error = useStatus(store, (s) => fieldError(s, key))
  const required = attr.use === 'required'
  const fixed = attr.fixed != null
  const label = attr.ns && prefixes[attr.ns] ? `${prefixes[attr.ns]}:${attr.name}` : attr.name
  const onChange = useCallback((v: string) => update(path, (el: ElementInst) => setAttr(el, attr.key, v)), [update, path, attr.key])
  const hints = hintFor(attr.type).hints
  return (
    <div className="space-y-1" id={fieldDomId(key) + ':wrap'}>
      <div className="flex flex-wrap items-center gap-2">
        {!required && !fixed && (
          <Switch
            checked={present}
            onCheckedChange={(on) => update(path, (el: ElementInst) => setAttr(el, attr.key, on ? (attr.default ?? '') : undefined))}
            aria-label={`Включить атрибут ${label}`}
          />
        )}
        <label htmlFor={fieldDomId(key)} className="font-mono text-sm font-medium">
          @{label}
          {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
        </label>
        <Badge variant="blue">{attr.type.name ?? typeLabel(attr.type)}</Badge>
        <DocTip doc={attr.doc} />
        {!required && !fixed && <span className="text-xs text-muted-foreground">{present ? 'передаётся' : 'не передаётся'}</span>}
      </div>
      {attr.doc && <p className="text-xs text-muted-foreground">{shortTitle(attr.doc, '', 140)}</p>}
      {present && (
        <>
          <SimpleField id={fieldDomId(key)} type={attr.type} value={inst.attrs[attr.key] ?? ''} onChange={onChange} onBlur={() => store.touch(key)} invalid={!!error} readOnly={fixed} name={attr.name} />
          <FieldNote error={error} hints={hints} locked={fixed ? attr.fixed : undefined} />
        </>
      )}
    </div>
  )
}

/* ───────────────────────────── slots ───────────────────────────── */

interface SlotViewProps {
  slot: Slot
  path: Path
  pk: string
  depth: number
}

export const SlotView = memo(function SlotView({ slot, path, depth }: SlotViewProps) {
  const { update } = useForm()
  const p = slot.particle
  const title = particleTitle(p)
  const len = slot.items.length
  const canAdd = len < p.max
  const canRemove = len > p.min
  const add = () => update(path, (s: Slot) => slotAdd(s))

  const renderItem = (item: Inst, i: number, ctlMode: CtlMode) => {
    const itemPath: Path = [...path, 'items', i]
    const ipk = pathKey(itemPath)
    const ctl: ItemCtl = { ctlMode, index: i, len, canRemove, canAdd }
    return <ItemView key={item.id} item={item} path={itemPath} pk={ipk} slotPath={path} depth={depth} particle={p} ctl={ctl} />
  }

  if (p.max === 1) {
    if (len === 0) return <AddRow label={title} onAdd={add} />
    return <>{renderItem(slot.items[0], 0, p.min === 0 ? 'remove' : 'none')}</>
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-xs font-medium tracking-wide text-muted-foreground uppercase" title={title}>
          {p.kind === 'element' ? 'Список' : 'Повторяющаяся группа'}
        </span>
        <Badge variant="primary">
          {len}
          {p.max !== Infinity && ` / ${p.max}`}
        </Badge>
        {p.min > 0 && <Badge>минимум {p.min}</Badge>}
        <Button type="button" size="sm" variant="secondary" className="ml-auto" disabled={!canAdd} onClick={add}>
          <Plus /> Добавить
        </Button>
      </div>
      {len === 0 && <AddRow label={title} onAdd={add} />}
      {slot.items.map((item, i) => renderItem(item, i, 'list'))}
    </div>
  )
})

function AddRow({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-border px-3.5 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-foreground"
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-current transition-transform group-hover:rotate-90">
        <Plus className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate">Добавить: {label}</span>
        <span className="block text-xs opacity-70">необязательно</span>
      </span>
    </button>
  )
}

interface ItemViewProps {
  item: Inst
  path: Path
  pk: string
  slotPath: Path
  depth: number
  particle: Particle
  ctl: ItemCtl
}

const ItemView = memo(function ItemView({ item, path, pk, slotPath, depth, particle, ctl }: ItemViewProps) {
  switch (item.t) {
    case 'el':
      return <ElementView inst={item} pk={pk} path={path} slotPath={slotPath} depth={depth} required={particle.min >= 1} {...ctl} />
    case 'seq':
      return (
        <GroupFrame ctl={ctl} slotPath={slotPath} particle={particle}>
          <SeqView item={item} path={path} depth={depth} />
        </GroupFrame>
      )
    case 'choice':
      return (
        <GroupFrame ctl={ctl} slotPath={slotPath} particle={particle}>
          <ChoiceView item={item} path={path} depth={depth} particle={particle} />
        </GroupFrame>
      )
    case 'any':
      return (
        <GroupFrame ctl={ctl} slotPath={slotPath} particle={particle}>
          <AnyView item={item} path={path} pk={pk} />
        </GroupFrame>
      )
  }
})

function GroupFrame({ ctl, slotPath, particle, children }: { ctl: ItemCtl; slotPath: Path; particle: Particle; children: ReactNode }) {
  if (ctl.ctlMode === 'none') return <>{children}</>
  return (
    <div className="space-y-3 rounded-xl border-2 border-dashed border-border p-3">
      <div className="flex items-center gap-2">
        {ctl.ctlMode === 'list' && <Badge variant="mono">#{ctl.index + 1}</Badge>}
        <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">{particleTitle(particle)}</span>
        <span className="ml-auto">
          <ItemControls slotPath={slotPath} ctl={ctl} />
        </span>
      </div>
      {children}
    </div>
  )
}

function SeqView({ item, path, depth }: { item: SeqInst; path: Path; depth: number }) {
  return (
    <div className="space-y-3">
      {item.slots.map((s, j) => {
        const sp: Path = [...path, 'slots', j]
        return <SlotView key={j} slot={s} path={sp} pk={pathKey(sp)} depth={depth} />
      })}
    </div>
  )
}

function ChoiceView({ item, path, depth, particle }: { item: ChoiceInst; path: Path; depth: number; particle: Particle }) {
  const { update } = useForm()
  const branches = particle.kind === 'choice' ? particle.children : []
  const slotPath: Path = [...path, 'slot']
  const many = branches.length > 4
  const select = (i: number) => update(path, (c: ChoiceInst) => choiceSelect(c, i))
  return (
    <div className="space-y-3 rounded-xl border-2 border-border bg-muted/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="primary">Выбор 1 из {branches.length}</Badge>
        <span className="text-xs text-muted-foreground">xs:choice — допустим ровно один вариант</span>
      </div>
      {many ? (
        <Select value={String(item.selected)} onValueChange={(v) => select(Number(v))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b, i) => (
              <SelectItem key={i} value={String(i)}>
                <span className="block max-w-[28rem] whitespace-normal">{particleTitle(b)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div role="radiogroup" className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
          {branches.map((b, i) => {
            const on = i === item.selected
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => !on && select(i)}
                className={cn(
                  'retro-press min-w-0 cursor-pointer rounded-xl border-2 px-3.5 py-2 text-left text-sm leading-snug sm:max-w-[48%]',
                  on ? 'border-primary bg-primary/20 font-medium text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="line-clamp-3">{particleTitle(b)}</span>
              </button>
            )
          })}
        </div>
      )}
      <SlotView slot={item.slot} path={slotPath} pk={pathKey(slotPath)} depth={depth} />
    </div>
  )
}

function AnyView({ item, path, pk }: { item: AnyInst; path: Path; pk: string }) {
  const { store, update } = useForm()
  const xmlPath: Path = [...path, 'xml']
  const key = pathKey(xmlPath)
  const error = useStatus(store, (s) => fieldError(s, key))
  return (
    <div className="space-y-1.5" id={fieldDomId(pk)}>
      <p className="text-sm font-medium">
        Произвольный XML <Badge variant="mono">xs:any</Badge>
      </p>
      <Textarea
        id={fieldDomId(key)}
        rows={3}
        spellCheck={false}
        placeholder="<element>…</element>"
        value={item.xml}
        aria-invalid={!!error || undefined}
        onChange={(e) => update(xmlPath, () => e.target.value)}
        onBlur={() => store.touch(key)}
      />
      <FieldNote error={error} hints={['вставьте корректный XML-фрагмент (один или несколько элементов)']} />
    </div>
  )
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
export { plural }
