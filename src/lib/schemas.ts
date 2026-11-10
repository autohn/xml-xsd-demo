import { loadSchemaSet } from '@/xsd/loader'
import type { SchemaSet } from '@/xsd/model'

// The XSD files (and the sample XML) live in the project root; Vite bundles them as lazily loaded raw strings.
const xsdFiles = import.meta.glob('/*.xsd', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>
const xmlFiles = import.meta.glob('/*.xml', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>

const base = (p: string) => p.split('/').pop()!

const xsdByName = new Map(Object.entries(xsdFiles).map(([p, f]) => [base(p), f]))
const xmlByName = new Map(Object.entries(xmlFiles).map(([p, f]) => [base(p), f]))

const PREFERRED_ORDER = ['WorkInfo.xsd', 'BaseDocument.xsd', 'BaseTypes.xsd', 'CommonTypes.xsd', 'Xmldsig.xsd']

export const schemaNames: string[] = [...xsdByName.keys()].sort((a, b) => {
  const ia = PREFERRED_ORDER.indexOf(a)
  const ib = PREFERRED_ORDER.indexOf(b)
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
})

const cache = new Map<string, Promise<SchemaSet>>()

export function loadSchema(name: string): Promise<SchemaSet> {
  let p = cache.get(name)
  if (!p) {
    p = loadSchemaSet(name, async (file) => {
      const loader = xsdByName.get(file)
      return loader ? await loader() : undefined
    })
    // do not cache failures
    p.catch(() => cache.delete(name))
    cache.set(name, p)
  }
  return p
}

/** Sample XML documents lying next to the schemas whose name starts with the schema's base name (WorkInfo.xsd → WorkInfo_2025-08-28.xml). */
export function sampleXmlFor(schemaName: string): { name: string; load: () => Promise<string> } | undefined {
  const stem = schemaName.replace(/\.xsd$/i, '')
  for (const [name, load] of xmlByName) {
    if (name.startsWith(stem)) return { name, load }
  }
  return undefined
}
