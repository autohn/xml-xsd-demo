import { z } from 'zod'
import RandExp from 'randexp/dist/randexp.js'
import type { BuiltinName, SimpleTypeDef } from './model'

export type InputKind = 'text'|'textarea'|'integer'|'decimal'|'boolean'|'date'|'datetime'|'time'|'month'|'year'|'select'|'multiselect'|'binary'|'uri'|'duration'
export interface InputHint { kind: InputKind; options?: {value: string; label?: string}[]; min?: string; max?: string; step?: string; maxLength?: number; minLength?: number; placeholder?: string; inputMode?: 'text'|'numeric'|'decimal'|'url'; hints: string[] }

const integerTypes = new Set(['integer','nonPositiveInteger','negativeInteger','long','int','short','byte','nonNegativeInteger','unsignedLong','unsignedInt','unsignedShort','unsignedByte','positiveInteger'])
const numericTypes = new Set([...integerTypes, 'decimal', 'float', 'double'])
const ranges: Record<string, [string | undefined, string | undefined]> = {
 nonPositiveInteger:[undefined,'0'], negativeInteger:[undefined,'-1'], nonNegativeInteger:['0',undefined], positiveInteger:['1',undefined],
 long:['-9223372036854775808','9223372036854775807'], int:['-2147483648','2147483647'], short:['-32768','32767'], byte:['-128','127'],
 unsignedLong:['0','18446744073709551615'], unsignedInt:['0','4294967295'], unsignedShort:['0','65535'], unsignedByte:['0','255'],
}
export function defaultWhiteSpace(b: BuiltinName): 'preserve'|'replace'|'collapse' { return b === 'string' || b === 'anySimpleType' || b === 'anyType' ? 'preserve' : b === 'normalizedString' ? 'replace' : 'collapse' }
export function effectiveWhiteSpace(t: SimpleTypeDef): 'preserve'|'replace'|'collapse' { return t.facets.whiteSpace ?? (t.variety === 'atomic' ? defaultWhiteSpace(t.builtin) : 'collapse') }
export function normalizeValue(t: SimpleTypeDef, raw: string): string { const w = effectiveWhiteSpace(t); if (w === 'preserve') return raw; const s = raw.replace(/[\t\n\r]/g, ' '); return w === 'collapse' ? s.replace(/ +/g,' ').trim() : s }

const blocks: Record<string,string> = {BasicLatin:'\\x00-\\x7F', Latin1Supplement:'\\x80-\\xFF', Cyrillic:'\\u0400-\\u04FF', Greek:'\\u0370-\\u03FF', GreekandCoptic:'\\u0370-\\u03FF', CJKUnifiedIdeographs:'\\u4E00-\\u9FFF'}
const warned = new Set<string>()
export function xsdPatternToRegExp(pattern: string): RegExp {
 try {
  let p = pattern.replace(/\\([pP])\{Is([^}]+)\}/g, (_m, polarity: string, block: string) => { if (!blocks[block]) throw new Error('unknown block'); return `[${polarity === 'P' ? '^' : ''}${blocks[block]}]` })
  p = p.replace(/\[([^\[\]]+)-\[([^\[\]]+)\]\]/g, '(?![$2])[$1]')
  p = p.replace(/\\([iIcC])/g, (_m, c: string) => { const chars = c.toLowerCase() === 'i' ? '\\p{L}_:' : '\\p{L}\\p{N}\\p{M}_.:\\-'; return `[${c === c.toUpperCase() ? '^' : ''}${chars}]` })
  let inClass = false, escaped = false, out = ''
  for (const ch of p) { if (escaped) { out += ch; escaped = false; continue } if (ch === '\\') { out += ch; escaped = true; continue } if (ch === '[') inClass = true; if (ch === ']') inClass = false; out += !inClass && (ch === '^' || ch === '$') ? `\\${ch}` : ch === '.' && !inClass ? '[^\\r\\n]' : ch }
  return new RegExp(`^(?:${out})$`, 'u')
 } catch { if (!warned.has(pattern)) { warned.add(pattern); console.warn(`Не удалось разобрать шаблон XSD: ${pattern}`) } return /^[\s\S]*$/u }
}
function decimalParts(value: string): { n: bigint; scale: number } | null { const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(value); if (!m || !(m[2] || m[3])) return null; const f = m[3] || ''; return { n: BigInt((m[1] === '-' ? '-' : '') + ((m[2] || '0') + f)), scale: f.length } }
function compareNumber(a: string, b: string): number | null { const x=decimalParts(a), y=decimalParts(b); if (x && y) { const scale=Math.max(x.scale,y.scale); const left=x.n*10n**BigInt(scale-x.scale), right=y.n*10n**BigInt(scale-y.scale); return left < right ? -1 : left > right ? 1 : 0 } const n=Number(a.replace('INF','Infinity')), m=Number(b.replace('INF','Infinity')); return Number.isNaN(n) || Number.isNaN(m) ? null : n < m ? -1 : n > m ? 1 : 0 }
const zone = '(?:Z|[+-](?:0\\d|1[0-4]):[0-5]\\d)?'
function validZone(s: string): boolean { return !/[+-]14:(?!00)\d\d$/.test(s) }
function leap(y: bigint): boolean { return y % 4n === 0n && (y % 100n !== 0n || y % 400n === 0n) }
function calendar(y: string, m: number, d: number): boolean { if (BigInt(y) === 0n || m < 1 || m > 12 || d < 1) return false; return d <= [31,leap(BigInt(y))?29:28,31,30,31,30,31,31,30,31,30,31][m-1] }
function timeValid(h: number, m: number, s: number): boolean { return m < 60 && s < 60 && (h < 24 || (h === 24 && m === 0 && s === 0)) }
function dateLexical(b: string, v: string): boolean {
 if (!validZone(v)) return false
 let m: RegExpExecArray | null
 if (b === 'dateTime') { m = new RegExp(`^(-?\\d{4,})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2}(?:\\.\\d+)?)${zone}$`).exec(v); return !!m && calendar(m[1],+m[2],+m[3]) && timeValid(+m[4],+m[5],+m[6]) }
 if (b === 'date') { m = new RegExp(`^(-?\\d{4,})-(\\d{2})-(\\d{2})${zone}$`).exec(v); return !!m && calendar(m[1],+m[2],+m[3]) }
 if (b === 'time') { m = new RegExp(`^(\\d{2}):(\\d{2}):(\\d{2}(?:\\.\\d+)?)${zone}$`).exec(v); return !!m && timeValid(+m[1],+m[2],+m[3]) }
 if (b === 'gYearMonth') { m = new RegExp(`^(-?\\d{4,})-(\\d{2})${zone}$`).exec(v); return !!m && BigInt(m[1]) !== 0n && +m[2]>=1 && +m[2]<=12 }
 if (b === 'gYear') { m = new RegExp(`^(-?\\d{4,})${zone}$`).exec(v); return !!m && BigInt(m[1]) !== 0n }
 if (b === 'gMonthDay') { m = new RegExp(`^--(\\d{2})-(\\d{2})${zone}$`).exec(v); return !!m && calendar('2000',+m[1],+m[2]) }
 if (b === 'gDay') { m = new RegExp(`^---(\\d{2})${zone}$`).exec(v); return !!m && +m[1]>=1 && +m[1]<=31 }
 if (b === 'gMonth') { m = new RegExp(`^--(\\d{2})(?:--)?${zone}$`).exec(v); return !!m && +m[1]>=1 && +m[1]<=12 }
 return false
}
const dates = new Set(['dateTime','date','time','gYearMonth','gYear','gMonthDay','gDay','gMonth'])
const nameStart = '[\\p{L}\\p{Nl}_:]'; const nameChar = '[\\p{L}\\p{Nl}\\p{N}\\p{M}_.:\\-\\u00B7]'
const ncStart = '[\\p{L}\\p{Nl}_]'; const ncChar = '[\\p{L}\\p{Nl}\\p{N}\\p{M}_.\\-\\u00B7]'
function lexical(b: BuiltinName, v: string): boolean {
 if (integerTypes.has(b)) { if (!/^[+-]?\d+$/.test(v)) return false; const [lo,hi]=ranges[b] || []; return (!lo || BigInt(v)>=BigInt(lo)) && (!hi || BigInt(v)<=BigInt(hi)) }
 if (b === 'decimal') return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)
 if (b === 'float' || b === 'double') return /^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|INF|-INF|NaN)$/.test(v)
 if (b === 'boolean') return /^(true|false|1|0)$/.test(v)
 if (dates.has(b)) return dateLexical(b,v)
 if (b === 'duration') return /^-?P(?=\d|T\d)(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/.test(v)
 if (b === 'anyURI') return !/[\s\p{Cc}]/u.test(v)
 if (b === 'hexBinary') return /^(?:[0-9a-fA-F]{2})*$/.test(v)
 if (b === 'base64Binary') return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v.replace(/ /g,'')) && (!v.replace(/ /g,'').endsWith('==') || /[AQgw]==$/.test(v.replace(/ /g,''))) && (!v.replace(/ /g,'').endsWith('=') || v.replace(/ /g,'').endsWith('==') || /[AEIMQUYcgkosw048]=$/.test(v.replace(/ /g,'')))
 if (b === 'language') return /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/.test(v)
 if (b === 'Name') return new RegExp(`^${nameStart}${nameChar}*$`,'u').test(v)
 if (['NCName','ID','IDREF','ENTITY'].includes(b)) return new RegExp(`^${ncStart}${ncChar}*$`,'u').test(v)
 if (b === 'NMTOKEN') return new RegExp(`^${nameChar}+$`,'u').test(v)
 if (['NMTOKENS','IDREFS','ENTITIES'].includes(b)) return !!v && v.split(' ').every(x => lexical(b === 'NMTOKENS' ? 'NMTOKEN' : 'NCName',x))
 if (b === 'QName' || b === 'NOTATION') return new RegExp(`^(?:${ncStart}${ncChar}*:)?${ncStart}${ncChar}*$`,'u').test(v)
 return true
}
function measure(t: SimpleTypeDef, v: string): number { if (t.variety === 'list' || ['NMTOKENS','IDREFS','ENTITIES'].includes(t.builtin)) return v ? v.split(' ').length : 0; if (t.builtin === 'hexBinary') return v.length/2; if (t.builtin === 'base64Binary') { const s=v.replace(/ /g,''); return s.length/4*3-(s.endsWith('==')?2:s.endsWith('=')?1:0) } return Array.from(v).length }
function equalValue(t: SimpleTypeDef, a: string, b: string): boolean { if (numericTypes.has(t.builtin)) return compareNumber(a,b) === 0; if (t.builtin === 'boolean') return (a === 'true' || a === '1') === (b === 'true' || b === '1'); return a === b }
function compare(t: SimpleTypeDef, a: string, b: string): number | null { if (numericTypes.has(t.builtin)) return compareNumber(a,b); if (dates.has(t.builtin)) { const parse=(s:string) => Date.parse((t.builtin === 'time' ? '2000-01-01T'+s : s) + (/(?:Z|[+-]\d\d:\d\d)$/.test(s) ? '' : 'Z')); const x=parse(a), y=parse(b); return Number.isNaN(x)||Number.isNaN(y) ? null : x<y?-1:x>y?1:0 } return a < b ? -1 : a > b ? 1 : 0 }
function lexicalMessage(b: BuiltinName): string { if (integerTypes.has(b)) return 'Ожидается целое число в допустимом диапазоне'; if (numericTypes.has(b)) return 'Ожидается число'; if (b === 'date') return 'Ожидается дата в формате ГГГГ-ММ-ДД'; if (dates.has(b)) return 'Недопустимая дата или время'; if (b === 'boolean') return 'Ожидается логическое значение'; return 'Недопустимый формат значения' }
const cache = new WeakMap<SimpleTypeDef,z.ZodType<string>>()
export function zodForSimpleType(t: SimpleTypeDef): z.ZodType<string> {
 const cached=cache.get(t); if (cached) return cached
 const patterns=t.facets.patterns.map(step => step.map(xsdPatternToRegExp))
 const schema=z.string().transform(v=>normalizeValue(t,v)).superRefine((v,ctx)=> {
  const fail=(message:string)=>ctx.addIssue({code:'custom',message})
  const f=t.facets
  let valid = t.variety === 'union' ? (t.memberTypes ?? []).some(m=>validateSimple(m,v) === null) : t.variety === 'list' ? (!!t.itemType && (!v || v.split(' ').every(item=>validateSimple(t.itemType!,item) === null))) : lexical(t.builtin,v)
  if (!valid) { fail(v === '' ? 'Обязательное поле' : lexicalMessage(t.builtin)); return }
  const len=measure(t,v)
  if (f.length !== undefined && len !== f.length) fail(`Длина — ${f.length} симв. (сейчас ${len})`)
  if (f.minLength !== undefined && len < f.minLength) fail(v === '' ? 'Обязательное поле' : `Минимальная длина — ${f.minLength} симв. (сейчас ${len})`)
  if (f.maxLength !== undefined && len > f.maxLength) fail(`Максимальная длина — ${f.maxLength} симв.`)
  if (f.enumeration && !f.enumeration.some(x=>equalValue(t,v,normalizeValue(t,x)))) fail(v === '' ? 'Обязательное поле' : `Недопустимое значение. Допустимо: ${f.enumeration.slice(0,5).join(', ')}${f.enumeration.length>5?'…':''}`)
  patterns.forEach((step,i)=> { if (!step.some(p=>p.test(v))) { const hint=t.doc?.match(/Допустимый формат:\s*([^\r\n]+)/i)?.[1]; fail(v === '' ? 'Обязательное поле' : hint ? `Не соответствует формату: ${hint}` : exampleMessage(t)) } })
  for (const [key, label, predicate] of [ ['minInclusive','не меньше',(n:number)=>n<0], ['maxInclusive','не больше',(n:number)=>n>0], ['minExclusive','больше',(n:number)=>n<=0], ['maxExclusive','меньше',(n:number)=>n>=0] ] as const) { const bound=f[key]; if (bound !== undefined) { const c=compare(t,v,bound); if (c !== null && predicate(c)) fail(`Значение должно быть ${label} ${bound}`) } }
  if (f.totalDigits !== undefined || f.fractionDigits !== undefined) { const d=decimalParts(v); if (d) { let digits=(d.n<0n?-d.n:d.n).toString(); let scale=d.scale; while (scale>0 && digits.endsWith('0')) { digits=digits.slice(0,-1); scale-- } const total=Math.max(1,digits.length); if (f.totalDigits !== undefined && total>f.totalDigits) fail(`Всего цифр не более ${f.totalDigits}`); if (f.fractionDigits !== undefined && scale>f.fractionDigits) fail(`Дробных цифр не более ${f.fractionDigits}`) } }
 })
 cache.set(t,schema); return schema
}
export function validateSimple(t: SimpleTypeDef, raw: string): string | null { const r=zodForSimpleType(t).safeParse(raw); return r.success ? null : r.error.issues[0]?.message ?? 'Недопустимое значение' }
export function allowsEmpty(t: SimpleTypeDef): boolean { return validateSimple(t,'') === null }
export function inputHintFor(t: SimpleTypeDef): InputHint {
 const b=t.builtin, f=t.facets; let kind: InputKind = 'text'; const hints: string[]=[]
 if (f.enumeration) kind='select'; else if (t.variety === 'list') hints.push('значения через пробел'); else if (b==='boolean') kind='boolean'; else if (integerTypes.has(b)) kind='integer'; else if (numericTypes.has(b)) kind='decimal'; else if (b==='date') kind='date'; else if (b==='dateTime') kind='datetime'; else if (b==='time') kind='time'; else if (b==='gYearMonth') kind='month'; else if (b==='gYear') kind='year'; else if (b==='anyURI') kind='uri'; else if (b==='duration') kind='duration'; else if (b==='base64Binary'||b==='hexBinary') kind='binary'
 if (f.length !== undefined) hints.push(`${f.length} символов`); else { if (f.minLength !== undefined) hints.push(`от ${f.minLength} символов`); if (f.maxLength !== undefined) hints.push(`до ${f.maxLength} символов`) }
 if (kind === 'date') hints.push('формат ГГГГ-ММ-ДД'); if (kind === 'datetime') hints.push('формат ГГГГ-ММ-ДДTчч:мм:сс')
 const min=f.minInclusive ?? f.minExclusive ?? ranges[b]?.[0], max=f.maxInclusive ?? f.maxExclusive ?? ranges[b]?.[1]
 if (min !== undefined) hints.push(`${f.minExclusive !== undefined ? 'больше' : 'от'} ${min}`); if (max !== undefined) hints.push(`${f.maxExclusive !== undefined ? 'меньше' : 'до'} ${max}`)
 return {kind, hints, ...(f.enumeration ? {options:f.enumeration.map(value=>({value,label:f.enumerationDocs?.[value]?.split(/\r?\n/)[0] || value}))} : {}), ...(min !== undefined ? {min}:{}), ...(max !== undefined ? {max}:{}), ...(kind === 'integer' ? {step:'1',inputMode:'numeric' as const} : kind === 'decimal' ? {step:'any',inputMode:'decimal' as const} : kind === 'uri' ? {inputMode:'url' as const} : {}), ...(f.maxLength !== undefined ? {maxLength:f.maxLength}:{}), ...(f.minLength !== undefined ? {minLength:f.minLength}:{}) }
}
export function toInputValue(t: SimpleTypeDef, raw: string): string { const v=normalizeValue(t,raw); if (t.builtin === 'boolean') return v === '1' ? 'true' : v === '0' ? 'false' : v; if (t.builtin === 'dateTime' || t.builtin === 'date' || t.builtin === 'time' || t.builtin === 'gYearMonth') return v.replace(/(?:Z|[+-]\d\d:\d\d)$/,''); return v }
export function fromInputValue(t: SimpleTypeDef, v: string): string { if ((t.builtin === 'dateTime' || t.builtin === 'time') && /(?:^|T)\d\d:\d\d$/.test(v)) return v+':00'; return v }
export function typeLabel(t: SimpleTypeDef): string { if (/guid|uuid/i.test(t.name ?? '')) return 'GUID'; if (t.variety === 'list') return 'список'; if (t.variety === 'union') return 'значение'; const b=t.builtin; if (integerTypes.has(b)) return 'целое число'; if (numericTypes.has(b)) return 'число'; const labels: Partial<Record<BuiltinName,string>>={boolean:'логическое значение',date:'дата',dateTime:'дата и время',time:'время',anyURI:'адрес',base64Binary:'двоичные данные',hexBinary:'двоичные данные',duration:'длительность'}; return labels[b] ?? 'строка' }
let inExample = false
function exampleMessage(t: SimpleTypeDef): string { if (inExample) return 'Не соответствует формату'; inExample = true; try { const ex = sampleValue(t, { seed: 7 }); if (ex) return `Не соответствует формату, например: ${ex}` } catch { /* fall through */ } finally { inExample = false } return 'Не соответствует формату' }
export function sampleValue(t: SimpleTypeDef, opts: {seed?: number; name?: string; index?: number} = {}): string {
 let state=(opts.seed ?? 1) >>> 0; const rand=(min:number,max:number)=>{ state=(Math.imul(state,1664525)+1013904223)>>>0; return min+state%(max-min+1) }; const f=t.facets
 const tryValues:string[]=[]
 if (f.enumeration?.length) { const index=Math.abs(opts.index ?? opts.seed ?? 0)%f.enumeration.length; tryValues.push(...f.enumeration.slice(index),...f.enumeration.slice(0,index)) }
 if (t.variety === 'union') for (const member of t.memberTypes ?? []) tryValues.push(sampleValue(member,opts))
 if (t.variety === 'list' && t.itemType) { const item=sampleValue(t.itemType,opts); const count=f.length ?? Math.max(1,f.minLength ?? 1); tryValues.push(Array(count).fill(item).join(' ')) }
 for (const p of f.patterns[0] ?? []) { try { const regex=xsdPatternToRegExp(p); const gen=new RandExp(regex); gen.randInt=rand; for(let i=0;i<50;i++) tryValues.push(gen.gen()) } catch { /* invalid patterns are ignored by the validator */ } }
 const b=t.builtin
 if (integerTypes.has(b) || b === 'decimal') {
  const scale=b === 'decimal' ? Math.min(f.fractionDigits ?? 2, 8) : 0
  for (const bound of [f.minInclusive,f.minExclusive,f.maxInclusive,f.maxExclusive,ranges[b]?.[0],ranges[b]?.[1]]) if (bound !== undefined) { tryValues.push(bound); const d=decimalParts(bound); if (d) { const s=Math.max(scale,d.scale), n=d.n*10n**BigInt(s-d.scale); for (const delta of [-1n,1n]) { const x=n+delta, sign=x<0n?'-':'', digits=(x<0n?-x:x).toString().padStart(s+1,'0'); tryValues.push(sign+(s?digits.slice(0,-s)+'.'+digits.slice(-s):digits)) } } }
  tryValues.push('0','1','-1','0.01','10','100')
 } else if (b==='float'||b==='double') tryValues.push('0','1','-1','1.5')
 else if (b==='boolean') tryValues.push('true','false')
 else if (b==='date') tryValues.push(new Date().toISOString().slice(0,10),f.minInclusive ?? '',f.maxInclusive ?? '','2000-01-01')
 else if (b==='dateTime') tryValues.push(new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),f.minInclusive ?? '',f.maxInclusive ?? '','2000-01-01T00:00:00Z')
 else if (b==='time') tryValues.push('12:00:00',f.minInclusive ?? '',f.maxInclusive ?? '')
 else if (b==='gYearMonth') tryValues.push('2024-01'); else if (b==='gYear') tryValues.push('2024'); else if (b==='gMonthDay') tryValues.push('--01-01'); else if (b==='gDay') tryValues.push('---01'); else if (b==='gMonth') tryValues.push('--01'); else if (b==='duration') tryValues.push('P1D'); else if (b==='base64Binary') tryValues.push('QQ=='); else if (b==='hexBinary') tryValues.push('00'); else if (b==='anyURI') tryValues.push('https://example.com'); else if (b==='language') tryValues.push('ru'); else if (['NMTOKENS','IDREFS','ENTITIES'].includes(b)) tryValues.push('item')
 const preferred=/date/i.test(opts.name ?? '') ? '2024-01-01' : /number/i.test(opts.name ?? '') ? '123' : /id/i.test(opts.name ?? '') ? 'id1' : 'Образец'
 const length=f.length ?? f.minLength ?? 0; let str=preferred; while(Array.from(str).length<length) str+='а'; if (f.length !== undefined || f.maxLength !== undefined) str=Array.from(str).slice(0,f.length ?? f.maxLength).join(''); tryValues.push(str,'a','1','')
 return tryValues.find(v=>validateSimple(t,v) === null) ?? tryValues[0] ?? ''
}


