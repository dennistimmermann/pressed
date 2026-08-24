import { computed } from 'vue'
import { loopClause, matchingElements, parentOf } from '@/editor/ast.ts'
import { blockOf, insertBlock, tabsModel } from '@/editor/tabs.ts'
import { buildTree, type VarNode } from '@pressed/core'
import type { Loc } from '@/editor/ast.ts'
import { mappedPreviewRow, mappedRowType } from '../data'
import { applyEdits, editor, element, escapeRe, handle, markerTick, tabs } from './state'
import { layers } from './structure'
import { ruleAtCaret } from './style'

/**
 * Every diagnostic on the caret's element itself — the compiler's *and* the language service's
 * (`Property 'x' does not exist…`) — minus those that start inside a child element: a parent
 * does not report its children's errors. The Inspector matches them against the ranges it
 * already has, so a wrong attribute says why where you edit it, not only on hover in the editor.
 */
export const elementMarkers = computed(() => {
  void markerTick.value // markers live in Monaco; the tick is what makes reading them reactive
  const el = element.value
  if (!el || !handle.value) return []
  return handle.value.markersIn(el.loc).filter((m) => !el.children.some((c) => m.start >= c.start && m.start < c.end))
})

/**
 * PROPS: the scope's declared props with the value the current caller passes in.
 * ponytail: the compiler does not report call sites (SPEC §9.3), so the callers are found with
 * a regex over the source — `<temp label="Nozzle" …>`. Swap it for real call-site information
 * when the compiler grows it; the shape here is already what the pane wants.
 */
export const scopeProps = computed(() => {
  void markerTick.value
  const scope = editor.activeTab.scope
  if (scope === null) return null
  const schema = editor.components.find((c) => c.name === scope)
  const locs = propLocs(scope)
  const calls = [...editor.source.matchAll(new RegExp(`<${escapeRe(scope)}(\\s[^>]*?)?/?>`, 'g'))].map((m) => m[1] ?? '')
  const passed = (name: string) => {
    const m = new RegExp(`(:?)${escapeRe(name)}="([^"]*)"`).exec(calls[0] ?? '')
    return m ? (m[1] ? m[2] : `"${m[2]}"`) : null
  }
  return (schema?.props ?? []).map((p) => ({
    name: p.name,
    type: `${p.type}${p.required ? '' : '?'}`,
    value: passed(p.name),
    callers: calls.length,
    markers: locs[p.name] && handle.value ? handle.value.markersIn(locs[p.name]) : [],
  }))
})

/**
 * Where each declared prop is *written* — the `props="a b"` attribute of a shorthand snippet,
 * or its `defineProps<{ … }>` member. The compiler's schema has no source range, and the PROPS
 * rows need one to claim the diagnostics on it. Same two spots `addProp` writes into.
 * ponytail: Volar does not look inside `<snippet>` blocks (they are not SFC blocks), so today
 * only our own compiler messages can land on a prop row. The routing is here for when it does.
 */
function propLocs(scope: string): Record<string, { start: number; end: number }> {
  const source = editor.source
  const snippet = tabs.value.snippets.find((s) => s.name === scope)
  const out: Record<string, { start: number; end: number }> = {}
  if (!snippet) return out

  if (snippet.shorthand) {
    const head = source.slice(snippet.start, source.indexOf('>', snippet.start))
    const attr = /props="([^"]*)"/.exec(head)
    if (!attr) return out
    const base = snippet.start + attr.index + 'props="'.length
    for (const m of attr[1].matchAll(/[\w-]+/g)) out[m[0]] = { start: base + m.index, end: base + m.index + m[0].length }
    return out
  }

  const script = snippet.blocks.find((b) => b.kind === 'script')
  if (!script) return out
  const text = source.slice(script.contentStart, script.contentEnd)
  const from = text.indexOf('defineProps<{')
  const close = from < 0 ? -1 : text.indexOf('}>', from)
  if (close < 0) return out
  const base = script.contentStart + from + 'defineProps<{'.length
  const inner = text.slice(from + 'defineProps<{'.length, close)
  let at = 0
  for (const member of inner.split(/[;\n]/)) {
    const m = /^(\s*)([\w-]+)\??\s*:/.exec(member)
    if (m) out[m[2]] = { start: base + at + m[1].length, end: base + at + member.trimEnd().length }
    at += member.length + 1
  }
  return out
}

/**
 * The `v-for` aliases in scope at the caret — the element's own first, then its ancestors'.
 * `(item, i) in list` declares both names; they are the only variables that exist nowhere in
 * the row type, so without this the `{ }` picker cannot offer what the loop just introduced.
 */
const loopAliases = computed<{ path: string; hint: string }[]>(() => {
  const source = editor.source
  const out: { path: string; hint: string }[] = []
  let el = element.value
  while (el) {
    for (const name of loopClause(el.props.find((p) => p.name === 'v-for')?.value ?? '').aliases)
      if (!out.some((v) => v.path === name)) out.push({ path: name, hint: 'loop' })
    el = parentOf(source, el)
  }
  return out
})

/** What the Inspector's `{ }` picker offers: flat `row.*` leaves, or — in a scope — its props. */
export const variables = computed<{ path: string; hint: string }[]>(() => {
  if (editor.activeTab.scope !== null)
    return [...loopAliases.value, ...(scopeProps.value ?? []).map((p) => ({ path: p.name, hint: p.type }))]
  const out: { path: string; hint: string }[] = [...loopAliases.value]
  const walk = (nodes: VarNode[]) => {
    for (const n of nodes) if (n.kind === 'leaf') out.push({ path: n.path, hint: n.value }); else walk(n.children)
  }
  walk(buildTree(mappedRowType.value, mappedPreviewRow.value))
  return out
})

/**
 * `+ prop`: one text edit wherever the snippet already declares its props — the `props="…"`
 * attribute of a shorthand snippet, or the `defineProps<{ … }>()` type literal of its script.
 * A full snippet without a script needs the block first, which is the one two-edit case.
 */
export function addProp(name: string) {
  const scope = editor.activeTab.scope
  const clean = name.trim().replace(/[^\w-]/g, '')
  const snippet = tabs.value.snippets.find((s) => s.name === scope)
  if (!snippet || !clean || scope === null) return
  const source = editor.source

  if (snippet.shorthand) {
    const open = source.indexOf('>', snippet.start)
    const head = source.slice(snippet.start, open)
    const attr = /props="([^"]*)"/.exec(head)
    if (!attr) return applyEdits([{ start: open, end: open, text: ` props="${clean}"` }])
    const at = snippet.start + attr.index + 'props="'.length + attr[1].length
    return applyEdits([{ start: at, end: at, text: `${attr[1].trim() ? ' ' : ''}${clean}` }])
  }

  let script = snippet.blocks.find((b) => b.kind === 'script')
  if (!script) {
    applyEdits([insertBlock(source, tabs.value, 'script', undefined, scope)])
    script = blockOf(tabsModel(editor.source), { scope, kind: 'script' })
    if (!script) return
  }
  const text = editor.source.slice(script.contentStart, script.contentEnd)
  const from = text.indexOf('defineProps<{')
  const close = from < 0 ? -1 : text.indexOf('}>', from)
  if (close < 0) {
    const at = script.contentStart
    return applyEdits([{ start: at, end: at, text: `\ndefineProps<{ ${clean}: string }>()\n` }])
  }
  const inner = text.slice(from + 'defineProps<{'.length, close)
  const indent = /\n([ \t]*)\S/.exec(inner)?.[1] ?? '  '
  let at = script.contentStart + close
  while (/\s/.test(editor.source[at - 1])) at-- // land after the last member, not on the brace
  applyEdits([{ start: at, end: at, text: inner.includes('\n') ? `\n${indent}${clean}: string` : `; ${clean}: string` }])
}

/** Rule mode: the elements the rule at the caret matches — `USED BY`, and (phase 5) the outlines. */
export const ruleUsage = computed(() =>
  ruleAtCaret.value ? matchingElements(layers.value, ruleAtCaret.value.selector) : [],
)
export const matchedLocs = computed<Loc[]>(() => ruleUsage.value.map((n) => n.loc))
