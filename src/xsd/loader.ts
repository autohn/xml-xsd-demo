import { BUILTIN_NAMES } from './model'
import type { AttributeDef, BuiltinName, ComplexTypeDef, Diagnostic, ElementDecl, Facets, GroupParticle, Particle, SchemaFile, SchemaSet, SimpleTypeDef, TypeDef } from './model'

export type FileReader = (fileName: string) => Promise<string | undefined> | string | undefined
const XSD = 'http://www.w3.org/2001/XMLSchema'
const XMLNS = 'http://www.w3.org/2000/xmlns/'
const key = (ns: string, name: string) => `{${ns}}${name}`
const children = (e: Element, name?: string) => Array.from(e.children).filter(c => c.namespaceURI === XSD && (!name || c.localName === name))
const child = (e: Element, name: string) => children(e, name)[0]
const doc = (e: Element) => {
  const a = child(e, 'annotation')
  const s = a && children(a, 'documentation').map(d => (d.textContent || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).join('\n')).filter(Boolean).join('\n')
  return s || undefined
}
const attr = (e: Element, n: string) => e.hasAttribute(n) ? e.getAttribute(n)! : undefined
const occurs = (e: Element) => ({ min: Number(attr(e, 'minOccurs') ?? 1), max: attr(e, 'maxOccurs') === 'unbounded' ? Infinity : Number(attr(e, 'maxOccurs') ?? 1) })
const basename = (s: string) => s.split(/[\\/]/).pop() || s
interface Source { root: Element; file: SchemaFile }
interface NodeRef { el: Element; source: Source }

export async function loadSchemaSet(entry: string, read: FileReader): Promise<SchemaSet> {
  const diagnostics: Diagnostic[] = [], sources: Source[] = [], seen = new Set<string>(), unsupported = new Set<string>()
  const warn = (s: Source | string, message: string, level: Diagnostic['level'] = 'warning') => diagnostics.push({ level, file: typeof s === 'string' ? s : s.file.name, message })
  async function load(name: string, from?: Source): Promise<void> {
    name = basename(name)
    if (seen.has(name)) return
    seen.add(name)
    let text: string | undefined
    try { text = await read(name) } catch { text = undefined }
    if (text === undefined) { if (!from) throw new Error(`Файл схемы «${name}» не найден`); warn(from, `Не найден файл схемы «${name}»`); return }
    const document = new DOMParser().parseFromString(text, 'application/xml')
    const root = document.documentElement
    if (!root || root.localName === 'parsererror' || document.getElementsByTagName('parsererror').length) {
      if (!from) throw new Error(`Некорректный XML схемы «${name}»`)
      warn(from, `Некорректная схема «${name}»`); return
    }
    const prefixes: Record<string, string> = {}
    for (const a of Array.from(root.attributes)) if (a.namespaceURI === XMLNS) prefixes[a.localName === 'xmlns' ? '' : a.localName] = a.value
    const source: Source = { root, file: { name, targetNamespace: attr(root, 'targetNamespace') ?? '', elementFormDefault: attr(root, 'elementFormDefault') === 'qualified' ? 'qualified' : 'unqualified', attributeFormDefault: attr(root, 'attributeFormDefault') === 'qualified' ? 'qualified' : 'unqualified', prefixes } }
    sources.push(source)
    if (root.namespaceURI !== XSD || root.localName !== 'schema') { warn(source, 'Корневой элемент не является схемой XSD'); return }
    for (const el of children(root)) if (['import', 'include', 'redefine', 'override'].includes(el.localName)) {
      if (el.localName === 'redefine' || el.localName === 'override') { unsupported.add(el.localName); warn(source, `Конструкция xs:${el.localName} не поддерживается`) }
      const location = attr(el, 'schemaLocation')
      if (location) await load(location, source)
      else warn(source, `Не указан файл для xs:${el.localName}`)
    }
  }
  await load(entry)
  const maps = { element: new Map<string, NodeRef>(), complexType: new Map<string, NodeRef>(), simpleType: new Map<string, NodeRef>(), group: new Map<string, NodeRef>(), attribute: new Map<string, NodeRef>(), attributeGroup: new Map<string, NodeRef>() }
  const unsupportedNames = new Set(['key', 'unique', 'keyref', 'selector', 'field', 'notation'])
  for (const source of sources) {
    const scan = (el: Element) => { for (const c of children(el)) { if (unsupportedNames.has(c.localName)) unsupported.add(c.localName); scan(c) } }
    scan(source.root)
    for (const el of children(source.root)) {
      const map = maps[el.localName as keyof typeof maps], name = attr(el, 'name')
      if (map && name) map.set(key(source.file.targetNamespace, name), { el, source })
    }
  }
  const simpleTypes = new Map<string, SimpleTypeDef>(), complexTypes = new Map<string, ComplexTypeDef>(), elements = new Map<string, ElementDecl>()
  const builtin = new Map<string, SimpleTypeDef>()
  for (const name of BUILTIN_NAMES) builtin.set(name, { kind: 'simple', key: key(XSD, name), name, ns: XSD, variety: 'atomic', builtin: name === 'anyType' ? 'anySimpleType' : name, facets: { patterns: [] } })
  const fallback = builtin.get('string')!, defaultType = builtin.get('anySimpleType')!
  let serial = 0, elementCount = 0
  const qname = (el: Element, value: string) => { const i = value.indexOf(':'); const prefix = i < 0 ? null : value.slice(0, i); return key(el.lookupNamespaceURI(prefix) || '', i < 0 ? value : value.slice(i + 1)) }
  const qlocal = (s: string) => s.slice(s.indexOf('}') + 1)
  const clean = (raw: string, source: Source, kind: string) => {
    if (/^[\p{L}_][\p{L}\p{N}_.\-\p{M}]*$/u.test(raw)) return raw
    let name = raw.trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{N}_.\-\p{M}]/gu, '') || 'element'
    if (!/^[\p{L}_]/u.test(name)) name = `_${name}`
    warn(source, `Имя ${kind} «${raw}» не является корректным NCName — использовано «${name}»`)
    return name
  }
  const missing = (source: Source, kind: string, name: string) => warn(source, `Не найдена ссылка ${kind} «${name}»`)
  function resolveType(el: Element, value: string, source: Source): TypeDef {
    const k = qname(el, value), local = qlocal(k)
    if (k.startsWith(`{${XSD}}`)) { const t = builtin.get(local); if (t) return t }
    const s = maps.simpleType.get(k); if (s) return simple(s.el, s.source, k)
    const c = maps.complexType.get(k); if (c) return complex(c.el, c.source, k)
    missing(source, 'типа', value); return fallback
  }
  function asSimple(t: TypeDef): SimpleTypeDef { return t.kind === 'simple' ? t : t.simpleContent ?? fallback }
  function facets(base: Facets, el: Element): Facets {
    const result: Facets = { ...base, patterns: base.patterns.slice(), enumeration: base.enumeration?.slice(), enumerationDocs: base.enumerationDocs ? { ...base.enumerationDocs } : undefined }
    const patterns: string[] = [], enums: string[] = [], enumDocs: Record<string, string> = {}
    const numeric = new Set(['length', 'minLength', 'maxLength', 'totalDigits', 'fractionDigits'])
    const scalar = new Set(['whiteSpace', 'minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive'])
    for (const c of children(el)) { const v = attr(c, 'value'); if (v === undefined) continue
      if (c.localName === 'pattern') patterns.push(v)
      else if (c.localName === 'enumeration') { enums.push(v); const d = doc(c); if (d) enumDocs[v] = d }
      else if (numeric.has(c.localName)) (result as unknown as Record<string, unknown>)[c.localName] = Number(v)
      else if (scalar.has(c.localName)) (result as unknown as Record<string, unknown>)[c.localName] = v
    }
    if (patterns.length) result.patterns.push(patterns)
    if (enums.length) { result.enumeration = enums; result.enumerationDocs = Object.keys(enumDocs).length ? enumDocs : undefined }
    return result
  }
  function simple(el: Element, source: Source, k = `anon:${++serial}`): SimpleTypeDef {
    const existing = simpleTypes.get(k); if (existing) return existing
    const t: SimpleTypeDef = { kind: 'simple', key: k, name: attr(el, 'name'), ns: source.file.targetNamespace, doc: doc(el), variety: 'atomic', builtin: 'string', facets: { patterns: [] } }
    simpleTypes.set(k, t)
    const restriction = child(el, 'restriction'), list = child(el, 'list'), union = child(el, 'union')
    if (restriction) {
      const baseName = attr(restriction, 'base'), inline = child(restriction, 'simpleType')
      const base = baseName ? asSimple(resolveType(restriction, baseName, source)) : inline ? simple(inline, source) : fallback
      t.variety = base.variety; t.builtin = base.builtin; t.itemType = base.itemType; t.memberTypes = base.memberTypes; t.facets = facets(base.facets, restriction)
    } else if (list) { const name = attr(list, 'itemType'), inline = child(list, 'simpleType'); t.variety = 'list'; t.itemType = name ? asSimple(resolveType(list, name, source)) : inline ? simple(inline, source) : fallback }
    else if (union) { t.variety = 'union'; t.memberTypes = (attr(union, 'memberTypes')?.trim().split(/\s+/).filter(Boolean) ?? []).map(n => asSimple(resolveType(union, n, source))).concat(children(union, 'simpleType').map(e => simple(e, source))) }
    return t
  }
  const inGroups = new Set<string>(), inAttributeGroups = new Set<string>(), groupCache = new Map<string, GroupParticle>()
  function element(el: Element, source: Source, parent: string, global = false): ElementDecl {
    const raw = attr(el, 'name') ?? 'element', name = clean(raw, source, 'элемента'), ns = global || (attr(el, 'form') ?? source.file.elementFormDefault) === 'qualified' ? source.file.targetNamespace : ''
    const k = global ? key(ns, name) : `${parent}/${name}:${++serial}`
    const found = global && elements.get(k); if (found) return found
    const d: ElementDecl = { key: k, name, ns, type: defaultType, doc: doc(el), global, nillable: attr(el, 'nillable') === 'true' || attr(el, 'nillable') === '1', fixed: attr(el, 'fixed'), default: attr(el, 'default'), abstract: attr(el, 'abstract') === 'true' }
    elementCount++; if (global) elements.set(k, d)
    if (attr(el, 'substitutionGroup')) warn(source, `Подстановка substitutionGroup элемента «${name}» игнорируется`, 'info')
    const type = attr(el, 'type'), st = child(el, 'simpleType'), ct = child(el, 'complexType')
    d.type = type ? resolveType(el, type, source) : st ? simple(st, source) : ct ? complex(ct, source) : defaultType
    return d
  }
  function particle(el: Element, source: Source, parent: string): Particle {
    const occ = occurs(el), d = doc(el)
    if (el.localName === 'element') {
      const ref = attr(el, 'ref'); let decl: ElementDecl
      if (ref) { const node = maps.element.get(qname(el, ref)); if (node) decl = element(node.el, node.source, '', true); else { missing(source, 'элемента', ref); decl = element(el, source, parent) } }
      else decl = element(el, source, parent)
      return { kind: 'element', ...occ, doc: d ?? decl.doc, decl }
    }
    if (el.localName === 'any') { const p = attr(el, 'processContents'); return { kind: 'any', ...occ, doc: d, namespace: attr(el, 'namespace') ?? '##any', processContents: p === 'skip' || p === 'lax' ? p : 'strict' } }
    if (el.localName === 'group') {
      const ref = attr(el, 'ref'), k = ref ? qname(el, ref) : '', node = maps.group.get(k)
      if (ref && node && !inGroups.has(k)) { let result = groupCache.get(k); if (!result) { inGroups.add(k); const model = children(node.el).find(c => ['sequence', 'choice', 'all'].includes(c.localName)); const parsed = model ? particle(model, node.source, 'group:' + k) : undefined; inGroups.delete(k); if (parsed && (parsed.kind === 'sequence' || parsed.kind === 'choice' || parsed.kind === 'all')) { result = parsed; groupCache.set(k, result) } } if (result) return { ...result, ...occ, groupName: qlocal(k), doc: d ?? doc(node.el) ?? result.doc } }
      if (ref) missing(source, 'группы', ref)
      return { kind: 'sequence', ...occ, children: [] }
    }
    return { kind: el.localName as GroupParticle['kind'], ...occ, doc: d, children: children(el).filter(c => ['element', 'any', 'sequence', 'choice', 'all', 'group'].includes(c.localName)).map(c => particle(c, source, parent)) }
  }
  function attributes(el: Element, source: Source): { attrs: AttributeDef[]; any: boolean } {
    const attrs: AttributeDef[] = []; let any = false
    for (const c of children(el)) {
      if (c.localName === 'anyAttribute') any = true
      if (c.localName === 'attributeGroup') { const ref = attr(c, 'ref'), k = ref ? qname(c, ref) : '', n = maps.attributeGroup.get(k); if (n && !inAttributeGroups.has(k)) { inAttributeGroups.add(k); const a = attributes(n.el, n.source); attrs.push(...a.attrs); any ||= a.any; inAttributeGroups.delete(k) } else if (ref) missing(source, 'группы атрибутов', ref); continue }
      if (c.localName !== 'attribute') continue
      const ref = attr(c, 'ref'), n = ref ? maps.attribute.get(qname(c, ref)) : undefined
      if (ref && !n) missing(source, 'атрибута', ref)
      const node = n?.el ?? c, src = n?.source ?? source, name = clean(attr(node, 'name') ?? (ref ? qlocal(qname(c, ref)) : 'attribute'), src, 'атрибута')
      const ns = n || (attr(node, 'form') ?? src.file.attributeFormDefault) === 'qualified' ? src.file.targetNamespace : ''
      const type = attr(node, 'type'), st = child(node, 'simpleType'), use = attr(c, 'use')
      attrs.push({ key: ns ? key(ns, name) : name, name, ns, type: type ? asSimple(resolveType(node, type, src)) : st ? simple(st, src) : defaultType, use: use === 'required' || use === 'prohibited' ? use : 'optional', fixed: attr(c, 'fixed') ?? attr(node, 'fixed'), default: attr(c, 'default') ?? attr(node, 'default'), doc: doc(c) ?? doc(node) })
    }
    return { attrs, any }
  }
  function complex(el: Element, source: Source, k = `anon:${++serial}`): ComplexTypeDef {
    const existing = complexTypes.get(k); if (existing) return existing
    const t: ComplexTypeDef = { kind: 'complex', key: k, name: attr(el, 'name'), ns: source.file.targetNamespace, doc: doc(el), abstract: attr(el, 'abstract') === 'true', mixed: attr(el, 'mixed') === 'true', contentKind: 'empty', attributes: [] }
    complexTypes.set(k, t)
    const wrapper = child(el, 'complexContent') ?? child(el, 'simpleContent'), deriv = wrapper && (child(wrapper, 'extension') ?? child(wrapper, 'restriction')), body = deriv ?? el
    const baseName = deriv && attr(deriv, 'base'), base = baseName && resolveType(deriv!, baseName, source)
    const baseComplex = base && base.kind === 'complex' ? base : undefined
    if (attr(el, 'mixed') === undefined) t.mixed = attr(wrapper ?? el, 'mixed') !== undefined ? attr(wrapper!, 'mixed') === 'true' : baseComplex?.mixed ?? false
    const model = children(body).find(c => ['sequence', 'choice', 'all', 'group'].includes(c.localName)), own = model && particle(model, source, k)
    if (wrapper?.localName === 'simpleContent') {
      let st = base ? asSimple(base) : fallback
      const inline = child(body, 'simpleType'); if (inline) st = simple(inline, source)
      if (deriv?.localName === 'restriction') st = { ...st, key: `anon:${++serial}`, name: undefined, facets: facets(st.facets, deriv) }
      t.simpleContent = st; t.contentKind = 'simple'
    } else {
      const bp = baseComplex?.particle
      t.particle = deriv?.localName === 'extension' && bp ? own ? { kind: 'sequence', min: 1, max: 1, children: [bp, own] } : bp : own
      t.contentKind = t.particle || t.mixed ? 'elements' : 'empty'
    }
    const a = attributes(body, source), combined = new Map<string, AttributeDef>()
    for (const item of baseComplex?.attributes ?? []) combined.set(item.key, item)
    for (const item of a.attrs) { if (item.use === 'prohibited') combined.delete(item.key); else combined.set(item.key, item) }
    t.attributes = [...combined.values()]; t.anyAttribute = a.any || baseComplex?.anyAttribute || undefined
    return t
  }
  for (const [k, n] of maps.simpleType) simple(n.el, n.source, k)
  for (const [k, n] of maps.complexType) complex(n.el, n.source, k)
  for (const [, n] of maps.element) element(n.el, n.source, '', true)
  const first = sources[0], roots: SchemaSet['roots'] = []
  for (const el of children(first.root, 'element')) { const decl = element(el, first, '', true); roots.push({ id: `element:${decl.key}`, label: decl.name, kind: 'element', decl, doc: decl.doc }) }
  const named = children(first.root, 'complexType').map(el => complex(el, first, key(first.file.targetNamespace, attr(el, 'name') ?? ''))).filter(t => t.name).sort((a, b) => a.name!.localeCompare(b.name!))
  for (const t of named) { const id = `type:${key(t.ns, t.name!)}`; roots.push({ id, label: t.name!, kind: 'type', decl: { key: id, name: t.name!, ns: t.ns, global: false, type: t }, doc: t.doc }) }
  const prefixes: Record<string, string> = {}, used = new Set<string>(['xml', 'xmlns', 'xsi', 'xs', 'xsd', ''])
  prefixes[first.file.targetNamespace] = ''
  for (const source of sources) for (const [prefix, uri] of Object.entries(source.file.prefixes)) {
    if (!prefix || !uri || uri === XSD || uri === 'http://www.w3.org/2001/XMLSchema-instance' || uri === 'http://www.w3.org/XML/1998/namespace' || uri in prefixes) continue
    let candidate = prefix, i = 1; while (used.has(candidate)) candidate = `${prefix}${i++}`
    prefixes[uri] = candidate; used.add(candidate)
  }
  let seq = 1
  for (const source of sources) { const uri = source.file.targetNamespace; if (!uri || uri in prefixes) continue; let p = uri === 'http://www.w3.org/2000/09/xmldsig#' ? 'ds' : `ns${seq++}`; while (used.has(p)) p = `ns${seq++}`; prefixes[uri] = p; used.add(p) }
  return { entry: basename(entry), files: sources.map(s => s.file), elements, complexTypes, simpleTypes, roots, prefixes, diagnostics, stats: { files: sources.length, elementDecls: elementCount, complexTypes: complexTypes.size, simpleTypes: simpleTypes.size, unsupported: [...unsupported] } }
}



