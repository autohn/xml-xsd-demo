/**
 * CONTRACT between the XSD loader, the datatype/validation layer, the instance/XML layer and the UI.
 * Pure types, no runtime code (except the BUILTIN_NAMES constant). Do not change without updating all consumers.
 *
 * Pipeline:
 *   XSD text --(loader.ts)--> SchemaSet (resolved, cycle-friendly object graph)
 *   SchemaSet + RootChoice --(instance.ts)--> ElementInst tree (the form state)
 *   ElementInst --(xml.ts)--> XML text      /      XML text --(xml.ts)--> ElementInst
 *   ElementInst --(validate.ts, datatypes.ts/zod)--> Issue[]
 */

// ───────────────────────────── Schema model ─────────────────────────────

/** XSD built-in datatype local names we understand (everything in the xs: namespace that matters). */
export const BUILTIN_NAMES = [
  'anySimpleType', 'anyType',
  'string', 'normalizedString', 'token', 'language', 'Name', 'NCName', 'NMTOKEN', 'NMTOKENS',
  'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'QName', 'NOTATION', 'anyURI',
  'boolean', 'base64Binary', 'hexBinary',
  'decimal', 'integer', 'nonPositiveInteger', 'negativeInteger', 'long', 'int', 'short', 'byte',
  'nonNegativeInteger', 'unsignedLong', 'unsignedInt', 'unsignedShort', 'unsignedByte', 'positiveInteger',
  'float', 'double',
  'duration', 'dateTime', 'time', 'date', 'gYearMonth', 'gYear', 'gMonthDay', 'gDay', 'gMonth',
] as const
export type BuiltinName = (typeof BUILTIN_NAMES)[number]

export interface Facets {
  length?: number
  minLength?: number
  maxLength?: number
  /**
   * XSD-regex patterns (UNANCHORED source text as written in the schema, XSD semantics = implicitly anchored).
   * One array per derivation step that declared patterns: patterns inside one step are OR-ed, steps are AND-ed.
   */
  patterns: string[][]
  /** Allowed lexical values (last restriction that declared an enumeration wins). */
  enumeration?: string[]
  /** xs:documentation of enumeration values, keyed by value (if present in the schema). */
  enumerationDocs?: Record<string, string>
  whiteSpace?: 'preserve' | 'replace' | 'collapse'
  minInclusive?: string
  maxInclusive?: string
  minExclusive?: string
  maxExclusive?: string
  totalDigits?: number
  fractionDigits?: number
}

export interface SimpleTypeDef {
  kind: 'simple'
  /** Clark key `{ns}name` for named types, `anon:<n>` for anonymous ones; unique inside a SchemaSet. */
  key: string
  name?: string
  /** Target namespace of the declaring schema ('' for none / built-ins use the XSD namespace). */
  ns: string
  doc?: string
  variety: 'atomic' | 'list' | 'union'
  /** Nearest built-in ancestor ('string' for list/union varieties and for unresolved types). */
  builtin: BuiltinName
  /** EFFECTIVE facets: the whole derivation chain already merged (see Facets docs). */
  facets: Facets
  itemType?: SimpleTypeDef // variety === 'list'
  memberTypes?: SimpleTypeDef[] // variety === 'union'
}

export interface AttributeDef {
  /** Instance key: `{ns}name` when the attribute is namespace-qualified, else plain `name`. */
  key: string
  name: string
  /** Namespace of the attribute in instances ('' = unqualified, the common case). */
  ns: string
  type: SimpleTypeDef
  use: 'required' | 'optional' | 'prohibited'
  fixed?: string
  default?: string
  doc?: string
}

export interface ParticleBase {
  /** minOccurs (default 1) */
  min: number
  /** maxOccurs (default 1), `Infinity` for "unbounded" */
  max: number
  doc?: string
}

export interface ElementParticle extends ParticleBase {
  kind: 'element'
  decl: ElementDecl
}

export interface GroupParticle extends ParticleBase {
  kind: 'sequence' | 'choice' | 'all'
  children: Particle[]
  /** Set when the particle came from `<xs:group ref="…">` (name of the referenced group). */
  groupName?: string
}

export interface AnyParticle extends ParticleBase {
  kind: 'any'
  /** raw `namespace` attribute, default '##any' */
  namespace: string
  processContents: 'strict' | 'lax' | 'skip'
}

export type Particle = ElementParticle | GroupParticle | AnyParticle

export interface ElementDecl {
  /** `{ns}name` for globals, `<parentTypeKey>/name` for locals – unique inside a SchemaSet. */
  key: string
  /** Local name (already sanitised into a valid NCName – see Diagnostic). */
  name: string
  /** Namespace this element has in INSTANCE documents (global: targetNamespace; local: depends on form/elementFormDefault). '' = no namespace. */
  ns: string
  type: TypeDef
  doc?: string
  nillable?: boolean
  fixed?: string
  default?: string
  abstract?: boolean
  global: boolean
}

export interface ComplexTypeDef {
  kind: 'complex'
  key: string
  name?: string
  ns: string
  doc?: string
  abstract?: boolean
  mixed: boolean
  /** 'empty' | 'simple' (text + attributes) | 'elements' (element-only or mixed content) */
  contentKind: 'empty' | 'simple' | 'elements'
  /** contentKind === 'simple': the text type. */
  simpleContent?: SimpleTypeDef
  /**
   * contentKind === 'elements': FLATTENED content model. complexContent/extension is already expanded:
   * base particle + own particle => `sequence[base, own]` (min=max=1). Restriction uses the restriction's own particle.
   * undefined/absent when the type has no particles.
   */
  particle?: Particle
  /** Own + inherited (extension) attributes, attributeGroup refs expanded, prohibited ones removed. */
  attributes: AttributeDef[]
  /** `<xs:anyAttribute/>` present */
  anyAttribute?: boolean
}

export type TypeDef = SimpleTypeDef | ComplexTypeDef

export interface Diagnostic {
  level: 'info' | 'warning' | 'error'
  /** Schema file the problem belongs to. */
  file: string
  message: string
}

export interface SchemaFile {
  name: string
  targetNamespace: string
  elementFormDefault: 'qualified' | 'unqualified'
  attributeFormDefault: 'qualified' | 'unqualified'
  /** prefix → namespace URI as declared on <xs:schema xmlns:…> ('' key = default namespace). */
  prefixes: Record<string, string>
}

export interface RootChoice {
  /** stable id, e.g. `element:{ns}name` or `type:{ns}name` */
  id: string
  label: string
  kind: 'element' | 'type'
  /** The element to instantiate. For kind 'type' it is synthesised: name = type name, ns = type ns, global=false. */
  decl: ElementDecl
  doc?: string
}

export interface SchemaSet {
  /** File name the user picked (e.g. "WorkInfo.xsd"). */
  entry: string
  files: SchemaFile[]
  elements: Map<string, ElementDecl> // global element declarations, key `{ns}name`
  complexTypes: Map<string, ComplexTypeDef>
  simpleTypes: Map<string, SimpleTypeDef>
  /** Things that can be rendered as a form: global elements + named complex types DECLARED IN THE ENTRY FILE only. */
  roots: RootChoice[]
  /** namespace URI → prefix to use when serialising ('' = default namespace; entry targetNamespace is '' ). */
  prefixes: Record<string, string>
  diagnostics: Diagnostic[]
  stats: {
    files: number
    elementDecls: number
    complexTypes: number
    simpleTypes: number
    /** distinct XSD constructs that were encountered but are not supported (e.g. 'xs:redefine'). */
    unsupported: string[]
  }
}

// ───────────────────────────── Instance model (form state) ─────────────────────────────
// A plain, JSON-like tree of immutable-by-convention objects (structural sharing via setIn/updateIn).
// `decl` / `particle` / `type` properties are references into the SchemaSet (never mutated, never cloned).

/** Path of property keys / array indices that navigates from the root ElementInst to any node. */
export type Path = ReadonlyArray<string | number>

/** One occurrence of an element. */
export interface ElementInst {
  t: 'el'
  id: string
  decl: ElementDecl
  /** Text value: for simple-typed elements and simpleContent complex types (and free text of mixed content). Always a string. */
  text: string
  /** xsi:nil="true" (only when decl.nillable) */
  nil: boolean
  /**
   * Attribute values by AttributeDef.key. Required attributes (and fixed ones) are always present;
   * optional attributes are present only when the user switched them on.
   */
  attrs: Record<string, string>
  /** Content model slot for complex element-only/mixed types: the type's root particle, instantiated. null for simple/empty. */
  content: Slot | null
}

/** All occurrences of ONE particle inside its parent (the repetition list). */
export interface Slot {
  particle: Particle
  /** items.length is within [min,max] by default for required content; optional content starts with 0 items. */
  items: Inst[]
}

/** One occurrence of a sequence/all group: one Slot per child particle, aligned with particle.children. */
export interface SeqInst {
  t: 'seq'
  id: string
  slots: Slot[]
}

/** One occurrence of a choice group: exactly one branch chosen. */
export interface ChoiceInst {
  t: 'choice'
  id: string
  selected: number
  /** Slot of particle.children[selected] */
  slot: Slot
}

/** One occurrence of an xs:any wildcard: raw XML fragment typed by the user. */
export interface AnyInst {
  t: 'any'
  id: string
  xml: string
}

export type Inst = ElementInst | SeqInst | ChoiceInst | AnyInst

export interface Issue {
  /** Path to the offending leaf: [...elementPath,'text'] | [...elementPath,'attrs',key] | slot path for occurrence-count problems | [...,'xml'] for any. */
  path: Path
  kind: 'value' | 'required' | 'count' | 'choice' | 'attribute' | 'any' | 'nil'
  /** Human readable, RUSSIAN. */
  message: string
}
