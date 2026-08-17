import type { CompiledTemplate } from './loader'
import { evaluate } from './render'
import type { ComponentSchema, PropSchema } from '../types'

/**
 * Prop schemas for the property editor: the compiled component's *runtime* `props` object
 * (authoritative for name/required/default) merged with what only the source knows —
 * enum members, the JSDoc description and `@format`.
 */
export function componentSchemas(compiled: CompiledTemplate): ComponentSchema[] {
  const { components } = evaluate(compiled)
  return Object.entries(components).map(([name, component]) => {
    const doc = propsFromSource(compiled.sources[name] ?? '')
    const runtime = (component as { props?: unknown }).props
    const props: PropSchema[] = []

    if (Array.isArray(runtime)) {
      for (const propName of runtime as string[]) props.push({ name: propName, type: 'string', required: false, ...doc[propName] })
    } else if (runtime && typeof runtime === 'object') {
      for (const [propName, def] of Object.entries(runtime as Record<string, { type?: unknown; required?: boolean; default?: unknown }>)) {
        const fromDoc = doc[propName] ?? {}
        props.push({
          name: propName,
          type: fromDoc.type ?? typeFromCtor(def?.type),
          ...(fromDoc.values ? { values: fromDoc.values } : {}),
          required: !!def?.required,
          ...(def?.default !== undefined ? { default: def.default } : {}),
          ...(fromDoc.doc ? { doc: fromDoc.doc } : {}),
          ...(fromDoc.format ? { format: fromDoc.format } : {}),
        })
      }
    }
    return { name, props }
  })
}

function typeFromCtor(ctor: unknown): PropSchema['type'] {
  if (ctor === String) return 'string'
  if (ctor === Number) return 'number'
  if (ctor === Boolean) return 'boolean'
  return 'unknown'
}

type DocProp = { type?: PropSchema['type']; values?: string[]; doc?: string; format?: string }

// ponytail: regex-level parsing of the `defineProps<{ … }>()` type literal. Flat literals
// (what a prop list is) parse fine; nested object types would need the TS parser — add it
// when a component actually needs one.
const DEFINE_PROPS = /defineProps<\s*\{([\s\S]*?)\}\s*>\s*\(/
const MEMBER = /(?:\/\*\*([\s\S]*?)\*\/\s*)?(\w+)(\??)\s*:\s*([^\n;]+)/g

export function propsFromSource(source: string): Record<string, DocProp> {
  const literal = DEFINE_PROPS.exec(source)?.[1]
  if (!literal) return {}
  const out: Record<string, DocProp> = {}
  for (const [, jsdoc, name, , typeText] of literal.matchAll(MEMBER)) {
    const prop: DocProp = { ...parseType(typeText.trim()) }
    if (jsdoc) {
      const lines = jsdoc.split('\n').map((l) => l.replace(/^\s*\*?\s?/, '').trim())
      const format = lines.join(' ').match(/@format\s+(\w+)/)
      if (format) prop.format = format[1]
      const text = lines.join(' ').replace(/@\w+\s+\w+/g, '').trim()
      if (text) prop.doc = text
    }
    out[name] = prop
  }
  return out
}

function parseType(text: string): DocProp {
  if (text === 'string') return { type: 'string' }
  if (text === 'number') return { type: 'number' }
  if (text === 'boolean') return { type: 'boolean' }
  const literals = [...text.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2])
  // A union (or a single member) of string literals is an enum — a select in the editor.
  if (literals.length && text.replace(/'[^']*'|"[^"]*"|\s|\|/g, '') === '') return { type: 'enum', values: literals }
  return { type: 'unknown' }
}
