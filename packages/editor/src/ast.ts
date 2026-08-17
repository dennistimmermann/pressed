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
}


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
    wellFormed: !!node.isSelfClosing || VOID_TAGS.has(node.tag) || new RegExp(`</\\s*${node.tag}\\s*>$`, 'i').test(node.loc.source),
  }
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

/** Static attribute value locs include the quotes; the editable range does not. */
function unquote(loc: { start: { offset: number }; end: { offset: number }; source: string }, base: number): Loc {
  const quoted = /^["']/.test(loc.source)
  return {
    start: base + loc.start.offset + (quoted ? 1 : 0),
    end: base + loc.end.offset - (quoted ? 1 : 0),
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

// ---------------------------------------------------------------- blocks / boxAt

/**
 * One tree of "blocks" over the whole file, one rule for all of them:
 *   box = the deepest block containing the caret, bold = its text minus its direct children.
 * Blocks are: SFC blocks (`<meta> <snippet> <template> <script> <style>`, nested inside snippets),
 * well-formed template elements, and balanced `{ … }` blocks in script/style/meta text (with
 * their head: `.title {`, `"size": {`, `defineProps<{`). Malformed pieces (unclosed element,
 * unbalanced braces) become `broken` blocks: a caret inside one gets no box at all.
 */
export type Block = Loc & { kind: 'sfc' | 'element' | 'brace' | 'broken'; children: Block[] }
export type Box = Loc & { holes: Loc[] }

export function boxAt(source: string, offset: number): Box | null {
  let node: Block | undefined
  let list = blockTree(source)
  for (;;) {
    const next = list.find((b) => b.start <= offset && offset <= b.end)
    if (!next) break
    node = next
    list = next.children
  }
  if (!node || node.kind === 'broken') return null
  return { start: node.start, end: node.end, holes: node.children.map(({ start, end }) => ({ start, end })) }
}

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
  } else if (inner) children = braceBlocks(source, inner[0], inner[1]) // script, style
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
export function braceBlocks(source: string, from: number, to: number): Block[] {
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
      open.start = headStart(source, open.start, from)
      open.end = i + 1
      stack[stack.length - 1].children.push(open)
    }
    i++
  }
  return stack.length === 1 ? stack[0].children : [{ kind: 'broken', start: from, end: to, children: [] }] // unclosed brace
}

function headStart(source: string, at: number, floor: number): number {
  let i = at
  while (i > floor && !'{};,\n'.includes(source[i - 1])) i--
  while (i < at && (source[i] === ' ' || source[i] === '\t')) i++
  // `<style scoped>.k {` on one line: the head is `.k`, not the tag.
  if (source[i] === '<') { const gt = source.indexOf('>', i); if (gt > 0 && gt < at) i = gt + 1 }
  while (i < at && (source[i] === ' ' || source[i] === '\t')) i++
  return i
}
