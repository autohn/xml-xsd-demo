import type { ElementInst, Inst, Particle, SimpleTypeDef, Slot } from './model'
import { createItem, registerChoice } from './instance'
import { sampleValue, validateSimple } from './datatypes'

export interface FillOptions { optional: 'none' | 'some' | 'all'; maxDepth?: number; seed?: number; repeat?: number }
export function fillSample(root: ElementInst, opts: FillOptions = { optional: 'some' }): ElementInst {
  const ids = new Set<string>(); let index = 0
  const limit = opts.maxDepth ?? 8
  function value(type: SimpleTypeDef, old: string, name: string, fixed?: string): string {
    let v = fixed ?? (old && !validateSimple(type, old) ? old : sampleValue(type, { name, seed: opts.seed, index: index++ }))
    if (type.builtin === 'ID') {
      let candidate = v, n = 1
      while (ids.has(candidate)) candidate = v + '_' + n++
      v = candidate; ids.add(v)
    }
    return v
  }
  function element(el: ElementInst, depth: number, ancestors: Set<object>): ElementInst {
    const type = el.decl.type, attrs = { ...el.attrs }
    if (type.kind === 'complex') for (const a of type.attributes) {
      if (a.use === 'prohibited') continue
      if (attrs[a.key] !== undefined || a.use === 'required' || a.fixed !== undefined || (opts.optional !== 'none' && depth < limit && (opts.optional === 'all' || depth <= 3))) {
        attrs[a.key] = value(a.type, attrs[a.key] ?? '', a.name, a.fixed)
      }
    }
    const simple = type.kind === 'simple' ? type : type.contentKind === 'simple' ? type.simpleContent : undefined
    const text = simple ? value(simple, el.text, el.decl.name, el.decl.fixed) : el.text
    const next = new Set(ancestors); next.add(type)
    return { ...el, attrs, text, nil: false, content: el.content ? slot(el.content, depth, next) : null }
  }
  function slot(s: Slot, depth: number, ancestors: Set<object>): Slot {
    const p = s.particle
    let target = s.items.length
    const recursive = p.kind === 'element' && ancestors.has(p.decl.type)
    const optionalAllowed = depth < limit && !recursive && (opts.optional === 'all' || (opts.optional === 'some' && depth <= 3))
    if (optionalAllowed && p.kind !== 'any') target = Math.max(target, p.min, p.max > 1 ? opts.repeat ?? Math.max(p.min, 1) : 1)
    target = Math.min(target, p.max)
    const items = [...s.items]
    while (items.length < target) items.push(createItem(p))
    return { ...s, items: items.map(i => inst(i, depth, ancestors, p)) }
  }
  function inst(i: Inst, depth: number, ancestors: Set<object>, particle: Particle): Inst {
    if (i.t === 'el') return element(i, depth + 1, ancestors)
    if (i.t === 'seq') return { ...i, slots: i.slots.map(s => slot(s, depth, ancestors)) }
    if (i.t === 'choice') { const c = { ...i, slot: slot(i.slot, depth, ancestors) }; return particle.kind === 'choice' ? registerChoice(c, particle) : c }
    return { ...i, xml: i.xml || '<s:note xmlns:s="urn:example:sample">Образец</s:note>' }
  }
  return element(root, 0, new Set())
}


