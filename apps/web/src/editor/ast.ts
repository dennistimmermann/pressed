/**
 * The caret's view of the source: which element it sits in, what kind of place that is, and
 * how to change one attribute of it. Parse only — this never evaluates template code.
 *
 * `@vue/compiler-dom` in `parseMode: 'sfc'` does the block splitting for us: at the file's
 * root, every tag except `<template>` is raw text up to its closing tag, so `<snippet>`,
 * `<script>` and `<style>` bodies never leak elements, and the main template's children are
 * parsed normally with absolute offsets. A snippet body is parsed a second time on its own,
 * with its start offset as the base.
 */
import { parse, type ElementNode, type RootNode, type TemplateChildNode } from '@vue/compiler-dom'
import { isHtmlTag } from './inspector/insert'

export type Loc = { start: number; end: number }
export type Edit = { start: number; end: number; text: string }

export type PropInfo = {
  /** `size`, `value` (for `:value`), `click` (for `@click`) or `v-if`. */
  name: string
  /** Static text, or the expression source for a binding. `null` for a bare attribute. */
  value: string | null
  isBinding: boolean
  isEvent?: boolean
  /** The whole `name="value"` range. */
  loc: Loc
  /** The value range without its quotes. */
  valueLoc?: Loc
}

export type ElementInfo = {
  tag: string
  loc: Loc
  nameLoc: Loc
  props: PropInfo[]
  selfClosing: boolean
  file: 'main' | `snippet:${string}`
  /** Source ranges of the direct child elements — what is *not* "this element's own text". */
  children: Loc[]
  /** False when the end tag is missing (the parser closed it implicitly) — nothing to box then. */
  wellFormed: boolean
  /**
   * The element's own content, when it has no child elements: the range between the tags,
   * trimmed of the whitespace the indentation owns. Present (with `value: ''`) for an empty
   * element too, so the text field can fill one; absent for self-closing and void tags.
   */
  text?: { start: number; end: number; value: string }
}

/** What kind of place the caret is in — decides `{{ row.x }}` versus `row.x`, and what a `+` can offer. */
export type CursorContext =
  | 'text'
  | 'attr-value-binding'
  | 'attr-value-static'
  | 'interpolation'
  | 'script'
  | 'other'

// ---------------------------------------------------------------- parsing

/** Tolerant parse: a half-typed template is the normal state of an editor, not an error. */
function tryParse(source: string, sfc: boolean): RootNode | null {
  try {
    return parse(source, { parseMode: sfc ? 'sfc' : 'base', onError: () => {} })
  } catch {
    return null
  }
}

/** `self` is the block's own tag (`<template>` / `<snippet>`), the fallback when no child element contains the offset. */
type Region = { nodes: TemplateChildNode[]; base: number; file: ElementInfo['file']; self: ElementInfo } | 'script' | null

/** The block the offset lives in, already resolved to parsed children + their offset base. */
function blockAt(source: string, offset: number): Region {
  const root = tryParse(source, true)
  if (!root) return null

  for (const node of root.children) {
    if (node.type !== 1 || !contains(node, offset, 0)) continue
    if (node.tag === 'template') return { nodes: node.children, base: 0, file: 'main', self: toElementInfo(node, 0, 'main') }
    if (node.tag === 'script') return 'script'
    if (node.tag !== 'snippet') return null

    // Snippet bodies come back as raw text; parse the body on its own and shift by its start.
    const inner = (node as ElementNode & { innerLoc?: { start: { offset: number }; end: { offset: number } } }).innerLoc
    if (!inner) return null
    const file: ElementInfo['file'] = `snippet:${attrValue(node, 'name') ?? ''}`
    const self = toElementInfo(node, 0, 'main') // the whole <snippet> block, as seen from the main file
    const base = inner.start.offset
    const body = source.slice(inner.start.offset, inner.end.offset)
    const bodyRoot = tryParse(body, true)
    if (!bodyRoot) return null

    // Shorthand snippet: the body *is* the template, and must be re-parsed outside sfc mode
    // so its markup is not mistaken for blocks.
    if (!bodyRoot.children.some((c) => c.type === 1 && c.tag === 'template')) {
      const plain = tryParse(body, false)
      return plain ? { nodes: plain.children, base, file, self } : null
    }
    for (const child of bodyRoot.children) {
      if (child.type !== 1 || !contains(child, offset, base)) continue
      if (child.tag === 'template') return { nodes: child.children, base, file, self }
      return child.tag === 'script' ? 'script' : null
    }
    return { nodes: [], base, file, self } // on the <snippet> tag itself
  }
  return null
}

function attrValue(node: ElementNode, name: string): string | undefined {
  for (const p of node.props) if (p.type === 6 && p.name === name) return p.value?.content
  return undefined
}

// ---------------------------------------------------------------- elementAt

/** The innermost element containing `offset`, in the main template or in a snippet. */
export function elementAt(source: string, offset: number): ElementInfo | null {
  const block = blockAt(source, offset)
  if (!block || block === 'script') return null
  return innermost(block.nodes, offset, block.base, block.file) ?? block.self
}

function innermost(
  nodes: TemplateChildNode[],
  offset: number,
  base: number,
  file: ElementInfo['file'],
): ElementInfo | null {
  for (const node of nodes) {
    if (node.type !== 1) continue
    if (!contains(node, offset, base)) continue
    return innermost(node.children, offset, base, file) ?? toElementInfo(node, base, file)
  }
  return null
}

function contains(node: { loc: { start: { offset: number }; end: { offset: number } } }, offset: number, base: number) {
  return offset >= base + node.loc.start.offset && offset <= base + node.loc.end.offset
}

function toElementInfo(node: ElementNode, base: number, file: ElementInfo['file']): ElementInfo {
  const start = base + node.loc.start.offset
  return {
    tag: node.tag,
    loc: { start, end: base + node.loc.end.offset },
    nameLoc: { start: start + 1, end: start + 1 + node.tag.length },
    props: node.props.map((p) => toPropInfo(p, base)),
    selfClosing: !!node.isSelfClosing,
    file,
    children: node.children
      .filter((c): c is ElementNode => c.type === 1)
      .map((c) => ({ start: base + c.loc.start.offset, end: base + c.loc.end.offset })),
    wellFormed: isClosed(node),
    ...textOf(node, base),
  }
}

/** `{ text }` when the element's children are only text and interpolations — else nothing. */
function textOf(node: ElementNode, base: number): { text?: ElementInfo['text'] } {
  if (node.isSelfClosing || VOID_TAGS.has(node.tag) || !isClosed(node)) return {}
  const kids = node.children
  if (kids.some((c) => c.type !== 2 && c.type !== 5)) return {}
  if (!kids.length) {
    // `<div></div>`: the empty range sits right before the close tag, which is the last `</`.
    const at = base + node.loc.start.offset + node.loc.source.lastIndexOf('</')
    return { text: { start: at, end: at, value: '' } }
  }
  const raw = kids.map((k) => k.loc.source).join('')
  const lead = raw.length - raw.trimStart().length
  const start = base + kids[0].loc.start.offset + lead
  const end = base + kids[kids.length - 1].loc.end.offset - (raw.length - raw.trimEnd().length)
  return { text: { start, end: Math.max(start, end), value: raw.trim() } }
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

function toPropInfo(prop: ElementNode['props'][number], base: number): PropInfo {
  const loc = { start: base + prop.loc.start.offset, end: base + prop.loc.end.offset }
  if (prop.type === 6) {
    return {
      name: prop.name,
      value: prop.value?.content ?? null,
      isBinding: false,
      loc,
      ...(prop.value ? { valueLoc: unquote(prop.value.loc, base) } : {}),
    }
  }
  const arg = prop.arg && prop.arg.type === 4 ? prop.arg.content : undefined
  return {
    name: prop.name === 'bind' || prop.name === 'on' ? (arg ?? prop.rawName ?? prop.name) : (prop.rawName ?? `v-${prop.name}`),
    value: prop.exp && prop.exp.type === 4 ? prop.exp.content : null,
    isBinding: prop.name === 'bind',
    ...(prop.name === 'on' ? { isEvent: true } : {}),
    loc,
    ...(prop.exp ? { valueLoc: { start: base + prop.exp.loc.start.offset, end: base + prop.exp.loc.end.offset } } : {}),
  }
}

// ---------------------------------------------------------------- cursorContext

/** What kind of place the caret is in — decides `{{ row.x }}` versus `row.x`. */
export function cursorContext(source: string, offset: number): CursorContext {
  const block = blockAt(source, offset)
  if (block === 'script') return 'script'
  if (!block) return 'other'
  return contextIn(source, block.nodes, offset, block.base) ?? 'text'
}

function contextIn(
  source: string,
  nodes: TemplateChildNode[],
  offset: number,
  base: number,
): CursorContext | null {
  for (const node of nodes) {
    if (!contains(node, offset, base)) continue
    if (node.type === 5) return 'interpolation'
    if (node.type === 2) return 'text'
    if (node.type !== 1) continue

    for (const prop of node.props) {
      const value = toPropInfo(prop, base).valueLoc
      if (value && offset >= value.start && offset <= value.end)
        return prop.type === 7 ? 'attr-value-binding' : 'attr-value-static'
    }
    // Not in a value: either still in the open tag, or in the element's content.
    return contextIn(source, node.children, offset, base) ?? (offset < openTagEnd(source, node, base) ? 'other' : 'text')
  }
  return null
}

/** Offset just past the open tag's `>`. Safe to scan for: attribute values are quoted and skipped. */
function openTagEnd(source: string, node: ElementNode, base: number): number {
  const last = node.props[node.props.length - 1]
  const from = last ? base + last.loc.end.offset : base + node.loc.start.offset + 1 + node.tag.length
  const gt = source.indexOf('>', from)
  return gt < 0 ? base + node.loc.end.offset : gt + 1
}

/** Static attribute value locs include the quotes; the editable range does not. */
function unquote(loc: { start: { offset: number }; end: { offset: number }; source: string }, base: number): Loc {
  const quoted = /^["']/.test(loc.source)
  return {
    start: base + loc.start.offset + (quoted ? 1 : 0),
    end: base + loc.end.offset - (quoted ? 1 : 0),
  }
}

// ---------------------------------------------------------------- edits

/**
 * One text-range edit that sets, binds or removes a single attribute — replacing the existing
 * one, or appending after the last attribute (a leading space, never touching the `/>`).
 */
export function attributeEdit(
  el: ElementInfo,
  name: string,
  kind: 'set-static' | 'set-binding' | 'remove',
  value?: string | boolean,
): Edit {
  const existing = el.props.find((p) => p.name === name)
  const text =
    kind === 'remove' ? ''
    : kind === 'set-binding' ? `:${name}="${escapeAttr(String(value ?? ''))}"`
    : value === true ? name
    : `${name}="${escapeAttr(String(value ?? ''))}"`

  if (existing) {
    // An attribute is always preceded by whitespace, so removal can eat one character.
    const start = kind === 'remove' ? existing.loc.start - 1 : existing.loc.start
    return { start, end: existing.loc.end, text }
  }
  if (kind === 'remove') return { start: el.loc.start, end: el.loc.start, text: '' }
  const at = el.props.length ? el.props[el.props.length - 1].loc.end : el.nameLoc.end
  return { start: at, end: at, text: ` ${text}` }
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;')
}

/** Plain insert at the caret. */
export function insertAt(offset: number, text: string): Edit {
  return { start: offset, end: offset, text }
}

/** `{{ row.x }}` in text, bare `row.x` where an expression is already being written. */
export function insertVar(source: string, offset: number, path: string): Edit {
  const context = cursorContext(source, offset)
  const bare = context === 'attr-value-binding' || context === 'interpolation'
  return insertAt(offset, bare ? path : `{{ ${path} }}`)
}

// ---------------------------------------------------------------- blocks

/**
 * One tree of "blocks" over the whole file (the tab model and the rule parser walk it).
 * Blocks are: SFC blocks (`<meta> <snippet> <template> <script> <style>`, nested inside snippets),
 * well-formed template elements, and balanced `{ … }` blocks in script/style/meta text (with
 * their head: `.title {`, `"size": {`, `defineProps<{`). Malformed pieces (unclosed element,
 * unbalanced braces) become `broken` blocks.
 */
export type Block = Loc & { kind: 'sfc' | 'element' | 'brace' | 'broken'; children: Block[] }
/** Top-level SFC blocks with everything nested underneath. Cheap enough to rebuild per caret move. */
export function blockTree(source: string): Block[] {
  const root = tryParse(source, true)
  const blocks: Block[] = []
  // <meta> is an HTML void element: the parser gives it no body, so find it by hand.
  const meta = /<meta>([\s\S]*?)<\/meta>/.exec(source)
  if (meta) {
    const from = meta.index + '<meta>'.length
    blocks.push({ kind: 'sfc', start: meta.index, end: meta.index + meta[0].length, children: braceBlocks(source, from, from + meta[1].length) })
  }
  for (const node of root?.children ?? []) {
    if (node.type !== 1 || node.tag === 'meta') continue
    const block = sfcBlock(source, node, 0)
    if (block) blocks.push(block)
  }
  return blocks
}

type WithInner = ElementNode & { innerLoc?: { start: { offset: number }; end: { offset: number } } }

function sfcBlock(source: string, node: WithInner, base: number): Block | null {
  const start = base + node.loc.start.offset, end = base + node.loc.end.offset
  if (!isClosed(node)) return { kind: 'broken', start, end, children: [] }
  const inner = node.innerLoc ? [base + node.innerLoc.start.offset, base + node.innerLoc.end.offset] as const : null
  let children: Block[] = []
  if (node.tag === 'template') children = elementBlocks(node.children, base)
  else if (node.tag === 'snippet' && inner) {
    // Full snippet: a mini-SFC. Shorthand snippet: the body is the template.
    const body = source.slice(inner[0], inner[1])
    const bodyRoot = tryParse(body, true)
    const full = bodyRoot?.children.some((c) => c.type === 1 && c.tag === 'template')
    if (full) children = (bodyRoot!.children.filter((c): c is WithInner => c.type === 1).map((c) => sfcBlock(source, c, inner[0])).filter((b): b is Block => !!b))
    else { const plain = tryParse(body, false); children = plain ? elementBlocks(plain.children, inner[0]) : [] }
  } else if (inner) children = braceBlocks(source, inner[0], inner[1], node.tag !== 'style') // script, style
  return { kind: 'sfc', start, end, children }
}

function elementBlocks(nodes: TemplateChildNode[], base: number): Block[] {
  const out: Block[] = []
  for (const n of nodes) {
    if (n.type !== 1) continue
    const loc = { start: base + n.loc.start.offset, end: base + n.loc.end.offset }
    out.push(isClosed(n) ? { kind: 'element', ...loc, children: elementBlocks(n.children, base) } : { kind: 'broken', ...loc, children: [] })
  }
  return out
}

function isClosed(node: ElementNode): boolean {
  return !!node.isSelfClosing || VOID_TAGS.has(node.tag) || new RegExp(`</\\s*${node.tag}\\s*>$`, 'i').test(node.loc.source)
}

/**
 * Balanced `{…}` blocks in [from, to) as a tree, skipping strings, template literals and
 * comments. Each block starts at its head — back from `{` to the previous `{ } ; ,` or line
 * start. Unbalanced text yields one `broken` block over the whole range instead.
 */
export function braceBlocks(source: string, from: number, to: number, commaStops = true): Block[] {
  const stack: Block[] = [{ kind: 'brace', start: from, end: to, children: [] }]
  let i = from
  const skipTo = (end: string) => { const j = source.indexOf(end, i + 1); i = j < 0 ? to : j + end.length - 1 }
  while (i < to) {
    const c = source[i], n = source[i + 1]
    if (c === '/' && n === '/') { const j = source.indexOf('\n', i); i = j < 0 ? to : j }
    else if (c === '/' && n === '*') skipTo('*/')
    else if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < to && source[i] !== q) { if (source[i] === '\\') i++; if (q !== '`' && source[i] === '\n') break; i++ } }
    else if (c === '{') stack.push({ kind: 'brace', start: i, end: -1, children: [] })
    else if (c === '}') {
      if (stack.length === 1) return [{ kind: 'broken', start: from, end: to, children: [] }] // stray close
      const open = stack.pop()!
      open.start = headStart(source, open.start, from, commaStops)
      open.end = i + 1
      stack[stack.length - 1].children.push(open)
    }
    i++
  }
  return stack.length === 1 ? stack[0].children : [{ kind: 'broken', start: from, end: to, children: [] }] // unclosed brace
}

/** `commaStops`: `,` ends a head in JSON/JS (`"size": {`), but not in CSS (`.a, .b {` is one selector). */
function headStart(source: string, at: number, floor: number, commaStops = true): number {
  const stops = commaStops ? '{};,\n' : '{};\n'
  let i = at
  while (i > floor && !stops.includes(source[i - 1])) i--
  while (i < at && (source[i] === ' ' || source[i] === '\t')) i++
  // `<style scoped>.k {` on one line: the head is `.k`, not the tag.
  if (source[i] === '<') { const gt = source.indexOf('>', i); if (gt > 0 && gt < at) i = gt + 1 }
  while (i < at && (source[i] === ' ' || source[i] === '\t')) i++
  return i
}

// ---------------------------------------------------------------- structure

/**
 * The result of a structure command: text-range edits (sorted descending, so applying them
 * back to front keeps the earlier offsets valid) plus where the element ended up in the
 * *new* text — the host re-selects it there so the caret follows what you just moved.
 */
export type StructureEdit = { edits: Edit[]; selectAt: number | null }

/** Nothing to do: a malformed element, a first sibling asked to move up, a void asked to nest. */
const NONE: StructureEdit = { edits: [], selectAt: null }

/**
 * Only elements *inside* a template block may be restructured. The caret in empty template
 * space resolves to the block's own `<template>` tag (`elementAt`'s fallback) — deleting or
 * wrapping that would eat the block.
 */
function editable(source: string, el: ElementInfo): boolean {
  if (!el.wellFormed) return false
  const block = blockAt(source, el.loc.start)
  return !!block && block !== 'script' && block.self.loc.start !== el.loc.start
}

const done = (edits: Edit[], selectAt: number | null): StructureEdit => ({
  edits: [...edits].sort((a, b) => b.start - a.start),
  selectAt,
})

/** The element containing `el`, or null when `el` is a direct child of its block. */
export function parentOf(source: string, el: ElementInfo): ElementInfo | null {
  const block = blockAt(source, el.loc.start)
  if (!block || block === 'script') return null
  return parentIn(block.nodes, el, block.base, block.file)
}

function parentIn(nodes: TemplateChildNode[], el: ElementInfo, base: number, file: ElementInfo['file']): ElementInfo | null {
  for (const node of nodes) {
    if (node.type !== 1) continue
    const start = base + node.loc.start.offset
    if (start > el.loc.start || base + node.loc.end.offset < el.loc.end) continue
    if (start === el.loc.start) return null // this *is* el: nothing deeper contains it
    return parentIn(node.children, el, base, file) ?? toElementInfo(node, base, file)
  }
  return null
}

/** The ranges of `el` and the elements beside it, in source order (`el` included). */
export function siblingsOf(source: string, el: ElementInfo): Loc[] {
  const parent = parentOf(source, el)
  if (parent) return parent.children
  const block = blockAt(source, el.loc.start)
  if (!block || block === 'script') return []
  return block.nodes
    .filter((n): n is ElementNode => n.type === 1)
    .map((n) => ({ start: block.base + n.loc.start.offset, end: block.base + n.loc.end.offset }))
}

/** One row of the Layers tree. */
export type LayerNode = {
  tag: string
  loc: Loc
  classes: string[]
  /** Not a plain HTML element — a library component or a snippet of this file. */
  isComponent: boolean
  /** `<img />`, `<temp />`: nothing can be dropped inside it. */
  selfClosing: boolean
  /** `if` / `loop` … — the right-aligned mono hints of a Layers row (`DIRECTIVE_LABELS`). */
  hints: string[]
  children: LayerNode[]
}

/**
 * The directives the Inspector gives a field to, with the plain word the UI calls them by
 * (the block editor is for people who do not read `v-`): the Inspector keys, the Layers hints.
 */
export const DIRECTIVE_LABELS: Record<string, string> = { 'v-if': 'if (v-if)', 'v-else-if': 'else if (v-else-if)', 'v-else': 'else (v-else)', 'v-for': 'loop (v-for)', key: 'identify by (:key)' }
/** The short form for a Layers row hint. */
export const DIRECTIVE_HINTS: Record<string, string> = { 'v-if': 'if', 'v-else-if': 'else if', 'v-else': 'else', 'v-for': 'loop' }
export const DIRECTIVE_FIELDS = ['v-if', 'v-else-if', 'v-else', 'v-for']
const HINTED = new Set(DIRECTIVE_FIELDS.map((d) => d.slice(2)))

/**
 * A `v-for` clause split into its two halves: `alias` as written (`item`, `(item, i)`) for the
 * field that edits it, `aliases` as the names it declares for the `{ }` picker, `list` the
 * expression iterated. An unparsable clause yields empty strings — the row then reads as unset.
 */
export function loopClause(clause: string): { alias: string; aliases: string[]; item: string; index: string; list: string } {
  const m = /^\(?([^)]*?)\)?\s+(?:in|of)\s+([\s\S]*)$/.exec(clause)
  const alias = m?.[1] ?? ''
  const aliases = alias.split(',').map((s) => s.trim()).filter(Boolean)
  // `item` and `index` are the two the UI edits; a third (object key) rides along in `alias`.
  return { alias, aliases, item: aliases[0] ?? '', index: aliases[1] ?? '', list: m?.[2] ?? '' }
}

/** The other way round: `item`, `index` → the alias part of a `v-for` (`item` or `(item, i)`). */
export const loopAlias = (item: string, index: string) => (index.trim() ? `(${item.trim()}, ${index.trim()})` : item.trim())

/**
 * The element tree of one template block. `blockLoc` is the block's own range (main template
 * or a snippet's); snippet bodies are re-parsed with their start as the offset base, which
 * `blockAt` already does — so ask it about a point just inside the block's opening tag.
 */
export function elementTree(source: string, blockLoc: Loc): LayerNode[] {
  const block = blockAt(source, blockLoc.start + 1)
  if (!block || block === 'script') return []
  return layerNodes(block.nodes, block.base)
}

function layerNodes(nodes: TemplateChildNode[], base: number): LayerNode[] {
  const out: LayerNode[] = []
  for (const node of nodes) {
    if (node.type !== 1) continue
    out.push({
      tag: node.tag,
      loc: { start: base + node.loc.start.offset, end: base + node.loc.end.offset },
      classes: (attrValue(node, 'class') ?? '').split(/\s+/).filter(Boolean),
      isComponent: !isHtmlTag(node.tag),
      selfClosing: !!node.isSelfClosing || VOID_TAGS.has(node.tag),
      hints: node.props.filter((p) => p.type === 7 && HINTED.has(p.name)).map((p) => DIRECTIVE_HINTS[`v-${(p as { name: string }).name}`]),
      children: layerNodes(node.children, base),
    })
  }
  return out
}

/**
 * The elements of the tree a rule's selector matches — the Inspector's `USED BY` chips, and
 * what the preview outlines while a rule is selected.
 * ponytail: simple selectors only (`*`, `tag`, `.class`, comma lists); a descendant or
 * attribute selector matches nothing. Rules in a label's style block are simple in practice.
 */
export function matchingElements(tree: LayerNode[], selector: string): LayerNode[] {
  const parts = selector.split(',').map((s) => s.trim()).filter(Boolean)
  const hit = (n: LayerNode) =>
    parts.some((p) => p === '*' || p === n.tag || (p.startsWith('.') && n.classes.includes(p.slice(1))))
  const out: LayerNode[] = []
  const walk = (nodes: LayerNode[]) => {
    for (const n of nodes) {
      if (hit(n)) out.push(n)
      walk(n.children)
    }
  }
  walk(tree)
  return out
}

/** How many elements a selector matches — the `×N` beside a Layers rule row. */
export function countMatching(tree: LayerNode[], selector: string): number {
  return matchingElements(tree, selector).length
}

// ---- text geometry --------------------------------------------------------

const lineStart = (source: string, at: number) => source.lastIndexOf('\n', at - 1) + 1
const indentAt = (source: string, at: number) => /^[ \t]*/.exec(source.slice(lineStart(source, at)))![0]

/**
 * Move every line but the first by `delta` columns — the first line keeps whatever
 * indentation it lands in. ponytail: counts characters, so a tab-indented file shifts by
 * spaces; switch to a tab-aware width if anyone ever indents this project with tabs.
 */
function shiftIndent(text: string, delta: number): string {
  if (!delta) return text
  return text
    .split('\n')
    .map((line, i) => {
      if (i === 0 || !line.trim()) return line
      if (delta > 0) return ' '.repeat(delta) + line
      return line.slice(Math.min(-delta, /^[ \t]*/.exec(line)![0].length))
    })
    .join('\n')
}

/** The range to cut when removing an element: its own line, when nothing else shares it. */
function ownLine(source: string, loc: Loc): Loc {
  const from = lineStart(source, loc.start)
  const nl = source.indexOf('\n', loc.end)
  const to = nl < 0 ? source.length : nl + 1
  const alone = !source.slice(from, loc.start).trim() && !source.slice(loc.end, to).trim()
  return alone ? { start: from, end: to } : loc
}

/** Offset just past the element's `>`; where its content begins. */
function innerStart(source: string, el: ElementInfo): number {
  const from = el.props.length ? el.props[el.props.length - 1].loc.end : el.nameLoc.end
  const gt = source.indexOf('>', from)
  return gt < 0 ? el.loc.end : gt + 1
}

/** Offset of the element's `</tag>`, or null when there is nothing to close (void, self-closing). */
function closeTagStart(source: string, el: ElementInfo): number | null {
  if (el.selfClosing || VOID_TAGS.has(el.tag) || !el.wellFormed) return null
  const m = new RegExp(`</\\s*${el.tag}\\s*>$`, 'i').exec(source.slice(el.loc.start, el.loc.end))
  return m ? el.loc.start + m.index : null
}

/** Where `insert`'s text starts once every edit before it has been applied. */
function landsAt(edits: Edit[], insert: Edit, within = 0): number {
  let delta = 0
  for (const e of edits) if (e !== insert && e.end <= insert.start) delta += e.text.length - (e.end - e.start)
  return insert.start + delta + within
}

/** Put `body` on its own line as the last child, just before `close` (the `</tag>` offset). */
function lastChildEdit(source: string, close: number, indent: string, body: string): { edit: Edit; within: number } {
  const from = lineStart(source, close)
  if (!source.slice(from, close).trim()) // the close tag already has a line to itself
    return { edit: { start: from, end: from, text: `${indent}${body}\n` }, within: indent.length }
  const outer = indentAt(source, close) // a one-liner: break the close tag onto its own line
  return { edit: { start: close, end: close, text: `\n${indent}${body}\n${outer}` }, within: 1 + indent.length }
}

/** The element's source, re-indented for a line that starts at `indent`. */
function bodyAt(source: string, el: ElementInfo, indent: string): string {
  return shiftIndent(source.slice(el.loc.start, el.loc.end), indent.length - indentAt(source, el.loc.start).length)
}

// ---- commands -------------------------------------------------------------

/** Swap with the previous/next sibling. The whitespace between them stays where it is. */
export function moveElement(source: string, el: ElementInfo, dir: 'up' | 'down'): StructureEdit {
  if (!editable(source, el)) return NONE
  const sibs = siblingsOf(source, el)
  const i = sibs.findIndex((s) => s.start === el.loc.start)
  const other = i < 0 ? undefined : sibs[dir === 'up' ? i - 1 : i + 1]
  if (!other) return NONE
  const [a, b] = dir === 'up' ? [other, el.loc] : [el.loc, other]
  const ta = source.slice(a.start, a.end)
  const tb = source.slice(b.start, b.end)
  // `a` ends up after the untouched gap, which is why `down` is not simply `b.start`.
  const selectAt = dir === 'up' ? a.start : a.start + tb.length + (b.start - a.end)
  return done([{ ...a, text: tb }, { ...b, text: ta }], selectAt)
}

/** Nest into the previous sibling, as its last child. No previous sibling, or a void one → no-op. */
export function indentElement(source: string, el: ElementInfo): StructureEdit {
  if (!editable(source, el)) return NONE
  const sibs = siblingsOf(source, el)
  const i = sibs.findIndex((s) => s.start === el.loc.start)
  const prev = i > 0 ? elementAt(source, sibs[i - 1].start + 1) : null
  const close = prev && closeTagStart(source, prev)
  if (!prev || close === null) return NONE
  const indent = indentAt(source, prev.loc.start) + '  '
  const { edit, within } = lastChildEdit(source, close, indent, bodyAt(source, el, indent))
  const cut = { ...ownLine(source, el.loc), text: '' }
  return done([edit, cut], landsAt([edit, cut], edit, within))
}

/** The inverse: out of the parent, onto the line after its closing tag. */
export function outdentElement(source: string, el: ElementInfo): StructureEdit {
  if (!editable(source, el)) return NONE
  const parent = parentOf(source, el)
  if (!parent) return NONE // already a direct child of the block
  const indent = indentAt(source, parent.loc.start)
  const edit = { start: parent.loc.end, end: parent.loc.end, text: `\n${indent}${bodyAt(source, el, indent)}` }
  const cut = { ...ownLine(source, el.loc), text: '' }
  return done([edit, cut], landsAt([edit, cut], edit, 1 + indent.length))
}

/** `<tag>` … `</tag>` around the element. `tagOrStub` may carry attributes (`Frame pad="2mm"`). */
export function wrapElement(source: string, el: ElementInfo, tagOrStub: string): StructureEdit {
  if (!editable(source, el)) return NONE
  const stub = tagOrStub.trim().replace(/^<|\/?>$/g, '').trim()
  const name = stub.split(/[\s/>]/)[0]
  if (!name) return NONE
  const indent = indentAt(source, el.loc.start)
  const body = shiftIndent(source.slice(el.loc.start, el.loc.end), 2)
  return done([{ ...el.loc, text: `<${stub}>\n${indent}  ${body}\n${indent}</${name}>` }], el.loc.start)
}

/** Replace the element by its content, one level less indented. Empty content = delete. */
export function unwrapElement(source: string, el: ElementInfo): StructureEdit {
  if (!editable(source, el)) return NONE
  const close = closeTagStart(source, el)
  if (close === null) return NONE
  const body = shiftIndent(source.slice(innerStart(source, el), close), -2)
    .replace(/^[ \t]*\n/, '') // the break after the open tag
    .replace(/\s+$/, '')
    .replace(/^[ \t]+/, '') // the first line inherits the element's own indentation
  if (!body) return done([{ ...ownLine(source, el.loc), text: '' }], null)
  return done([{ ...el.loc, text: body }], el.loc.start)
}

/** A copy on the next line. */
export function duplicateElement(source: string, el: ElementInfo): StructureEdit {
  if (!editable(source, el)) return NONE
  const indent = indentAt(source, el.loc.start)
  const text = `\n${indent}${source.slice(el.loc.start, el.loc.end)}`
  return done([{ start: el.loc.end, end: el.loc.end, text }], el.loc.end + 1 + indent.length)
}

/** Remove the element, and its line with it when the line becomes blank. */
export function deleteElement(source: string, el: ElementInfo): StructureEdit {
  if (!editable(source, el)) return NONE
  const cut = ownLine(source, el.loc)
  return done([{ ...cut, text: '' }], cut.start)
}

/** Replace the element's own text (only elements that have `text` — see `ElementInfo.text`). */
export function setText(source: string, el: ElementInfo, text: string): StructureEdit {
  if (!editable(source, el) || !el.text) return NONE
  return done([{ start: el.text.start, end: el.text.end, text }], el.loc.start)
}

/**
 * Drag & drop from the Layers tree: cut the element and paste it beside (or inside) `target`.
 * A target inside the element itself, or a void one asked to take a child, is a no-op.
 */
export function reparentElement(
  source: string,
  el: ElementInfo,
  target: Loc,
  position: 'before' | 'after' | 'inside',
): StructureEdit {
  if (!editable(source, el)) return NONE
  if (target.start >= el.loc.start && target.end <= el.loc.end) return NONE // itself, or its own descendant
  const to = elementAt(source, target.start + 1)
  if (!to || to.loc.start !== target.start) return NONE
  const cut = { ...ownLine(source, el.loc), text: '' }

  let edit: Edit, within: number
  if (position === 'inside') {
    const close = closeTagStart(source, to)
    if (close === null) return NONE
    const indent = indentAt(source, to.loc.start) + '  '
    ;({ edit, within } = lastChildEdit(source, close, indent, bodyAt(source, el, indent)))
  } else {
    const indent = indentAt(source, to.loc.start)
    const body = bodyAt(source, el, indent)
    edit =
      position === 'before'
        ? { start: to.loc.start, end: to.loc.start, text: `${body}\n${indent}` }
        : { start: to.loc.end, end: to.loc.end, text: `\n${indent}${body}` }
    within = position === 'before' ? 0 : 1 + indent.length
  }
  if (edit.start > cut.start && edit.start < cut.end) return NONE // the paste lands in the hole it cuts
  return done([edit, cut], landsAt([edit, cut], edit, within))
}

/**
 * Insert `text` (with `|` marking the caret) on its own line after `after` — or as its last
 * child with `position: 'inside'` (⌥Enter) — or, with no anchor, as the last thing in the block
 * that spans `blockLoc`. Indentation follows the anchor / block content.
 */
export function insertElementText(
  source: string,
  text: string,
  after: Loc | null,
  blockLoc: Loc,
  position: 'after' | 'inside' = 'after',
): StructureEdit {
  const lineStart = (at: number) => source.lastIndexOf('\n', at - 1) + 1
  if (position === 'inside' && after) {
    const to = elementAt(source, after.start + 1)
    const close = to ? closeTagStart(source, to) : null
    if (to && close !== null) {
      const inner = indentAt(source, to.loc.start) + '  '
      const body = text.replaceAll('\n', '\n' + inner)
      const at = body.indexOf('|')
      const clean = body.replace('|', '')
      const { edit, within } = lastChildEdit(source, close, inner, clean)
      return { edits: [edit], selectAt: edit.start + within + (at < 0 ? 0 : Math.min(at, clean.length)) }
    }
  }
  let at: number, indent: string
  if (after) {
    at = after.end
    const ls = lineStart(after.start)
    indent = source.slice(ls, after.start).match(/^[ \t]*/)![0]
  } else {
    // Before the block's closing tag; indent like the last content line, else two spaces.
    const closeAt = source.lastIndexOf('</', blockLoc.end)
    at = source.lastIndexOf('\n', closeAt - 1) // end of the last content line
    if (at < blockLoc.start) at = closeAt
    const lastLine = source.slice(lineStart(at), at)
    indent = lastLine.trim() ? lastLine.match(/^[ \t]*/)![0] : '  '
  }
  const body = text.replaceAll('\n', '\n' + indent)
  const caret = body.indexOf('|')
  const clean = body.replace('|', '')
  const inserted = `\n${indent}${clean}`
  return { edits: [{ start: at, end: at, text: inserted }], selectAt: at + 1 + indent.length + (caret < 0 ? 0 : Math.min(caret, clean.length)) }
}
