import { computed, nextTick } from 'vue'
import {
  countMatching, deleteElement, duplicateElement, elementAt, elementTree, indentElement,
  matchingElements, moveElement, outdentElement, reparentElement, setText, unwrapElement,
  wrapElement, insertElementText,
} from '@/editor/ast.ts'
import { blockOf, insertBlock } from '@/editor/tabs.ts'
import { sanitizeSvg } from '@/icons/sanitize.ts'
import { iconSnippetBody, iconSnippetName } from '@/icons/snippet.ts'
import type { Icon } from '@/icons/types.ts'
import { rulesIn, type Rule } from '@/editor/css.ts'
import type { Edit, ElementInfo, LayerNode, Loc, StructureEdit } from '@/editor/ast.ts'
import { LIBRARY_NAMES } from '@pressed/core'
import { download } from '../templates'
import { applyEdits, editor, element, escapeRe, handle, markerTick, scopeTemplate, tabs } from './state'
import { goToOffset } from './navigation'
import { styleMarkers } from './style'

/**
 * Run one structure primitive and follow the element: `applyEdits` is one undo step, and the
 * caret lands on the moved tag so the property editor, the preview outline and the Layers
 * selection all stay on the same element. `loc` picks the element (a Layers row); `null` = the
 * caret's.
 */
function run(loc: Loc | null, fn: (source: string, el: ElementInfo) => StructureEdit) {
  // `start + 1`: at the `<` itself a preceding sibling that ends there would match first.
  const el = loc ? elementAt(editor.source, loc.start + 1) : element.value
  if (!el) return
  const { edits, selectAt } = fn(editor.source, el)
  if (!edits.length) return
  applyEdits(edits)
  if (selectAt != null) void nextTick(() => goToOffset(selectAt))
}

export const moveSelected = (dir: 'up' | 'down') => run(null, (s, el) => moveElement(s, el, dir))
export const indentSelected = () => run(null, indentElement)
export const outdentSelected = () => run(null, outdentElement)
export const duplicateSelected = () => run(null, duplicateElement)
export const deleteSelected = () => run(null, deleteElement)
export const setSelectedText = (text: string) => run(null, (s, el) => setText(s, el, text))

/** A Layers row: select it (caret at the tag's start — the same as clicking it in the preview). */
export const selectElement = (loc: Loc) => goToOffset(loc.start)

/** A Layers drag: move any element next to / into any other, not just the caret's. */
export const reparent = (loc: Loc, target: Loc, position: 'before' | 'after' | 'inside') =>
  run(loc, (s, el) => reparentElement(s, el, target, position))

/** The Layers `⋯` commands — they act on *that* row, which need not be the caret's element. */
const COMMANDS: Record<string, (source: string, el: ElementInfo) => StructureEdit> = {
  up: (s, el) => moveElement(s, el, 'up'),
  down: (s, el) => moveElement(s, el, 'down'),
  indent: indentElement,
  outdent: outdentElement,
  unwrap: unwrapElement,
  duplicate: duplicateElement,
  delete: deleteElement,
}

/** Layers `+`: put `text` (from the insert popup, `|` = caret) after / inside `after`, or at the end of the active block. */
export function insertText(text: string, after: Loc | null, position: 'after' | 'inside' = 'after') {
  const b = scopeTemplate.value
  if (!b) return
  const { edits, selectAt } = insertElementText(editor.source, text, after, { start: b.start, end: b.end }, position)
  applyEdits(edits)
  void nextTick(() => selectAt != null && goToOffset(selectAt))
}

/** `up` … `delete`, plus `wrap:<tag>` — the tag comes from the menu's `Wrap in…` list. */
export function runOnElement(loc: Loc, command: string) {
  const tag = command.startsWith('wrap:') ? command.slice('wrap:'.length) : null
  if (tag) return run(loc, (s, el) => wrapElement(s, el, tag))
  const fn = COMMANDS[command]
  if (fn) run(loc, fn)
}

/**
 * Which commands would do anything to the caret's element — the toolbar's disabled states.
 * Asking the primitive ("would this produce edits?") is one line and can never drift from what
 * the button then does; only `unwrap` needs its own test, because unwrapping an empty element
 * *is* a valid edit (it deletes it) and that is not what the button means.
 */
function capabilities(el: ElementInfo | null) {
  const s = editor.source
  const ok = (r: StructureEdit) => r.edits.length > 0
  return el
    ? {
        up: ok(moveElement(s, el, 'up')),
        down: ok(moveElement(s, el, 'down')),
        indent: ok(indentElement(s, el)),
        outdent: ok(outdentElement(s, el)),
        // `text` is present-but-empty for `<div></div>`: there is nothing to unwrap it into.
        unwrap: el.children.length > 0 || !!el.text?.value,
        duplicate: ok(duplicateElement(s, el)),
      }
    : { up: false, down: false, indent: false, outdent: false, unwrap: false, duplicate: false }
}

export const can = computed(() => capabilities(element.value))

/** The same, for any Layers row — the `⋯` menu's disabled items. `start + 1`: see `run`. */
export const canFor = (loc: Loc) => capabilities(elementAt(editor.source, loc.start + 1))

/** An icon is a snippet named `icon-*`, and the prefix is the whole distinction (plan-icons §1). */
export const isIcon = (name: string) => name.startsWith('icon-')

/**
 * Add an icon to the file as a shorthand `<snippet name="icon-*">`. Idempotent (re-picking one
 * the file already has is a no-op), one `applyEdits` so one `⌘Z` takes it away again, and it
 * deliberately does not enter the new scope: you add, then place (plan-icons §6).
 */
export function addIcon(icon: Icon) {
  const name = iconSnippetName(icon.name)
  if (tabs.value.snippets.some((s) => s.name === name)) return
  applyEdits([insertBlock(editor.source, tabs.value, 'snippet', name, null, iconSnippetBody(icon))])
}

/**
 * The icon snippet's own `<svg>`, for the insert Picker's badge.
 *
 * Security: this is file content — hand-editable text — rendered into the *app* DOM, not into
 * the null-origin runtime frame, so it goes through the same sanitiser the catalogue uses.
 * `null` (a rejection, or no `<svg>` at all) means the caller shows a text badge instead.
 */
export function iconGlyph(name: string): string | null {
  const snippet = tabs.value.snippets.find((s) => s.name === name)
  if (!snippet) return null
  const svg = /<svg\b([^>]*)>([\s\S]*)<\/svg\s*>/.exec(editor.source.slice(snippet.start, snippet.end))
  const viewBox = svg && /viewBox\s*=\s*"([^"]*)"/.exec(svg[1])
  if (!svg || !viewBox) return null
  const out = sanitizeSvg(svg[2])
  return 'body' in out ? `<svg viewBox="${viewBox[1]}">${out.body}</svg>` : null
}

/** What `Wrap ▾` offers on top of its own div/span/p: the library, then this file's snippets.
    Icons are out — wrapping a selection in a pictogram means nothing (plan-icons §8). */
export const wrapChoices = computed(() => [
  ...LIBRARY_NAMES,
  ...tabs.value.snippets.map((s) => s.name).filter((name) => !isIcon(name)),
])

/** What every insert popup offers — Layers' `+ Insert element` and the editor's `+ component`. */
export const insertables = computed(() => {
  const own = editor.components.filter((c) => !LIBRARY_NAMES.includes(c.name))
  return {
    components: editor.components.filter((c) => LIBRARY_NAMES.includes(c.name)),
    snippets: own.filter((c) => !isIcon(c.name)),
    // Their own kind, after the snippets: the badge is the glyph, so it carries one.
    icons: own.filter((c) => isIcon(c.name)).map((c) => ({ ...c, glyph: iconGlyph(c.name) })),
  }
})

export const layers = computed<LayerNode[]>(() =>
  scopeTemplate.value ? elementTree(editor.source, scopeTemplate.value) : [],
)

/**
 * Elements (by `loc.start`) with at least one *error* marker of their own — on the tag or an
 * attribute, not inside a child. The Layers row gets a red dot in front of the name.
 */
export const erroredElements = computed(() => {
  void markerTick.value
  const block = scopeTemplate.value
  if (!block || !handle.value) return new Set<number>()
  const errors = handle.value.markersIn({ start: block.start, end: block.end }).filter((m) => m.severity === 'error')
  const out = new Set<number>()
  const walk = (nodes: LayerNode[]) => {
    for (const n of nodes) {
      const own = (m: { start: number }) => m.start >= n.loc.start && m.start < n.loc.end && !n.children.some((c) => m.start >= c.loc.start && m.start < c.loc.end)
      if (errors.some(own)) out.add(n.loc.start)
      walk(n.children)
    }
  }
  walk(layers.value)
  return out
})

/** `N elements` — the tab strip already counts them for the same block. */
export const layerCount = computed(() => scopeTemplate.value?.count ?? 0)

/**
 * Layers RULES: the scope's own style block, each rule with how many elements it matches — and,
 * inside a snippet, the file-level rules that reach into it as well (`origin: null`), so a rule
 * that styles what you see is never simply missing from the list.
 */
export const scopeRules = computed(() => {
  const scope = editor.activeTab.scope
  const row = (rule: Rule, origin: string | null) => ({
    rule,
    selector: rule.selector,
    start: rule.start,
    origin,
    uses: countMatching(layers.value, rule.selector),
    markers: styleMarkers.value.filter((m) => m.start >= rule.start && m.start < rule.end),
  })
  const own = blockOf(tabs.value, { scope, kind: 'style' })
  const rows = own ? rulesIn(editor.source, own.start, own.end).map((r) => row(r, scope)) : []
  if (scope === null) return rows
  const file = blockOf(tabs.value, { scope: null, kind: 'style' })
  if (!file) return rows
  const reaching = rulesIn(editor.source, file.start, file.end)
    .filter((r) => matchingElements(layers.value, r.selector).length > 0)
    .map((r) => row(r, null))
  return [...rows, ...reaching]
})

/** Layers SCRIPT: a snippet's props (from the compiler) and the block's size. Null = no script block. */
export const scriptInfo = computed(() => {
  const scope = editor.activeTab.scope
  const block = blockOf(tabs.value, { scope, kind: 'script' })
  if (!block) return null
  const schema = scope === null ? null : editor.components.find((c) => c.name === scope)
  return {
    props: (schema?.props ?? []).map((p) => ({ name: p.name, type: `${p.type}${p.required ? '' : '?'}` })),
    lines: block.lines.last - block.lines.first + 1,
  }
})

/**
 * Rename a snippet: its `name="…"` plus every `<old …>` / `</old>` usage in any template.
 * ponytail: tag names by regex — a snippet name inside a string literal or comment would be
 * missed. Switch to the block tree if that ever bites.
 */
export function renameSnippet(from: string, to: string) {
  const name = to.trim()
  const snippet = tabs.value.snippets.find((s) => s.name === from)
  if (!snippet || !name || name === from || tabs.value.snippets.some((s) => s.name === name)) return
  const edits: Edit[] = [{ ...snippet.nameLoc, text: name }]
  const usage = new RegExp(`(</?)${escapeRe(from)}(?=[\\s/>])`, 'g')
  for (let m = usage.exec(editor.source); m; m = usage.exec(editor.source))
    edits.push({ start: m.index, end: m.index + m[0].length, text: m[1] + name })
  applyEdits(edits)
  if (editor.activeTab.scope === from) editor.activeTab = { scope: name, kind: editor.activeTab.kind }
}

/** Delete a snippet block and the blank line that separated it. Usages are left alone. */
export function deleteSnippet(name: string) {
  const snippet = tabs.value.snippets.find((s) => s.name === name)
  if (!snippet) return
  let { start, end } = snippet
  if (editor.source.startsWith('\n\n', end)) end += 2
  else if (editor.source.slice(0, start).endsWith('\n\n')) start -= 1
  applyEdits([{ start, end, text: '' }])
}

/**
 * Promote a snippet to a library file: in a browser that means handing the user the `.vue`.
 * ponytail: shorthand snippets are not valid SFCs on their own — wrap them first if that bites.
 */
export function promoteSnippet(name: string) {
  const body = new RegExp(`<snippet[^>]*name=["']${name}["'][^>]*>([\\s\\S]*?)</snippet\\s*>`).exec(editor.source)
  if (body) download(`${name}.vue`, body[1].trim())
}
