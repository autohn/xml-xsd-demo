import { describe, expect, it } from 'vitest'
import { choiceSelect, createElementInst, createItem, createSlot, setIn, slotAdd, slotRemove, updateIn } from '../src/xsd/instance'
import type { ElementDecl, Particle, SimpleTypeDef } from '../src/xsd/model'

const str: SimpleTypeDef = { kind: 'simple', key: 's', ns: '', variety: 'atomic', builtin: 'string', facets: { patterns: [] } }
const leaf: ElementDecl = { key: 'a', name: 'a', ns: '', type: str, global: false }
describe('instance tree', () => {
  it('respects occurrence bounds and immutable updates', () => {
    const p: Particle = { kind: 'element', decl: leaf, min: 1, max: 2 }
    const s = createSlot(p)
    expect(s.items).toHaveLength(1)
    expect(slotRemove(s, 0)).toBe(s)
    expect(slotAdd(slotAdd(s)).items).toHaveLength(2)
    const root = createElementInst(leaf)
    const changed = setIn(root, ['attrs', 'a'], 'value')
    expect(changed.decl).toBe(root.decl)
    expect(root.attrs.a).toBeUndefined()
    expect(updateIn(changed, ['text'], (v: string) => v + 'x').text).toBe('x')
  })
  it('selects a terminating branch and supports changing it', () => {
    const recursive: ElementDecl = { ...leaf, key: 'recursive', name: 'recursive' }
    const choice: Particle = { kind: 'choice', min: 1, max: 1, children: [
      { kind: 'element', decl: recursive, min: 1, max: 1 },
      { kind: 'element', decl: leaf, min: 1, max: 1 },
    ] }
    recursive.type = { kind: 'complex', key: 'r', ns: '', mixed: false, contentKind: 'elements', particle: choice, attributes: [] }
    const item = createItem(choice)
    expect(item.t).toBe('choice')
    if (item.t === 'choice') {
      expect(item.selected).toBe(1)
      expect(choiceSelect(item, 1)).toBe(item)
    }
  })
  it('initialises fixed and default attributes', () => {
    const decl: ElementDecl = { ...leaf, type: { kind: 'complex', key: 'c', ns: '', mixed: false, contentKind: 'empty', attributes: [
      { key: 'a', name: 'a', ns: '', type: str, use: 'optional', fixed: 'fixed' },
      { key: 'b', name: 'b', ns: '', type: str, use: 'optional', default: 'default' },
    ] } }
    expect(createElementInst(decl).attrs).toEqual({ a: 'fixed', b: 'default' })
  })
})
