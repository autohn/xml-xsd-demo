import type { ChoiceInst, ElementDecl, ElementInst, Inst, Particle, Path, Slot } from './model'

let counter = 0
export const newId = (): string => 'n' + ++counter
export const pathKey = (path: Path): string => path.join('/')
export function getIn(root: ElementInst, path: Path): unknown {
  return path.reduce<unknown>((v, k) => v == null ? undefined : (v as Record<string | number, unknown>)[k], root)
}
export function setIn<T>(root: T, path: Path, value: unknown): T {
  if (!path.length) return value as T
  const [key, ...rest] = path
  const source = root as Record<string | number, unknown>
  const copy = (Array.isArray(root) ? [...root] : { ...source }) as Record<string | number, unknown>
  copy[key] = setIn(source[key], rest, value)
  if (source?.t === 'choice') {
    const parent = choiceParents.get(root as ChoiceInst)
    if (parent) registerChoice(copy as unknown as ChoiceInst, parent)
  }
  return copy as T
}
export function updateIn<T>(root: T, path: Path, fn: (old: any) => any): T {
  let value: unknown = root
  for (const key of path) value = value == null ? undefined : (value as Record<string | number, unknown>)[key]
  return setIn(root, path, fn(value))
}
function terminates(p: Particle, seen: Set<object>): boolean {
  if (p.min === 0) return true
  if (seen.has(p)) return false
  const next = new Set(seen); next.add(p)
  if (p.kind === 'any') return true
  if (p.kind === 'element') {
    const t = p.decl.type
    return t.kind === 'simple' || !t.particle || terminates(t.particle, next)
  }
  return p.kind === 'choice' ? p.children.some(c => terminates(c, next)) : p.children.every(c => terminates(c, next))
}
type Group = Extract<Particle, { children: Particle[] }>
const choiceParents = new WeakMap<ChoiceInst, Group>()
export function registerChoice(choice: ChoiceInst, parent: Group): ChoiceInst { choiceParents.set(choice, parent); return choice }
function element(decl: ElementDecl, seen: Set<object>): ElementInst {
  const t = decl.type
  const attrs: Record<string, string> = {}
  if (t.kind === 'complex') for (const a of t.attributes) {
    if (a.use !== 'prohibited' && (a.use === 'required' || a.fixed !== undefined || a.default !== undefined)) attrs[a.key] = a.fixed ?? a.default ?? ''
  }
  return { t: 'el', id: newId(), decl, text: decl.fixed ?? decl.default ?? '', nil: false, attrs,
    content: t.kind === 'complex' && t.particle ? slot(t.particle, seen) : null }
}
function slot(p: Particle, seen: Set<object>): Slot {
  const items: Inst[] = []
  if (!seen.has(p)) for (let i = 0; i < p.min; i++) items.push(item(p, seen))
  return { particle: p, items }
}
function item(p: Particle, seen: Set<object>): Inst {
  const next = new Set(seen); next.add(p)
  if (p.kind === 'element') return element(p.decl, next)
  if (p.kind === 'any') return { t: 'any', id: newId(), xml: '' }
  if (p.kind === 'choice') {
    const index = Math.max(0, p.children.findIndex(c => terminates(c, next)))
    return registerChoice({ t: 'choice', id: newId(), selected: index, slot: p.children[index] ? slot(p.children[index], next) : { particle: p, items: [] } }, p)
  }
  return { t: 'seq', id: newId(), slots: p.children.map(c => slot(c, next)) }
}
export const createElementInst = (decl: ElementDecl): ElementInst => element(decl, new Set())
export const createSlot = (particle: Particle): Slot => slot(particle, new Set())
export const createItem = (particle: Particle): Inst => item(particle, new Set())
export const canAdd = (slot: Slot): boolean => slot.items.length < slot.particle.max
export const canRemove = (slot: Slot): boolean => slot.items.length > slot.particle.min
export const slotAdd = (slot: Slot): Slot => canAdd(slot) ? { ...slot, items: [...slot.items, createItem(slot.particle)] } : slot
export function slotRemove(slot: Slot, index: number, force = false): Slot {
  if (index < 0 || index >= slot.items.length || (!force && !canRemove(slot))) return slot
  return { ...slot, items: slot.items.filter((_, i) => i !== index) }
}
export function slotMove(slot: Slot, from: number, to: number): Slot {
  if (from < 0 || to < 0 || from >= slot.items.length || to >= slot.items.length || from === to) return slot
  const items = [...slot.items]; items.splice(to, 0, items.splice(from, 1)[0]); return { ...slot, items }
}
export function choiceSelect(choice: ChoiceInst, index: number): ChoiceInst {
  const parent = choiceParents.get(choice)
  if (index === choice.selected || !parent || !parent.children[index]) return choice
  return registerChoice({ ...choice, selected: index, slot: createSlot(parent.children[index]) }, parent)
}
export function setAttr(el: ElementInst, key: string, value: string | undefined): ElementInst {
  const attrs = { ...el.attrs }; if (value === undefined) delete attrs[key]; else attrs[key] = value
  return { ...el, attrs }
}
export function cloneInst<T extends Inst>(inst: T): T {
  if (inst.t === 'el') return { ...inst, id: newId(), attrs: { ...inst.attrs }, content: inst.content && cloneSlot(inst.content) } as T
  if (inst.t === 'seq') return { ...inst, id: newId(), slots: inst.slots.map(cloneSlot) } as T
  if (inst.t === 'choice') { const choice: ChoiceInst = inst; const copy: ChoiceInst = { ...choice, id: newId(), slot: cloneSlot(choice.slot) }; const parent = choiceParents.get(choice); if (parent) registerChoice(copy, parent); return copy as T }
  return { ...inst, id: newId() }
}
function cloneSlot(s: Slot): Slot { return { ...s, items: s.items.map(cloneInst) } }
export const isRepeatable = (slot: Slot): boolean => slot.particle.max > 1
export const elementChildrenSlots = (el: ElementInst): Slot[] => el.content ? [el.content] : []
export function countInsts(root: ElementInst): number {
  function count(i: Inst): number { if (i.t === 'el') return 1 + (i.content ? i.content.items.reduce((n, x) => n + count(x), 0) : 0); if (i.t === 'seq') return i.slots.reduce((n, s) => n + s.items.reduce((m, x) => m + count(x), 0), 0); if (i.t === 'choice') return i.slot.items.reduce((n, x) => n + count(x), 0); return 0 }
  return count(root)
}
