import type { ElementInst, Inst, Particle, RootChoice, SchemaSet, Slot } from './model'
import { createElementInst, createItem, newId, registerChoice } from './instance'
import { normalizeValue } from './datatypes'

export interface SerializeOptions { indent?: string; xmlDeclaration?: boolean; schemaLocation?: boolean }
export interface ParseResult { root: ElementInst; warnings: string[] }
const xsi = 'http://www.w3.org/2001/XMLSchema-instance'
const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export function serializeXml(root: ElementInst, set: SchemaSet, opts: SerializeOptions = {}): string {
  const indent = opts.indent ?? '  ', prefixes = { ...set.prefixes }, used = new Set<string>()
  const add = (ns: string) => { if (ns) used.add(ns) }, attrNs = new Set<string>()
  function scan(i: Inst) {
    if (i.t === 'el') {
      add(i.decl.ns)
      const t = i.decl.type
      if (t.kind === 'complex') for (const a of t.attributes) if (i.attrs[a.key] !== undefined) { add(a.ns); if (a.ns) attrNs.add(a.ns) }
      if (i.nil) add(xsi)
      i.content?.items.forEach(scan)
    } else if (i.t === 'seq') i.slots.forEach(s => s.items.forEach(scan))
    else if (i.t === 'choice') i.slot.items.forEach(scan)
  }
  scan(root)
  if (opts.schemaLocation !== false) add(xsi)
  let serial = 1
  const occupied = new Set(Object.values(prefixes))
  for (const ns of used) if (ns !== xsi && prefixes[ns] === undefined) {
    while (occupied.has('ns' + serial)) serial++
    prefixes[ns] = 'ns' + serial++; occupied.add(prefixes[ns])
  }
  const attrPrefixes: Record<string, string> = {}
  for (const ns of used) if (ns !== xsi && prefixes[ns] === '' && attrNs.has(ns)) {
    let n = 'ns' + serial++
    while (occupied.has(n)) n = 'ns' + serial++
    attrPrefixes[ns] = n; occupied.add(n)
  }
  const qname = (ns: string, name: string, attr = false) => !ns ? name : (ns === xsi ? 'xsi' : (attr && prefixes[ns] === '' ? attrPrefixes[ns] : prefixes[ns])) ? (ns === xsi ? 'xsi' : attr && prefixes[ns] === '' ? attrPrefixes[ns] : prefixes[ns]) + ':' + name : name
  const defaultNs = Object.keys(prefixes).find(ns => prefixes[ns] === '' && used.has(ns)) ?? ''
  function element(el: ElementInst, depth: number, inherited: string, isRoot: boolean): string {
    const pad = indent.repeat(depth), name = qname(el.decl.ns, el.decl.name)
    let attrs = ''
    let current = inherited
    if (isRoot) {
      if (defaultNs) { attrs += ' xmlns="' + escape(defaultNs) + '"'; current = defaultNs }
      for (const ns of [...used].sort()) if (ns !== xsi && prefixes[ns]) attrs += ' xmlns:' + prefixes[ns] + '="' + escape(ns) + '"'
      for (const ns of Object.keys(attrPrefixes).sort()) attrs += ' xmlns:' + attrPrefixes[ns] + '="' + escape(ns) + '"'
      if (used.has(xsi)) attrs += ' xmlns:xsi="' + xsi + '"'
      if (opts.schemaLocation !== false) attrs += el.decl.ns ? ' xsi:schemaLocation="' + escape(el.decl.ns + ' ' + set.entry) + '"' : ' xsi:noNamespaceSchemaLocation="' + escape(set.entry) + '"'
    }
    if (!el.decl.ns && current) { attrs += ' xmlns=""'; current = '' }
    else if (el.decl.ns && prefixes[el.decl.ns] === '' && current !== el.decl.ns) { attrs += ' xmlns="' + escape(el.decl.ns) + '"'; current = el.decl.ns }
    const t = el.decl.type
    if (t.kind === 'complex') for (const a of t.attributes) if (el.attrs[a.key] !== undefined) attrs += ' ' + qname(a.ns, a.name, true) + '="' + escape(normalizeValue(a.type, el.attrs[a.key])) + '"'
    if (el.nil) return pad + '<' + name + attrs + ' xsi:nil="true"/>'
    const simple = t.kind === 'simple' ? t : t.contentKind === 'simple' ? t.simpleContent : undefined
    const text = simple ? normalizeValue(simple, el.text) : el.text
    const children = el.content ? renderSlot(el.content, depth + 1, current) : []
    if (!children.length && !text) return pad + '<' + name + attrs + '/>'
    if (!children.length) return pad + '<' + name + attrs + '>' + escape(text) + '</' + name + '>'
    if (t.kind === 'complex' && t.mixed) return pad + '<' + name + attrs + '>' + escape(text) + children.map(x => x.trimStart()).join('') + '</' + name + '>'
    return pad + '<' + name + attrs + '>\n' + children.join('\n') + '\n' + pad + '</' + name + '>'
  }
  function renderSlot(s: Slot, depth: number, ns: string): string[] { return s.items.flatMap(i => render(i, depth, ns)) }
  function render(i: Inst, depth: number, ns: string): string[] {
    if (i.t === 'el') return [element(i, depth, ns, false)]
    if (i.t === 'seq') return i.slots.flatMap(s => renderSlot(s, depth, ns))
    if (i.t === 'choice') return renderSlot(i.slot, depth, ns)
    if (!i.xml.trim()) return []
    const doc = new DOMParser().parseFromString('<root>' + i.xml + '</root>', 'application/xml')
    return [indent.repeat(depth) + (doc.getElementsByTagName('parsererror').length ? '<!-- Некорректный XML-фрагмент -->' : i.xml.replace(/\n/g, '\n' + indent.repeat(depth)))]
  }
  return (opts.xmlDeclaration === false ? '' : '<?xml version="1.0" encoding="UTF-8"?>\n') + element(root, 0, '', true)
}
export function parseXml(xml: string, set: SchemaSet, rootChoice: RootChoice): ParseResult {
  void set
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length || !doc.documentElement) throw new Error('Некорректный XML-документ')
  const top = doc.documentElement, decl = rootChoice.decl
  if (top.localName !== decl.name || (top.namespaceURI ?? '') !== decl.ns) throw new Error('Корневой элемент не соответствует выбранной схеме')
  const warnings: string[] = []
  function element(node: Element, template: ElementInst): ElementInst {
    const el = { ...template, attrs: {} as Record<string, string>, nil: node.getAttributeNS(xsi, 'nil') === 'true' || node.getAttributeNS(xsi, 'nil') === '1' }
    const t = el.decl.type
    for (const attr of Array.from(node.attributes)) {
      if (attr.namespaceURI === 'http://www.w3.org/2000/xmlns/' || attr.namespaceURI === xsi) continue
      const a = t.kind === 'complex' ? t.attributes.find(x => x.name === attr.localName && x.ns === (attr.namespaceURI ?? '')) : undefined
      if (a) el.attrs[a.key] = attr.value
      else warnings.push('Атрибут ' + attr.name + ' не ожидается в ' + node.tagName + ' — пропущен')
    }
    if (t.kind === 'complex') for (const a of t.attributes) if (el.attrs[a.key] === undefined && (a.use === 'required' || a.fixed !== undefined || a.default !== undefined)) el.attrs[a.key] = a.fixed ?? a.default ?? ''
    el.text = Array.from(node.childNodes).filter(n => n.nodeType === 3 || n.nodeType === 4).map(n => n.nodeValue ?? '').join('')
    if (t.kind === 'complex' && t.contentKind === 'elements' && !t.mixed) el.text = ''
    const children = Array.from(node.children)
    let pos = 0
    function matchSlot(p: Particle): Slot {
      const items: Inst[] = []
      while (pos < children.length && items.length < p.max) {
        const start = pos
        const found = matchItem(p)
        if (!found || pos === start) break
        items.push(found)
      }
      while (items.length < p.min) items.push(createItem(p))
      return { particle: p, items }
    }
    function matchItem(p: Particle): Inst | null {
      const current = children[pos]
      if (!current) return null
      if (p.kind === 'element') {
        if (current.localName !== p.decl.name || (current.namespaceURI ?? '') !== p.decl.ns) return null
        pos++; return element(current, createElementInst(p.decl))
      }
      if (p.kind === 'any') { pos++; return { t: 'any', id: newId(), xml: new XMLSerializer().serializeToString(current) } }
      if (p.kind === 'choice') {
        for (let n = 0; n < p.children.length; n++) {
          const start = pos, s = matchSlot(p.children[n])
          if (pos > start) return registerChoice({ t: 'choice', id: newId(), selected: n, slot: s }, p)
          pos = start
        }
        return null
      }
      const start = pos, slots = p.children.map(matchSlot)
      if (pos === start) return null
      return { t: 'seq', id: newId(), slots }
    }
    if (el.content && !el.nil) el.content = matchSlot(el.content.particle)
    while (pos < children.length) { warnings.push('Элемент <' + children[pos].tagName + '> не ожидается в <' + node.tagName + '> — пропущен'); pos++ }
    return el
  }
  return { root: element(top, createElementInst(decl)), warnings }
}

