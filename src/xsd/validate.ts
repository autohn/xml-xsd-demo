import type { ElementInst, Issue, Inst, Path, SimpleTypeDef, Slot } from './model'
import { pathKey } from './instance'
import { validateSimple } from './datatypes'

function textType(el: ElementInst): SimpleTypeDef | undefined {
  const t = el.decl.type
  return t.kind === 'simple' ? t : t.contentKind === 'simple' ? t.simpleContent : undefined
}
export function validateElementValue(el: ElementInst): string | null {
  if (el.nil && el.decl.nillable) return el.text ? 'Для пустого элемента текст недопустим' : null
  if (el.decl.fixed !== undefined && el.text !== el.decl.fixed) return 'Значение должно быть фиксированным: ' + el.decl.fixed
  const t = textType(el)
  return t ? validateSimple(t, el.text) : null
}
export function validateAttribute(el: ElementInst, attrKey: string): string | null {
  const t = el.decl.type
  const a = t.kind === 'complex' ? t.attributes.find(x => x.key === attrKey) : undefined
  if (!a || a.use === 'prohibited') return null
  const v = el.attrs[attrKey]
  if (v === undefined) return a.use === 'required' || a.fixed !== undefined ? 'Обязательный атрибут не заполнен' : null
  if (a.fixed !== undefined && v !== a.fixed) return 'Значение должно быть фиксированным: ' + a.fixed
  return validateSimple(a.type, v)
}
export function validateInstance(root: ElementInst): Issue[] {
  const issues: Issue[] = [], ids = new Set<string>()
  const add = (path: Path, kind: Issue['kind'], message: string) => issues.push({ path, kind, message })
  function checkId(type: SimpleTypeDef | undefined, value: string, path: Path) {
    if (type?.builtin !== 'ID' || !value || validateSimple(type, value)) return
    if (ids.has(value)) add(path, 'value', 'Идентификатор должен быть уникальным')
    else ids.add(value)
  }
  function element(el: ElementInst, path: Path) {
    if (el.nil && !el.decl.nillable) add(path, 'nil', 'Элемент не может быть пустым')
    const error = validateElementValue(el)
    if (error) add([...path, 'text'], el.nil ? 'nil' : 'value', error)
    if (!el.nil) checkId(textType(el), el.text, [...path, 'text'])
    const t = el.decl.type
    if (t.kind === 'complex') for (const a of t.attributes) {
      const e = validateAttribute(el, a.key), p = [...path, 'attrs', a.key]
      if (e) add(p, 'attribute', e)
      if (el.attrs[a.key] !== undefined) checkId(a.type, el.attrs[a.key], p)
    }
    if (el.content && !el.nil) slot(el.content, [...path, 'content'])
  }
  function slot(s: Slot, path: Path) {
    if (s.items.length < s.particle.min) add(path, 'count', 'Нужно минимум ' + s.particle.min + ' элементов')
    if (s.items.length > s.particle.max) add(path, 'count', 'Не более ' + s.particle.max + ' элементов')
    s.items.forEach((i, n) => inst(i, [...path, 'items', n], s.particle))
  }
  function inst(i: Inst, path: Path, particle: Slot['particle']) {
    if (i.t === 'el') element(i, path)
    else if (i.t === 'seq') i.slots.forEach((s, n) => slot(s, [...path, 'slots', n]))
    else if (i.t === 'choice') {
      if (particle.kind !== 'choice' || !particle.children[i.selected] || i.slot.particle !== particle.children[i.selected]) add(path, 'choice', 'Выберите допустимый вариант')
      else slot(i.slot, [...path, 'slot'])
    } else if (!i.xml.trim()) {
      if (particle.min > 0) add([...path, 'xml'], 'required', 'Заполните XML-фрагмент')
    } else {
      const doc = new DOMParser().parseFromString('<root>' + i.xml + '</root>', 'application/xml')
      if (doc.getElementsByTagName('parsererror').length) add([...path, 'xml'], 'any', 'Некорректный XML-фрагмент')
    }
  }
  element(root, [])
  return issues
}
export function issuesByPath(issues: Issue[]): Map<string, Issue[]> {
  const result = new Map<string, Issue[]>()
  for (const issue of issues) { const key = pathKey(issue.path); result.set(key, [...(result.get(key) ?? []), issue]) }
  return result
}
