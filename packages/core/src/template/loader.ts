import {
  parse,
  compileScript,
  compileStyle,
  compileTemplate as compileVueTemplate,
  type SFCDescriptor,
} from '@vue/compiler-sfc'
import { transform } from 'sucrase'
import { LIBRARY_NAMES, librarySources } from '../library/index'
import { validateSubset } from '../subset'
import type { Message, Meta } from '../types'
import { parseMeta } from './meta'

/** Modules the compiled template code may import. Anything else is a compile error. */
export const ALLOWED_MODULES = ['vue', 'pressed', 'qrcode'] as const

export type ParsedSnippet = {
  name: string
  source: string
  descriptor: SFCDescriptor
  /** Add this to an offset in `source` to get the offset in the *file* (spec: one model, one truth). */
  locBase: number
  /**
   * Add this to a line in `source` to get the line the editor counts from — the one after the
   * `<snippet …>` tag. Negative: the synthetic wrapper puts the body one line down (two with a
   * `props` declare), and the body's own leading newline is the open-tag line's tail.
   */
  lineBase: number
}

export type ParsedTemplate = {
  meta: Meta
  main: SFCDescriptor
  snippets: ParsedSnippet[]
  errors: Message[]
}

export type CompiledTemplate = {
  /** ES-module *text*; evaluate with `new Function('__modules__', code)` → `{ main, components }`. */
  code: string
  css: string
  meta: Meta
  errors: Message[]
  /** SFC source per registered component name (library + snippets) — feeds `componentSchemas`. */
  sources: Record<string, string>
}

// ---------------------------------------------------------------- parse

/**
 * Split a template file into its `<meta>` JSON, the main SFC and the `<snippet>` blocks.
 * A snippet whose body has no top-level `<template>` is the shorthand form: the body *is*
 * the template and `props="a b"` declares string props (spec §4.1).
 */
export function parseTemplate(source: string): ParsedTemplate {
  const errors: Message[] = []
  const { descriptor, errors: parseErrors } = parse(source, { filename: 'main.vue' })
  for (const e of parseErrors) errors.push(toMessage(e, 'main'))

  const snippets: ParsedSnippet[] = []
  const seen = new Set<string>()

  const { meta, error: metaError } = parseMeta(source)
  if (metaError) errors.push({ kind: 'compile', ...metaError, file: 'main' })

  for (const block of descriptor.customBlocks) {
    if (block.type === 'snippet') {
      const name = String(block.attrs.name ?? '')
      const file = `snippet:${name}`
      if (!name) {
        errors.push({ kind: 'compile', message: '<snippet> needs a name attribute', file: 'main', line: block.loc.start.line })
        continue
      }
      if (LIBRARY_NAMES.includes(name)) {
        errors.push({ kind: 'compile', message: `snippet "${name}" clashes with the library component of the same name`, file: 'main', line: block.loc.start.line })
        continue
      }
      // Components, tabs and virtual models are all keyed by name: a repeat would silently
      // overwrite the first definition, so every duplicate after the first is fatal.
      if (seen.has(name)) {
        errors.push({ kind: 'compile', message: `snippet "${name}" is defined twice — snippet names must be unique`, file: 'main', line: block.loc.start.line })
        continue
      }
      seen.add(name)
      if (/<snippet[\s>]/.test(block.content)) {
        errors.push({ kind: 'compile', message: `snippet "${name}" contains a nested <snippet> — snippets may not nest`, file, line: 1 })
        continue
      }
      const snippetSource = snippetToSfc(block.content, block.attrs.props)
      const parsedSnippet = parse(snippetSource, { filename: `${name}.vue` })
      for (const e of parsedSnippet.errors) errors.push(toMessage(e, file))
      // The wrapper (shorthand form) keeps the body verbatim, so finding it gives the shift
      // from snippet-source offsets back to file offsets.
      const bodyAt = snippetSource.indexOf(block.content)
      const locBase = block.loc.start.offset - bodyAt
      // ponytail: exact for a body that starts on its own line (every snippet the app writes);
      // a one-line `<snippet>…</snippet>` reads a column off, still inside its own line.
      const lineBase = -snippetSource.slice(0, bodyAt).split('\n').length
      snippets.push({ name, source: snippetSource, descriptor: parsedSnippet.descriptor, locBase, lineBase })
    }
  }

  return { meta, main: descriptor, snippets, errors }
}

/** Shorthand snippets get a synthetic `<script setup>`/`<template>` wrapper; full ones pass through. */
function snippetToSfc(body: string, props: string | true | undefined): string {
  if (parse(body).descriptor.template) return body
  const names = typeof props === 'string' ? props.trim().split(/\s+/).filter(Boolean) : []
  const declare = names.length ? `<script setup>defineProps(${JSON.stringify(names)})</script>\n` : ''
  return `${declare}<template>${body}</template>`
}

// ---------------------------------------------------------------- purity

const IMPURE = /\b(onMounted|onUpdated|onUnmounted|watch\(|watchEffect|fetch\(|window\.|document\.|setTimeout|setInterval|XMLHttpRequest)/

/** Templates render to static HTML, so effects and browser APIs are pointless — warn, don't block (design §7.4). */
function lintPurity(script: string, file: string, lineBase: number, out: Message[]) {
  script.split('\n').forEach((text, i) => {
    const hit = IMPURE.exec(text)
    if (hit) out.push({ kind: 'purity', message: `${hit[1].replace(/\($/, '')} is not allowed in a template — templates render to static HTML`, file, line: lineBase + i, col: hit.index + 1 })
  })
}

// ---------------------------------------------------------------- compile

export type CompileOptions = {
  /** Add `data-loc="start:end"` (offsets into the file) to every element of the template. */
  inspector?: boolean
}

export function compileTemplate(source: string, opts: CompileOptions = {}): CompiledTemplate {
  const parsed = parseTemplate(source)
  const errors = [...parsed.errors]
  const css: string[] = []
  const blocks: string[] = []

  // Library first: the `pressed` module is topped up with them so snippets and the main
  // template can use (and import) them.
  const libNames: string[] = []
  const sources: Record<string, string> = {}
  for (const [name, libSource] of Object.entries(librarySources)) {
    blocks.push(`__components__[${JSON.stringify(name)}] = ${compileComponent(libSource, name, `library:${name}`, errors, css, false)};`)
    sources[name] = libSource
    libNames.push(name)
  }
  blocks.push(`Object.assign(__modules__['pressed'], __components__);`)

  // The subset check is the user's markup and CSS only — the library is ours and is exempt
  // by construction (it is compiled from the same sources every template gets).
  errors.push(...validateSubset(parsed.main, 'main'))

  for (const snippet of parsed.snippets) {
    errors.push(...validateSubset(snippet.descriptor, `snippet:${snippet.name}`, snippet.lineBase))
    blocks.push(`__components__[${JSON.stringify(snippet.name)}] = ${compileComponent(snippet.source, snippet.name, `snippet:${snippet.name}`, errors, css, opts.inspector ? snippet.locBase : false)};`)
    sources[snippet.name] = snippet.source
  }

  // The main SFC is compiled from the original file so <template>/<script>/<style> offsets
  // (and therefore data-loc) stay absolute; the custom blocks are ignored by compiler-sfc.
  const mainSource = parsed.main.template || parsed.main.scriptSetup || parsed.main.script ? source : '<template></template>'
  const main = compileComponent(mainSource, 'main', 'main', errors, css, opts.inspector ? 0 : false)

  const code = [
    'const __components__ = {};',
    ...blocks,
    `const __main__ = ${main};`,
    'return { main: __main__, components: __components__, libraryNames: ' + JSON.stringify(libNames) + ' };',
  ].join('\n')

  return { code, css: css.join('\n'), meta: parsed.meta, errors, sources }
}

/**
 * Compile one SFC to an *expression* that evaluates to a component object.
 * Returns `(function(){ … return __sfc__ })()` so several components can live in one module text.
 */
function compileComponent(
  source: string,
  name: string,
  file: string,
  errors: Message[],
  css: string[],
  /** Offset of this SFC inside the file, or `false` for no inspector attributes at all. */
  locBase: number | false,
): string {
  const id = `pressed-${name.replace(/[^\w-]/g, '_')}`
  const scopeAttr = `data-v-${id}`
  try {
    const { descriptor, errors: parseErrors } = parse(source, { filename: `${name}.vue` })
    for (const e of parseErrors) errors.push(toMessage(e, file))

    for (const script of [descriptor.script, descriptor.scriptSetup])
      if (script) lintPurity(script.content, file, script.loc.start.line, errors)

    const scoped = descriptor.styles.some((s) => s.scoped)
    // data-loc offsets must be absolute in the *file*, so add where this SFC starts (0 for the
    // main one, the snippet's own offset for a snippet). What comes on top differs per branch:
    // `compileScript` inlines the AST `parse()` already built from the whole SFC, so those node
    // offsets count from the SFC's start; a standalone template compile only sees the
    // <template> body and counts from there.
    const inline = !!(descriptor.scriptSetup || descriptor.script)
    const base = (locBase === false ? 0 : locBase) + (inline ? 0 : descriptor.template?.loc.start.offset ?? 0)
    const compilerOptions = {
      scopeId: scoped ? scopeAttr : undefined,
      nodeTransforms: locBase === false ? [] : [locTransform(base)],
    }

    let body: string
    if (inline) {
      body = compileScript(descriptor, { id, inlineTemplate: true, templateOptions: { compilerOptions } }).content
    } else {
      const t = compileVueTemplate({ source: descriptor.template?.content ?? '', filename: `${name}.vue`, id, compilerOptions })
      for (const e of t.errors) errors.push(toMessage(e, file))
      body = `${t.code}\nexport default { render }`
    }

    for (const style of descriptor.styles) {
      const out = compileStyle({ source: style.content, filename: `${name}.vue`, id: scopeAttr, scoped: style.scoped })
      for (const e of out.errors) errors.push({ kind: 'compile', message: msg(e), file, line: style.loc.start.line })
      css.push(out.code)
    }

    const js = rewriteModule(transform(body, { transforms: ['typescript'], filePath: `${name}.vue` }).code, file, errors)
    const scopeLine = scoped ? `__sfc__.__scopeId = ${JSON.stringify(scopeAttr)};` : ''
    return `(function(){\n${js}\n${scopeLine}\nreturn __sfc__;\n})()`
  } catch (e) {
    errors.push({ kind: 'compile', message: msg(e), file, ...locOf(e) })
    return '{ render(){ return null } }'
  }
}

/**
 * `data-loc="start:end"` on every element node, so a canvas click maps back to source.
 * A *component* call site gets `data-inst` instead: its value falls through onto the
 * component's root element, which already carries its own `data-loc` from the snippet's
 * own compile — two names, so neither overwrites the other.
 */
function locTransform(base: number) {
  return (node: { type: number; tagType?: number; props?: unknown[]; loc: { start: { offset: number }; end: { offset: number } } }) => {
    if (node.type !== 1 /* NodeTypes.ELEMENT */) return
    node.props?.push({
      type: 6, // NodeTypes.ATTRIBUTE
      name: node.tagType === 1 /* COMPONENT */ ? 'data-inst' : 'data-loc',
      nameLoc: node.loc,
      value: { type: 2 /* TEXT */, content: `${base + node.loc.start.offset}:${base + node.loc.end.offset}`, loc: node.loc },
      loc: node.loc,
    })
  }
}

// ---------------------------------------------------------------- module text rewriting

// Not anchored to line starts: sucrase prepends its helper functions on the same line as
// the first import, so `^import` would miss it.
const IMPORT_RE = /(^|[};\s])import\s+(?:(\*\s+as\s+\w+)|(\{[\s\S]*?\})|(\w+))?\s*(?:from\s*)?['"]([^'"]+)['"];?/g
const EXPORT_DEFAULT_RE = /(^|[};\s])export\s+default\s+/
const EXPORT_RE = /(^|[};\s])export\s+(?=(function|const|let|var|class|async)\b)/g

/**
 * `new Function` bodies cannot contain `import`/`export`, so imports of the modules we provide
 * become destructuring from `__modules__` and `export default` becomes a local binding.
 */
function rewriteModule(code: string, file: string, errors: Message[]): string {
  let out = code.replace(IMPORT_RE, (_whole: string, lead: string, star: string, named: string, def: string, from: string) => {
    if (!(ALLOWED_MODULES as readonly string[]).includes(from)) {
      errors.push({ kind: 'compile', message: `cannot import ${JSON.stringify(from)} — templates may only import ${ALLOWED_MODULES.join(', ')}`, file })
      return lead
    }
    const mod = `__modules__[${JSON.stringify(from)}]`
    if (star) return `${lead}const ${star.replace(/^\*\s+as\s+/, '')} = ${mod};`
    if (named) return `${lead}const ${named.replace(/(\w+)\s+as\s+(\w+)/g, '$1: $2')} = ${mod};`
    if (def) return `${lead}const ${def} = ${mod}.default ?? ${mod};`
    return lead // bare side-effect import
  })
  out = out.replace(EXPORT_DEFAULT_RE, '$1const __sfc__ = ')
  out = out.replace(EXPORT_RE, '$1')
  if (!/const __sfc__ =/.test(out)) out += '\nconst __sfc__ = {};'
  return out
}

// ---------------------------------------------------------------- helpers

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function locOf(e: unknown): { line?: number; col?: number } {
  const loc = (e as { loc?: { start?: { line: number; column: number } } })?.loc?.start
  return loc ? { line: loc.line, col: loc.column } : {}
}

function toMessage(e: unknown, file: string): Message {
  return { kind: 'compile', message: msg(e), file, ...locOf(e) }
}
