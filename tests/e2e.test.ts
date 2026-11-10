import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadSchemaSet } from '../src/xsd/loader'
import { createElementInst } from '../src/xsd/instance'
import { fillSample } from '../src/xsd/sample'
import { validateInstance } from '../src/xsd/validate'
import { parseXml, serializeXml } from '../src/xsd/xml'

const files = ['WorkInfo.xsd', 'BaseDocument.xsd', 'BaseTypes.xsd', 'CommonTypes.xsd', 'Xmldsig.xsd']
const read = (name: string) => { try { return readFileSync(name.split(/[\\/]/).pop()!, 'utf8') } catch { return undefined } }
function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip)
  if (!value || typeof value !== 'object') return value
  const obj = value as Record<string, unknown>
  if ('particle' in obj && 'items' in obj) return { items: strip(obj.items) }
  if ('t' in obj) return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== 'id' && k !== 'decl').map(([k, v]) => [k, strip(v)]))
  return value
}
describe('real schemas', () => {
  for (const file of files) it(file, async () => {
    const set = await loadSchemaSet(file, read)
    for (const root of set.roots) for (const opts of [{ optional: 'some' as const }, { optional: 'all' as const, maxDepth: 6 }]) {
      const inst = fillSample(createElementInst(root.decl), opts)
      expect(validateInstance(inst), root.id).toEqual([])
      const xml = serializeXml(inst, set)
      const parsed = parseXml(xml, set, root)
      expect(parsed.warnings, root.id).toEqual([])
      expect(strip(parsed.root), root.id).toEqual(strip(inst))
    }
  }, 120000)
  it('imports WorkInfo sample', async () => {
    const set = await loadSchemaSet('WorkInfo.xsd', read)
    const choice = set.roots.find(r => r.decl.name === 'workInfo' && r.kind === 'element')!
    const parsed = parseXml(read('WorkInfo_2025-08-28.xml')!, set, choice)
    console.log('WorkInfo warnings:', parsed.warnings)
  })
})



describe('schema validation with xmllint', () => {
  it('validates generated WorkInfo, CommonTypes and XML Signature documents', async () => {
    const { validateXML } = await import('xmllint-wasm')
    const schemas = Object.fromEntries(files.map(name => [name, read(name)!
      .replace(/schemaLocation="\.\.\/types\/([^"]+)"/g, 'schemaLocation="$1"')
      .replace(/<xs:import[^>]*RandomTest\.xsd[^>]*\/>/g, '')
      .replace('name="workInfo rt"', 'name="workInfo"')]))
    for (const file of ['WorkInfo.xsd', 'CommonTypes.xsd', 'Xmldsig.xsd']) {
      const set = await loadSchemaSet(file, name => schemas[name.split(/[\\/]/).pop()!])
      const globals = set.roots.filter(r => r.kind === 'element')
      const roots = file === 'CommonTypes.xsd' ? globals.slice(0, 30) : globals.filter(r => file !== 'Xmldsig.xsd' || r.decl.name === 'Signature')
      for (const root of roots) for (const optional of ['some', 'all'] as const) {
        const xml = serializeXml(fillSample(createElementInst(root.decl), { optional, maxDepth: 5 }), set)
        const result = await validateXML({
          xml: [{ fileName: 'sample.xml', contents: xml }],
          schema: [schemas[file]],
          preload: files.filter(f => f !== file).map(f => ({ fileName: f, contents: schemas[f] })),
        })
        expect(result.errors, file + ': ' + root.id).toEqual([])
        expect(result.valid, file + ': ' + root.id).toBe(true)
      }
    }
  }, 120000)
})
