import { blockTree, type Block, type Edit } from './ast'

/**
 * The tab model over the one `.vue` file (design README-tabs.md): which blocks and snippets
 * exist, which lines each one occupies, and which tab owns a given offset. Pure — the editor
 * hides everything outside the active tab's lines, the app renders the strip from it.
 */
export type BlockKind = 'template' | 'style' | 'script'
export type TabRef = { scope: string | null; kind: BlockKind } // scope = snippet name, null = the label itself

export type TabBlock = {
  kind: BlockKind
  /** Whole block incl. tags, and the content between the tags (offsets). */
  start: number
  end: number
  contentStart: number
  contentEnd: number
  /** 1-based lines to show for this tab. Tag lines are excluded when they hold nothing else. */
  lines: { first: number; last: number }
  /** `12` elements / `7` rules; null for script. */
  count: number | null
  empty: boolean
}
export type SnippetScope = {
  name: string
  start: number
  end: number
  /** Offsets of the name inside `name="…"` — for rename edits. */
  nameLoc: { start: number; end: number }
  shorthand: boolean
  blocks: TabBlock[]
}
export type TabsModel = { blocks: TabBlock[]; snippets: SnippetScope[]; meta: { start: number; end: number } | null }

/** Worst message level and how many, for one tab or one whole scope — what the troughs badge. */
export type Badge = { level: 'error' | 'warning'; count: number }

const TAG = /^<(\w+)([^>]*)>/
const KINDS: BlockKind[] = ['template', 'style', 'script'] // strip order = use order, not file order

export function tabsModel(source: string): TabsModel {
  const model: TabsModel = { blocks: [], snippets: [], meta: null }
  for (const b of blockTree(source)) {
    if (b.kind !== 'sfc') continue
    const m = TAG.exec(source.slice(b.start, b.end))
    if (!m) continue
    if (m[1] === 'meta') model.meta = { start: b.start, end: b.end }
    else if (m[1] === 'snippet') model.snippets.push(snippetScope(source, b, m[2]))
    else if ((KINDS as string[]).includes(m[1])) model.blocks.push(tabBlock(source, b, m[1] as BlockKind))
  }
  model.blocks.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind))
  return model
}

function tabBlock(source: string, b: Block, kind: BlockKind): TabBlock {
  const open = TAG.exec(source.slice(b.start, b.end))!
  const contentStart = b.start + open[0].length
  const contentEnd = source.lastIndexOf('</', b.end)
  const content = source.slice(contentStart, contentEnd)
  const lineOf = (o: number) => source.slice(0, o).split('\n').length
  const lineText = (l: number) => source.split('\n')[l - 1] ?? ''
  const openLine = lineOf(b.start), closeLine = lineOf(contentEnd)
  const openAlone = lineText(openLine).trim() === open[0].trim() && lineOf(contentStart - 1) === openLine
  const closeAlone = lineText(closeLine).trim() === source.slice(contentEnd, b.end).trim()
  let first = openAlone ? openLine + 1 : openLine
  let last = closeAlone ? closeLine - 1 : closeLine
  if (last < first) { first = openLine; last = closeLine } // `<style></style>`: nothing but tags
  const empty = content.trim() === ''
  const count = kind === 'template' ? countElements(b) : kind === 'style' ? countRules(b) : null
  return { kind, start: b.start, end: b.end, contentStart, contentEnd, lines: { first, last }, count, empty }
}

const countElements = (b: Block): number => b.children.reduce((n, c) => n + (c.kind === 'element' ? 1 + countElements(c) : 0), 0)
const countRules = (b: Block): number => b.children.filter((c) => c.kind === 'brace').length

function snippetScope(source: string, b: Block, attrs: string): SnippetScope {
  const nameMatch = /name\s*=\s*["']([^"']*)["']/.exec(attrs)
  const attrsStart = b.start + 1 + 'snippet'.length
  const nameStart = nameMatch ? attrsStart + nameMatch.index + nameMatch[0].indexOf(nameMatch[1]) : attrsStart
  const name = nameMatch?.[1] ?? ''
  const blocks: TabBlock[] = []
  for (const c of b.children) {
    if (c.kind !== 'sfc') continue
    const m = TAG.exec(source.slice(c.start, c.end))
    if (m && (KINDS as string[]).includes(m[1])) blocks.push(tabBlock(source, c, m[1] as BlockKind))
  }
  const shorthand = blocks.length === 0
  if (shorthand) blocks.push(tabBlock(source, b, 'template')) // the body is the template
  blocks.sort((a, c) => KINDS.indexOf(a.kind) - KINDS.indexOf(c.kind))
  return { name, start: b.start, end: b.end, nameLoc: { start: nameStart, end: nameStart + name.length }, shorthand, blocks }
}

/** Stable string id for a tab — badge keys, `v-for` keys, "is this the active one". */
export const tabKey = (tab: TabRef): string => (tab.scope === null ? tab.kind : `${tab.scope}/${tab.kind}`)

/** The block a tab points at, if it exists. */
export function blockOf(model: TabsModel, tab: TabRef): TabBlock | undefined {
  const list = tab.scope === null ? model.blocks : model.snippets.find((s) => s.name === tab.scope)?.blocks
  return list?.find((b) => b.kind === tab.kind)
}

/** Which tab owns an offset — for badges (messages) and preview/status navigation. */
export function tabAt(model: TabsModel, offset: number): TabRef | null {
  for (const s of model.snippets)
    if (offset >= s.start && offset <= s.end) {
      const b = s.blocks.find((x) => offset >= x.start && offset <= x.end) ?? s.blocks[0]
      return { scope: s.name, kind: b.kind }
    }
  const b = model.blocks.find((x) => offset >= x.start && offset <= x.end)
  return b ? { scope: null, kind: b.kind } : null
}

const indent = (t: string) => t.split('\n').map((l) => (l ? '  ' + l : l)).join('\n')

/**
 * Insert a missing block (or a new snippet) in *file* order: meta → snippets → script → template → style.
 * `body` fills a new snippet with markup instead of an empty `<template>` — a *shorthand* body,
 * which is what an icon snippet is.
 */
export function insertBlock(source: string, model: TabsModel, kind: BlockKind | 'snippet', name = 'new', scope: string | null = null, body?: string): Edit {
  const stub: Record<BlockKind | 'snippet', string> = {
    script: '<script setup lang="ts">\n\n</script>',
    template: '<template>\n\n</template>',
    // A snippet's own styles are scoped — the runtime compiles every `<style>` with its own
    // `scoped` flag, so a snippet block without it would leak into the whole label.
    style: scope === null ? '<style>\n\n</style>' : '<style scoped>\n\n</style>',
    snippet: body
      ? `<snippet name="${name}">\n${indent(body)}\n</snippet>`
      : `<snippet name="${name}">\n  <template>\n\n  </template>\n</snippet>`,
  }
  if (scope !== null && kind !== 'snippet') {
    // Inside a snippet: before its </snippet>, in the same order; a shorthand body has to become explicit first.
    const s = model.snippets.find((x) => x.name === scope)!
    const closeAt = source.lastIndexOf('</snippet', s.end)
    if (s.shorthand) {
      const body = source.slice(s.blocks[0].contentStart, s.blocks[0].contentEnd)
      // `props="a b"` only means something on a shorthand body (the loader ignores it once there is a
      // <template>), so the expansion turns it into a real `defineProps` and drops the attribute —
      // one edit over the whole open tag + body.
      const open = source.slice(s.start, s.blocks[0].contentStart)
      const propsAttr = /\s+props\s*=\s*["']([^"']*)["']/.exec(open)
      const names = (propsAttr?.[1] ?? '').trim().split(/\s+/).filter(Boolean)
      const script = names.length
        ? `<script setup lang="ts">\ndefineProps<{ ${names.map((n) => `${n}: string`).join('; ')} }>()\n</script>`
        : kind === 'script' ? stub.script : null
      const parts = [script && indent(script), indent(`<template>\n${body.trim()}\n</template>`), kind === 'style' ? indent(stub.style) : null].filter(Boolean)
      const head = propsAttr ? open.replace(propsAttr[0], '') : open
      return { start: s.start, end: s.blocks[0].contentEnd, text: `${head}\n${parts.join('\n')}\n` }
    }
    const order: BlockKind[] = ['script', 'template', 'style']
    const after = s.blocks.filter((b) => order.indexOf(b.kind) < order.indexOf(kind)).sort((a, b) => b.end - a.end)[0]
    const at = after ? after.end : s.blocks[0]?.start ?? closeAt
    return after ? { start: at, end: at, text: `\n${indent(stub[kind])}` } : { start: at, end: at, text: `${indent(stub[kind])}\n` }
  }
  const order: (BlockKind | 'snippet')[] = ['snippet', 'script', 'template', 'style']
  const ends = [
    ...model.snippets.map((s) => ({ kind: 'snippet' as const, end: s.end })),
    ...model.blocks.map((b) => ({ kind: b.kind, end: b.end })),
  ]
  const before = ends.filter((e) => order.indexOf(e.kind) <= order.indexOf(kind)).sort((a, b) => b.end - a.end)[0]
  const at = before ? before.end : model.meta ? model.meta.end : 0
  return { start: at, end: at, text: at === 0 ? `${stub[kind]}\n\n` : `\n\n${stub[kind]}` }
}
