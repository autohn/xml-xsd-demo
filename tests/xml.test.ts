import { expect, it } from 'vitest'
import { createElementInst } from '../src/xsd/instance'
import { parseXml, serializeXml } from '../src/xsd/xml'
import type { ElementDecl, RootChoice, SchemaSet, SimpleTypeDef } from '../src/xsd/model'
const type: SimpleTypeDef = { kind: 'simple', key: 's', ns: '', builtin: 'string', variety: 'atomic', facets: { patterns: [] } }
const child: ElementDecl = { key: 'c', name: 'child', ns: '', type, global: false }
const decl: ElementDecl = { key: 'r', name: 'root', ns: 'urn:test', global: true, type: { kind: 'complex', key: 'r', ns: 'urn:test', contentKind: 'elements', mixed: false, attributes: [], particle: { kind: 'element', decl: child, min: 1, max: 1 } } }
const rootChoice: RootChoice = { id: 'r', label: 'r', kind: 'element', decl }
const set: SchemaSet = { entry: 'test.xsd', files: [], elements: new Map(), complexTypes: new Map(), simpleTypes: new Map(), roots: [rootChoice], prefixes: { 'urn:test': '' }, diagnostics: [], stats: { files: 0, elementDecls: 0, complexTypes: 0, simpleTypes: 0, unsupported: [] } }
it('resets default namespace, escapes and parses content', () => {
  const root = createElementInst(decl)
  const c = root.content!.items[0]
  if (c.t !== 'el') throw new Error('unexpected fixture')
  c.text = '<&"'
  const xml = serializeXml(root, set)
  expect(xml).toContain('xmlns=""')
  expect(xml).toContain('&lt;&amp;&quot;')
  const parsed = parseXml(xml, set, rootChoice)
  expect(parsed.warnings).toEqual([])
  expect((parsed.root.content!.items[0] as typeof c).text).toBe(c.text)
})
