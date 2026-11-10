import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadSchemaSet } from '../src/xsd/loader'
import type { Particle, TypeDef } from '../src/xsd/model'

const read = (name: string) => { try { return readFileSync(name, 'utf8') } catch { return undefined } }
const findElements = (p: Particle | undefined): string[] => !p ? [] : p.kind === 'element' ? [p.decl.name] : p.kind === 'any' ? [] : p.children.flatMap(findElements)

describe('XSD loader', () => {
  it('loads the supplied schemas and the WorkInfo inheritance', async () => {
    for (const name of ['Xmldsig.xsd', 'BaseTypes.xsd', 'BaseDocument.xsd', 'CommonTypes.xsd', 'WorkInfo.xsd']) {
      const start = performance.now(), set = await loadSchemaSet(name, read)
      if (name === 'CommonTypes.xsd') {
        console.log('CommonTypes diagnostics', set.diagnostics.length, ['info', 'warning', 'error'].map(level => [level, set.diagnostics.filter(d => d.level === level).length]))
        expect(performance.now() - start).toBeLessThan(3000)
        expect(set.complexTypes.size).toBeGreaterThanOrEqual(500)
        expect(set.roots.length).toBeGreaterThanOrEqual(248)
        expect(set.diagnostics.filter(d => d.level === 'error')).toEqual([])
        const visited = new Set<TypeDef>()
        const visit = (type: TypeDef) => {
          expect(type).toBeDefined()
          if (visited.has(type)) return
          visited.add(type)
          if (type.kind !== 'complex') return
          const walk = (p?: Particle) => {
            if (!p) return
            if (p.kind === 'element') visit(p.decl.type)
            else if (p.kind !== 'any') p.children.forEach(walk)
          }
          walk(type.particle)
        }
        set.roots.forEach(root => visit(root.decl.type))
        expect([...set.simpleTypes.values()].some(t => t.facets.enumeration?.length)).toBe(true)
      }
      if (name === 'WorkInfo.xsd') {
        expect(set.roots.map(r => [r.kind, r.label])).toEqual([['element', 'workInfo'], ['type', 'workInfo']])
        expect(set.diagnostics.some(d => d.message.includes('RandomTest.xsd'))).toBe(true)
        expect(set.diagnostics.some(d => d.message.includes('workInfo rt'))).toBe(true)
        const t = set.roots[1].decl.type
        expect(t.kind).toBe('complex')
        if (t.kind !== 'complex') return
        expect(t.attributes.find(a => a.name === 'schemaVersion')).toMatchObject({ use: 'required', fixed: 'draft.1' })
        expect(findElements(t.particle).slice(0, 6)).toEqual(['uuid', 'permanentObjectUUID', 'edition', 'permanentObjectId', 'docInfo', 'arrayInfo'])
        expect(set.simpleTypes.get('{http://types/BaseTypes.xsd}GUID')?.facets.patterns.length).toBeGreaterThan(0)
      }
    }
  }, 30000)
  it('handles groups, derivation, recursion, facets, namespace forms, list and union', async () => {
    const xml = `<schema xmlns="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:t" targetNamespace="urn:t" elementFormDefault="qualified">
      <simpleType name="S"><restriction base="string"><minLength value="1"/><whiteSpace value="collapse"/><pattern value="a"/></restriction></simpleType>
      <simpleType name="R"><restriction base="t:S"><enumeration value="abc"/><pattern value="b"/></restriction></simpleType>
      <simpleType name="L"><list itemType="t:S"/></simpleType><simpleType name="U"><union memberTypes="t:S t:R"/></simpleType>
      <attributeGroup name="attrs"><attribute name="a" use="required"/></attributeGroup>
      <group name="g"><choice><element name="x"/><element name="y"/></choice></group>
      <complexType name="A"><sequence><element name="self" type="t:A" minOccurs="0"/><element name="local" form="unqualified"><simpleType><restriction base="string"/></simpleType></element></sequence><attributeGroup ref="t:attrs"/></complexType>
      <complexType name="B"><complexContent><extension base="t:A"><group ref="t:g" maxOccurs="unbounded"/></extension></complexContent></complexType>
      <complexType name="C"><complexContent><extension base="t:B"><sequence minOccurs="0"><element name="z"/></sequence></extension></complexContent></complexType>
      <element name="root" type="t:C"/>
    </schema>`
    const set = await loadSchemaSet('test.xsd', () => xml)
    const r = set.simpleTypes.get('{urn:t}R')!
    expect(r.facets).toMatchObject({ minLength: 1, whiteSpace: 'collapse', patterns: [['a'], ['b']], enumeration: ['abc'] })
    expect(set.simpleTypes.get('{urn:t}L')?.variety).toBe('list')
    expect(set.simpleTypes.get('{urn:t}U')?.memberTypes).toHaveLength(2)
    const a = set.complexTypes.get('{urn:t}A')!, b = set.complexTypes.get('{urn:t}B')!
    expect(a.attributes[0]).toMatchObject({ name: 'a', use: 'required' })
    expect(a.particle?.kind).toBe('sequence')
    if (a.particle?.kind !== 'sequence') return
    const self = a.particle.children[0], local = a.particle.children[1]
    expect(self.kind === 'element' && self.decl.type).toBe(a)
    expect(local.kind === 'element' && local.decl.ns).toBe('')
    expect(b.particle?.kind === 'sequence' && b.particle.children[1]).toMatchObject({ kind: 'choice', max: Infinity, groupName: 'g' })
    expect(set.complexTypes.get('{urn:t}C')?.attributes).toHaveLength(1)
    const visit = (type: TypeDef, seen = new Set<TypeDef>()) => { if (seen.has(type)) return; seen.add(type); if (type.kind === 'complex') { const walk = (p?: Particle) => { if (!p) return; if (p.kind === 'element') { expect(p.decl.type).toBeDefined(); visit(p.decl.type, seen) } else if (p.kind !== 'any') p.children.forEach(walk) }; walk(type.particle) } }
    set.roots.forEach(root => visit(root.decl.type))
  })
})



