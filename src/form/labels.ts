import type { ElementDecl, Particle, SchemaSet } from '@/xsd/model'

/** First line of an annotation as a short human title; the full text stays available as a tooltip. */
export function shortTitle(doc: string | undefined, fallback: string, max = 96): string {
  const first = doc?.split('\n')[0]?.trim()
  if (!first) return fallback
  if (first.length <= max) return first
  const cut = first.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut) + '…'
}

export function qname(decl: ElementDecl, prefixes: Record<string, string>): string {
  const p = decl.ns ? prefixes[decl.ns] : ''
  return p ? `${p}:${decl.name}` : decl.name
}

export function particleNames(p: Particle, limit = 3): string {
  const names: string[] = []
  const walk = (q: Particle) => {
    if (names.length > limit) return
    if (q.kind === 'element') names.push(q.decl.name)
    else if (q.kind === 'any') names.push('любой XML')
    else q.children.forEach(walk)
  }
  walk(p)
  const shown = names.slice(0, limit).join(', ')
  return names.length > limit ? `${shown}…` : shown
}

/** Label of one slot / choice branch. */
export function particleTitle(p: Particle): string {
  if (p.kind === 'element') return shortTitle(p.decl.doc ?? p.doc, p.decl.name, 70)
  if (p.kind === 'any') return 'Произвольный XML (xs:any)'
  const base = p.doc ? shortTitle(p.doc, '', 70) : ''
  if (base) return base
  return p.groupName ? `Группа «${p.groupName}»` : `${p.kind === 'choice' ? 'Выбор' : 'Группа'}: ${particleNames(p)}`
}

export function occursLabel(p: Particle): string {
  const max = p.max === Infinity ? '∞' : String(p.max)
  return `${p.min}…${max}`
}

export function schemaPrefix(set: SchemaSet, ns: string): string {
  return set.prefixes[ns] ?? ''
}
