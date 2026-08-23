import { computed, nextTick, reactive, ref, shallowRef, toRaw, watch } from 'vue'
import { parseMeta } from '@pressed/core/template/meta.ts'
import { labelDocument } from '@pressed/core/template/label.ts'
import { debounce, RenderSuperseded } from '@/editor/runtime-client.ts'
import {
  attributeEdit, countMatching, deleteElement, duplicateElement, elementAt, elementTree,
  indentElement, loopClause, matchingElements, moveElement, outdentElement, parentOf, reparentElement, setText,
  unwrapElement, wrapElement, insertElementText,
} from '@/editor/ast.ts'
import { blockOf, insertBlock, tabAt, tabKey, tabsModel, type TabBlock } from '@/editor/tabs.ts'
import { findRule, ruleAt, rulesIn, setDeclaration, type Rule, type StyleTarget } from '@/editor/css.ts'
import { buildTree, type VarNode } from '@/editor/inspector/row-tree.ts'
import type { BlockKind, TabRef } from '@/editor/tabs.ts'
import type { Edit, ElementInfo, LayerNode, Loc, StructureEdit } from '@/editor/ast.ts'
import type { EditorHandle } from '@/editor/editor-handle.ts'
import { getPath, isWarning, LIBRARY_NAMES, rowPathsUsed } from '@pressed/core'
import type { Assets, ComponentSchema, Message, Meta, RenderedLabel } from '@pressed/core'
import { runtime } from '@/render/runtime-client'
import { data, mappedPreviewRow, mappedRowType, mapping, sourceFields } from './data'
import { settings } from './settings'
import {
  bundled, download, findTemplate, isBundled, newTemplate, refreshTemplates, saveTemplate,
  templateName,
} from './templates'

/**
 * The editor's live state. It lives in a store, not in EditorView, for two reasons: the
 * unsaved buffer must survive switching to the Data view and back, and the top bar's
 * `60 × 40 · margin 2` badge reads the *buffer's* `<meta>`, not the saved record's.
 */
export const editor = reactive({
  templateId: null as string | null,
  source: '',
  /** The last saved text — `dirty` is simply "differs from this". */
  savedSource: '',
  savedAt: null as number | null,
  assets: {} as Assets,
  caret: 0,
  messages: [] as Message[],
  components: [] as ComponentSchema[],
  /** Last *good* render; a compile error keeps it on screen (design §3.7). */
  label: null as RenderedLabel | null,
  manageOpen: false,
  /** Which block the tab strip shows (README-tabs §1). The label's template is the way in. */
  activeTab: { scope: null, kind: 'template' } as TabRef,
  /** Caret per tab, remembered for the session only (README-tabs §9). */
  caretByTab: {} as Record<string, number>,
  labelSetupOpen: false,
})

/** The text editor's handle (WP1 hands it over on `ready`); shallow — it is functions, not data. */
export const handle = shallowRef<EditorHandle | null>(null)

/** Monaco owns the markers; this bumps whenever they change (see `elementMarkers`). */
const markerTick = ref(0)
let stopMarkers: (() => void) | undefined
watch(handle, (h) => {
  stopMarkers?.()
  stopMarkers = h?.onMarkersChange(() => markerTick.value++)
})

export const meta = computed(() => parseMeta(editor.source).meta)
export const dirty = computed(() => editor.source !== editor.savedSource)
export const filename = computed(() => `${meta.value.name}.vue`)

/** The standalone label document the preview shows — the same one that goes to print. */
export const previewDocument = computed(() =>
  editor.label ? labelDocument(editor.label, meta.value.size, false, meta.value.margin ?? 0) : null,
)

export const errorCount = computed(() => editor.messages.filter((m) => !isWarning(m)).length)
export const warningCount = computed(() => editor.messages.filter(isWarning).length)

/** SPEC §3 E10 · E11: what the canvas is showing. Which rows are *selected* is print's business. */
export const previewState = computed<'ok' | 'error' | 'no-data'>(() =>
  errorCount.value ? 'error' : !data.rows.length ? 'no-data' : 'ok',
)

/** Every `row.…` the template reads — the Data view's checklist of what a source must supply. */
export const neededPaths = computed(() => rowPathsUsed(editor.source))

/**
 * Per needed path: `true` the mapped row has a value there, `false` nothing does, `null` there
 * is no data to judge by yet. Reading the *mapped* row means an identity match and an explicit
 * mapping are the same answer — a source whose names already fit needs no mapping at all.
 */
export const mappedState = computed<Record<string, boolean | null>>(() =>
  Object.fromEntries(neededPaths.value.map((path) => [
    path,
    data.rows.length ? getPath(mappedPreviewRow.value, path.slice('row.'.length)) !== undefined : null,
  ])),
)

/**
 * What actually feeds each template variable: the user's explicit mappings, plus the source
 * field of the very same name for every needed path that is satisfied without one. A source
 * whose names already fit needs no mapping — but it *is* wired, and F5 is what happens when
 * only one of the two Data tabs knows that: `3 / 3 wired` over a single drawn wire (atlas 05).
 * Both the count and the picture read this.
 */
export const effectiveMapping = computed<Record<string, string>>(() => {
  const out = { ...mapping.value }
  const fields = new Set(sourceFields.value.map((f) => f.path))
  const taken = new Set(Object.values(out))
  for (const path of neededPaths.value) {
    const target = path.slice('row.'.length)
    if (!taken.has(target) && fields.has(target)) out[target] = target
  }
  return out
})

/** Which needed paths something is wired to — one number, used by every badge in the view. */
export const wiredPaths = computed(() => {
  const targets = new Set(Object.values(effectiveMapping.value))
  return neededPaths.value.filter((p) => targets.has(p.slice('row.'.length)))
})

// ---------------------------------------------------------------- templates

export async function initEditor() {
  await refreshTemplates()
  // First run opens the bundled spool example (design §3.7).
  const first = bundled.find((t) => t.id === 'Grocery 40x30') ?? bundled[0]
  load(findTemplate(settings.lastTemplateId)?.id ?? first.id)
}

export function load(id: string) {
  const record = findTemplate(id)
  if (!record) return
  editor.templateId = id
  editor.source = record.source
  editor.savedSource = record.source
  editor.assets = record.assets
  editor.savedAt = record.updatedAt || null
  // A different file has different blocks: pick up where this one was left, forget the old
  // carets. A remembered scope/block that no longer exists falls back to the file's template.
  const remembered = settings.tabByTemplate[id]
  editor.activeTab = remembered && blockOf(tabsModel(record.source), remembered) ? { ...remembered } : { scope: null, kind: 'template' }
  editor.caretByTab = {}
  settings.lastTemplateId = id
  // A different label is a different fit: zoom never carries across labels of different size
  // (F21, atlas 35). Here rather than in the canvas, because the template can be switched from
  // the Data view — with the Editor unmounted, there is no canvas to notice.
  settings.zoomCanvas = 'fit'
  settings.zoomPreview = 'fit'
  render()
}

/**
 * ⌘S. Bundled examples are files in the app bundle, so saving one saves a copy you own —
 * that is what "edit the example" has to mean without a writable bundle.
 */
export async function save() {
  if (!editor.templateId) return
  const record = isBundled(editor.templateId)
    ? await newTemplate(editor.source, templateName(findTemplate(editor.templateId)!))
    : await saveTemplate(editor.templateId, editor.source, editor.assets)
  editor.templateId = record.id
  editor.savedSource = record.source
  editor.savedAt = record.updatedAt
  settings.lastTemplateId = record.id
}

export async function saveAs(name: string) {
  const record = await newTemplate(editor.source, name)
  load(record.id)
}

// ---------------------------------------------------------------- render

/** Design §4: 150ms debounce from keystroke to compile+render in the runtime frame. */
export const scheduleRender = debounce(render, 150)

let renderToken = 0

export async function render() {
  const source = editor.source
  // Requests run concurrently on the shared frame now; only the newest may write the store.
  const mine = ++renderToken
  try {
    // No rows yet → render with `row = {}` so field paths stay visible (design §3.7).
    // `toRaw`: postMessage structured-clones its payload, and a Vue proxy cannot be cloned.
    const result = await runtime().render({
      source,
      assets: toRaw(editor.assets),
      rows: data.rows.length ? [toRaw(mappedPreviewRow.value)] : [],
      inspector: true,
    })
    if (mine !== renderToken) return // an older render finishing late must not clobber a newer one
    editor.messages = result.errors
    editor.components = result.components
    // Last *good* render: a fatal message returns an empty html[0], which `!= null` let
    // through — the preview blanked instead of keeping the previous label (found during the
    // renderer experiments; engine-independent).
    const fatal = result.errors.some((e) => !isWarning(e))
    if (!fatal && result.html[0] != null) editor.label = { html: result.html[0], css: result.css }
  } catch (e) {
    if (mine !== renderToken || e instanceof RenderSuperseded) return
    editor.messages = [{ kind: 'render', message: e instanceof Error ? e.message : String(e), file: 'main' }]
  }
}

watch(() => [editor.source, mappedPreviewRow.value] as const, scheduleRender)

// ---------------------------------------------------------------- caret

/**
 * The element the caret sits in: the Inspector's target, the Layers ring, the canvas outline.
 * `elementAt` falls back to the block's own `<template>` / `<snippet>` wrapper when the caret
 * sits in empty template space — that is not a selectable element (E9 wants `nothing selected`),
 * and it starts before the block's content does, which is how we tell.
 */
export const element = computed(() => {
  const el = elementAt(editor.source, editor.caret)
  const block = scopeTemplate.value
  return el && block && el.loc.start < block.contentStart ? null : el
})
const norm = (name: string) => name.replace(/-/g, '').toLowerCase()
export const elementSchema = computed(
  () => editor.components.find((c) => element.value && norm(c.name) === norm(element.value.tag)) ?? null,
)
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
 * Every diagnostic in the style block(s) the Inspector and Layers read rules from — the scope's
 * own and, inside a snippet, the label's as well (same pair `styleTargets` collects rules from).
 * The panes filter it down to one rule; markers are Monaco's, so the tick makes it reactive.
 */
export const styleMarkers = computed(() => {
  void markerTick.value
  const h = handle.value
  if (!h) return []
  const scope = editor.activeTab.scope
  return (scope === null ? [null] : [scope, null])
    .flatMap((sc) => blockOf(tabs.value, { scope: sc, kind: 'style' }) ?? [])
    .flatMap((block) => h.markersIn(block))
})

export const caretLine = computed(
  () => editor.source.slice(0, element.value?.loc.start ?? editor.caret).split('\n').length,
)

/**
 * Status rows and render errors carry `file:line:col`; the editor speaks offsets. Snippet
 * lines are relative to the snippet body, so we start counting at its opening tag.
 * ponytail: shorthand snippets are wrapped in a synthetic `<template>` before compiling, so
 * their line numbers can be one off — it still lands inside the right block.
 */
export function offsetOf(loc: { file: string; line?: number; col?: number }): number | null {
  if (!loc.line) return null
  const source = editor.source
  let base = 0
  if (loc.file.startsWith('snippet:')) {
    const name = loc.file.slice('snippet:'.length)
    const open = new RegExp(`<snippet[^>]*name=["']${name}["'][^>]*>\\r?\\n?`).exec(source)
    if (!open) return null
    base = open.index + open[0].length
  }
  const lines = source.slice(base).split('\n')
  let offset = base
  for (let i = 0; i < loc.line - 1 && i < lines.length; i++) offset += lines[i].length + 1
  return offset + Math.max(0, (loc.col ?? 1) - 1)
}

/**
 * Which tab owns a message. A compile error often names only the file (`snippet:temp`) —
 * that is still enough to badge the snippet, so fall back to the block the name points at.
 */
export function tabOf(loc: { file: string; line?: number; col?: number }): TabRef | null {
  const offset = offsetOf(loc)
  if (offset != null) return tabAt(tabs.value, offset)
  if (loc.file.startsWith('snippet:')) {
    const snippet = tabs.value.snippets.find((s) => s.name === loc.file.slice('snippet:'.length))
    return snippet ? tabAt(tabs.value, snippet.start) : null
  }
  return { scope: null, kind: 'template' }
}

/** Clicking a Status row jumps the caret — switching tabs on the way if it lives elsewhere. */
export function jumpTo(loc: { file: string; line?: number; col?: number }) {
  const offset = offsetOf(loc)
  if (offset != null) return goToOffset(offset)
  const tab = tabOf(loc)
  if (tab) switchTab(tab)
}

// ---------------------------------------------------------------- tabs (README-tabs.md)

/** Cheap enough to recompute on every keystroke — it is one pass over the block tree. */
export const tabs = computed(() => tabsModel(editor.source))
export const activeBlock = computed(() => blockOf(tabs.value, editor.activeTab))
/** The lines the editor shows; everything outside them is hidden, numbering keeps counting. */
export const visible = computed(() => (settings.editorView === 'file' ? null : activeBlock.value?.lines ?? null))

// Whole-file view: the tabs are a readout, not a filter — they follow the caret into whichever
// block (and scope) it sits in. `switchTab` still works the other way round and just moves the caret.
watch(() => [editor.caret, settings.editorView] as const, ([caret, view]) => {
  if (view !== 'file') return
  const tab = tabAt(tabs.value, caret)
  if (tab && tabKey(tab) !== tabKey(editor.activeTab)) editor.activeTab = tab
})

export type Badge = { level: 'error' | 'warning'; count: number }

/**
 * A message's location decides which tab owns it, so a Script error is visible while you
 * work in Template (README-tabs §3). Keyed by `tabKey`; the strip sums a snippet pill from
 * its own blocks.
 */
export const badges = computed(() => {
  const out: Record<string, Badge> = {}
  const add = (key: string, level: Badge['level']) => {
    const prev = out[key]
    out[key] = { level: prev?.level === 'error' || level === 'error' ? 'error' : level, count: (prev?.count ?? 0) + 1 }
  }
  for (const m of editor.messages) {
    const tab = tabOf(m)
    if (!tab) continue
    add(tabKey(tab), isWarning(m) ? 'warning' : 'error')
  }
  return out
})

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)

function place(start: number, end?: number) {
  editor.caret = start
  handle.value?.setCaret(start, end)
  handle.value?.revealOffset(start)
  handle.value?.focus()
}

/**
 * Select a tab, remembering where the caret was in the one we are leaving. `at` overrides the
 * remembered position (a jump from Status or the preview). A tab whose block is gone is a no-op.
 * The caret is placed after the render so the editor has already unhidden the new lines.
 */
export function switchTab(tab: TabRef, at?: { start: number; end?: number }) {
  const block = blockOf(tabs.value, tab)
  if (!block) return
  if (tabKey(tab) !== tabKey(editor.activeTab)) {
    editor.caretByTab[tabKey(editor.activeTab)] = editor.caret
    editor.activeTab = tab
  }
  const remembered = editor.caretByTab[tabKey(tab)] ?? block.contentStart
  const start = at?.start ?? clamp(remembered, block.contentStart, block.contentEnd)
  void nextTick(() => place(start, at?.end))
}

/** Preview clicks and Status jumps: find the owning tab, enter it, land on the offset. */
export function goToOffset(offset: number, end?: number) {
  const tab = tabAt(tabs.value, offset)
  if (tab) switchTab(tab, { start: offset, end })
  else place(offset, end) // between blocks (or in `<meta>`): nothing to switch to
}

export function enterScope(name: string) {
  const snippet = tabs.value.snippets.find((s) => s.name === name)
  const block = snippet?.blocks.find((b) => b.kind === 'template') ?? snippet?.blocks[0]
  if (block) switchTab({ scope: name, kind: block.kind })
}

export function leaveScope() {
  const kind = tabs.value.blocks.find((b) => b.kind === 'template')?.kind ?? tabs.value.blocks[0]?.kind
  if (kind) switchTab({ scope: null, kind })
}

/** Every edit goes through the handle so it shares the editor's one undo stack (design §3.4). */
function applyEdits(edits: Edit[]) {
  if (handle.value) return handle.value.executeEdits(edits)
  // Before the editor is ready: apply back-to-front so earlier offsets stay valid.
  for (const e of [...edits].sort((a, b) => b.start - a.start))
    editor.source = editor.source.slice(0, e.start) + e.text + editor.source.slice(e.end)
}

/** Add a missing block, or a new snippet; inserted in file order, the new tab opens focused. */
export function addBlock(kind: BlockKind | 'snippet', name?: string) {
  const scope = editor.activeTab.scope
  const taken = new Set(tabs.value.snippets.map((s) => s.name))
  let snippetName = name?.trim() ?? ''
  for (let n = 1; !snippetName || taken.has(snippetName); n++) snippetName = `snippet-${n}`
  applyEdits([insertBlock(editor.source, tabs.value, kind, snippetName, kind === 'snippet' ? null : scope)])
  const tab: TabRef = kind === 'snippet' ? { scope: snippetName, kind: 'template' } : { scope, kind }
  void nextTick(() => switchTab(tab))
}

/** Format the active block (whole file when nothing is hidden) with the language service. */
export function formatBlock() {
  const b = activeBlock.value
  return handle.value?.format(b ? { start: b.contentStart, end: b.contentEnd } : undefined)
}

/**
 * From an element's class to its rule: open `.cls` on the Style tab of the current scope
 * (a snippet's own style first, then the label's), creating the block and/or the rule when
 * they don't exist yet — an empty rule with the caret inside is the honest starting point.
 */
/** The rule for `.cls` as seen from the current scope: the snippet's own style first, then the label's. */
export function ruleFor(cls: string) {
  const scope = editor.activeTab.scope
  for (const sc of scope === null ? [null] : [scope, null]) {
    const block = blockOf(tabs.value, { scope: sc, kind: 'style' })
    const rule = block && findRule(rulesIn(editor.source, block.start, block.end), cls)
    if (rule) return rule
  }
  return null
}

export type { StyleTarget }

/**
 * Which style block a rule lives in — a snippet's name, or `null` for the file-level one.
 * Inside a snippet scope the panes read two blocks, and every rule has to say which.
 */
export function originOf(rule: Rule): string | null {
  const scope = editor.activeTab.scope
  const block = scope === null ? undefined : blockOf(tabs.value, { scope, kind: 'style' })
  return block && rule.start >= block.start && rule.end <= block.end ? scope : null
}

/** Every rule visible from the current scope, file-level first — cascade order, the scoped one wins. */
function visibleRules(): { origin: string | null; rule: Rule }[] {
  const scope = editor.activeTab.scope
  const out: { origin: string | null; rule: Rule }[] = []
  for (const sc of scope === null ? [null] : [null, scope]) {
    const block = blockOf(tabs.value, { scope: sc, kind: 'style' })
    if (block) for (const rule of rulesIn(editor.source, block.start, block.end)) out.push({ origin: sc, rule })
  }
  return out
}

/**
 * All rules that apply to the element at the caret (simple selectors, comma lists), lowest
 * specificity first. One pill per *(selector, origin)*: with `.k` in both blocks you get two,
 * the file's then the snippet's, which is the order they cascade in.
 */
export const styleTargets = computed<StyleTarget[]>(() => {
  const el = element.value
  if (!el) return []
  const attr = (name: string) => el.props.find((p) => p.name === name && !p.isBinding)?.value
  const classes = attr('class')?.split(/\s+/).filter(Boolean) ?? []
  const id = attr('id')?.trim()
  const rules = visibleRules()
  const forSelector = (kind: StyleTarget['kind'], selector: string): StyleTarget[] => {
    const hits = rules.filter((r) => r.rule.selector.split(',').some((part) => part.trim() === selector))
    return hits.length
      ? hits.map((h) => ({ kind, selector, label: selector, rule: h.rule, origin: h.origin }))
      : [{ kind, selector, label: selector, rule: null }]
  }
  const targets: StyleTarget[] = [
    ...forSelector('global', '*'),
    ...forSelector('tag', el.tag),
    ...classes.flatMap((c) => forSelector('class', `.${c}`)),
    ...(id ? forSelector('id', `#${id}`) : []),
  ]
  // Globals and element rules only show up when they exist; classes/ids are the element's own and always show.
  return targets.filter((t) => t.rule || t.kind === 'class' || t.kind === 'id')
})

/**
 * Make sure a rule with this selector exists in the *active scope's* style block. Returns the
 * offset inside its braces. Creation always lands in the block you are editing — inside a
 * snippet that is its own scoped block; the label's is one ⌥⇧← away.
 */
export function ensureSelector(selector: string): number {
  const scope = editor.activeTab.scope
  const rules = (blockOf(tabs.value, { scope, kind: 'style' }) as TabBlock | undefined)
  const existing = rules && rulesIn(editor.source, rules.start, rules.end).find((r) => r.selector.split(',').some((p) => p.trim() === selector))
  if (existing) return existing.bodyStart + 1
  if (!rules) applyEdits([insertBlock(editor.source, tabs.value, 'style', undefined, scope)])
  const block = blockOf(tabsModel(editor.source), { scope, kind: 'style' })!
  const body = editor.source.slice(block.contentStart, block.contentEnd)
  const text = `${body.trimEnd() ? '\n' : ''}${selector} {  }\n`
  const at = block.contentStart + body.trimEnd().length
  applyEdits([{ start: at, end: at, text }])
  return at + text.indexOf('{') + 2
}

/** Single-class rules visible from the current scope (snippet's own style + the label's), by name. */
export function availableClasses(): { name: string; declarations: number; origin: string | null }[] {
  const scope = editor.activeTab.scope
  const out = new Map<string, { name: string; declarations: number; origin: string | null }>()
  // Snippet's own first, so a class defined in both is offered as the one that wins.
  for (const sc of scope === null ? [null] : [scope, null]) {
    const block = blockOf(tabs.value, { scope: sc, kind: 'style' })
    if (!block) continue
    for (const r of rulesIn(editor.source, block.start, block.end)) {
      const cls = /^\.([\w-]+)$/.exec(r.selector)?.[1]
      if (cls && !out.has(cls)) out.set(cls, { name: cls, declarations: r.declarations.length, origin: sc })
    }
  }
  return [...out.values()]
}

/**
 * Make sure `.cls { }` exists (adding the style block first if needed). Returns its offset.
 * An existing rule, wherever the scope sees it from, wins over creating a new one.
 */
export function ensureRule(cls: string): number {
  const existing = ruleFor(cls)
  return existing ? existing.bodyStart + 1 : ensureSelector(`.${cls}`)
}

/** Class chip / Style tab → the rule on the Style tab, created on demand. */
export function openRule(cls: string) {
  const at = ensureRule(cls)
  void nextTick(() => goToOffset(at))
}

/** Add a class to the element at the caret (and make sure its rule exists). */
export function addClassToElement(name: string) {
  const el = element.value
  const cls = name.trim().replace(/^\./, '')
  if (!el || !cls || !handle.value) return
  const current = el.props.find((p) => p.name === 'class' && !p.isBinding)?.value ?? ''
  const classes = current.split(/\s+/).filter(Boolean)
  if (!classes.includes(cls)) applyEdits([attributeEdit(el, 'class', 'set-static', [...classes, cls].join(' '))])
  ensureRule(cls)
}

/**
 * Rename a rule's selector. When both old and new are single classes (`.a` → `.b`) the class is
 * renamed in every static `class="…"` in the file too, so markup and style stay in step.
 */
export function renameRule(rule: Rule, selector: string) {
  const edits: Edit[] = [{ start: rule.start, end: editor.source.indexOf('{', rule.start), text: `${selector} ` }]
  const from = /^\.([\w-]+)$/.exec(rule.selector)?.[1], to = /^\.([\w-]+)$/.exec(selector)?.[1]
  if (from && to) {
    const attr = /class="([^"]*)"/g
    for (let m = attr.exec(editor.source); m; m = attr.exec(editor.source)) {
      const classes = m[1].split(/\s+/)
      if (!classes.includes(from)) continue
      const start = m.index + 'class="'.length
      edits.push({ start, end: start + m[1].length, text: classes.map((c) => (c === from ? to : c)).join(' ') })
    }
  }
  applyEdits(edits.sort((a, b) => b.start - a.start))
}

/**
 * Delete a rule for good: the rule itself, and — when its selector is a single class — that
 * class in every static `class="…"` of the file (main template and snippets alike).
 */
export function deleteRule(rule: Rule) {
  const edits: Edit[] = []
  let end = rule.end
  if (editor.source[end] === '\n') end++
  edits.push({ start: rule.start, end, text: '' })
  const cls = /^\.([\w-]+)$/.exec(rule.selector)?.[1]
  if (cls) {
    const attr = /\s?class="([^"]*)"/g
    for (let m = attr.exec(editor.source); m; m = attr.exec(editor.source)) {
      const classes = m[1].split(/\s+/).filter(Boolean)
      if (!classes.includes(cls)) continue
      const rest = classes.filter((c) => c !== cls)
      // Last class gone → drop the whole attribute (with its leading space); else rewrite the value.
      edits.push(rest.length
        ? { start: m.index + m[0].indexOf('"') + 1, end: m.index + m[0].length - 1, text: rest.join(' ') }
        : { start: m.index, end: m.index + m[0].length, text: '' })
    }
  }
  applyEdits(edits.sort((a, b) => b.start - a.start))
}

/** Take a class off the element at the caret; the rule is left alone. */
export function removeClassFromElement(cls: string) {
  const el = element.value
  if (!el) return
  const current = el.props.find((p) => p.name === 'class' && !p.isBinding)?.value ?? ''
  const rest = current.split(/\s+/).filter((c) => c && c !== cls)
  applyEdits([attributeEdit(el, 'class', rest.length ? 'set-static' : 'remove', rest.join(' '))])
}

// ---------------------------------------------------------------- structure (plan §2)

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
export const wrapSelected = (tag: string) => run(null, (s, el) => wrapElement(s, el, tag))
export const unwrapSelected = () => run(null, unwrapElement)
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

/** What `Wrap ▾` offers on top of its own div/span/p: the library, then this file's snippets. */
export const wrapChoices = computed(() => [...LIBRARY_NAMES, ...tabs.value.snippets.map((s) => s.name)])

/** What every insert popup offers — Layers' `+ Insert element` and the editor's `+ component`. */
export const insertables = computed(() => ({
  components: editor.components.filter((c) => LIBRARY_NAMES.includes(c.name)),
  snippets: editor.components.filter((c) => !LIBRARY_NAMES.includes(c.name)),
}))

/**
 * The template block of the scope we are in — what Layers shows on *every* block tab
 * (SPEC §4.2), not only while the template tab is the active one.
 */
const scopeTemplate = computed(() => blockOf(tabs.value, { scope: editor.activeTab.scope, kind: 'template' }))

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

/** The rule the caret sits in while a style block is active — the ringed RULES row. */
export const ruleAtCaret = computed(() =>
  editor.activeTab.kind === 'style' ? ruleAt(editor.source, editor.caret) : null,
)

/** Which block that rule lives in — the Inspector's SELECTOR meta and the direction of `Move`. */
export const ruleOrigin = computed(() => (ruleAtCaret.value ? originOf(ruleAtCaret.value) : null))

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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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

// ---------------------------------------------------------------- Inspector (SPEC §4.3 · §4.4)

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

// ------------------------------------------------- what the browser actually computes

/**
 * The effective value of the enumerated STYLE properties, per rendered element — measured inside
 * the preview frame and pushed out once per document (see `PreviewPane`'s inspector script).
 * Keyed by the `data-loc` string, which is file-absolute, so it matches an element's `loc`
 * directly. Every mount of the canvas posts its own copy; last write wins, they are identical.
 */
export const computedStyles = shallowRef<Record<string, Record<string, string>>>({})

/** Browser vocabulary → the words the controls offer. Anything not listed passes through. */
const CANON: Record<string, Record<string, string>> = {
  'justify-content': { normal: 'flex-start', start: 'flex-start', end: 'flex-end', left: 'flex-start', right: 'flex-end' },
  'align-items': { normal: 'stretch', start: 'flex-start', end: 'flex-end' },
  'text-align': { start: 'left', end: 'right' },
}

export function setComputedStyles(styles: Record<string, Record<string, string>>) {
  const out: Record<string, Record<string, string>> = {}
  for (const [loc, props] of Object.entries(styles)) {
    const one: Record<string, string> = {}
    for (const [prop, raw] of Object.entries(props)) {
      // Per-side shorthands (`none solid none solid`) are nothing a single control can show.
      if (!raw || raw.includes(' ')) continue
      one[prop === 'text-decoration-line' ? 'text-decoration' : prop] = CANON[prop]?.[raw] ?? raw
    }
    out[loc] = one
  }
  computedStyles.value = out
}

/** The snapshot the Inspector is on: the caret's element, or — in rule mode — the rule's first user. */
export const elementComputed = computed(() => {
  const loc = ruleAtCaret.value ? ruleUsage.value[0]?.loc : element.value?.loc
  return loc ? computedStyles.value[`${loc.start}:${loc.end}`] : undefined
})

// ---------------------------------------------------------------- the canvas (SPEC §4.5)

/**
 * The snippet block we are scoped to — what the canvas keeps at full strength while
 * everything else drops to 32%. `null` in the label scope: nothing is out of scope there.
 */
export const scopeRange = computed<Loc | null>(() => {
  const s = tabs.value.snippets.find((x) => x.name === editor.activeTab.scope)
  return s ? { start: s.start, end: s.end } : null
})

/** Selecting across scopes is impossible (SPEC §6), so only ranges in this scope's template count. */
const inScope = (loc: Loc) => {
  const b = scopeTemplate.value
  return !!b && loc.start >= b.start && loc.end <= b.end
}

/**
 * A canvas click sends the whole ancestor chain (innermost first, a snippet's root carrying
 * both its own range and its call site's): the first range that belongs to this scope is the
 * element the click means. In the label scope that is the `<badge …>` call, inside the badge
 * scope it is the element the snippet itself declares.
 */
const pickLoc = (locs: Loc[]) => locs.find(inScope) ?? null

export function canvasSelect(locs: Loc[]) {
  const loc = pickLoc(locs)
  if (loc) goToOffset(loc.start, loc.end)
}

/** Double-click a snippet instance and you are in its scope; anything else just selects. */
export function canvasEnterScope(locs: Loc[]) {
  const loc = pickLoc(locs)
  const el = loc && elementAt(editor.source, loc.start + 1)
  if (el && tabs.value.snippets.some((s) => s.name === el.tag)) enterScope(el.tag)
  else canvasSelect(locs)
}

/** A canvas drag: the same primitive a Layers drag runs, so it is one text edit and one ⌘Z. */
export function canvasReorder(e: { locs: Loc[]; target: Loc[]; position: 'before' | 'after' | 'inside' }) {
  const loc = pickLoc(e.locs), target = pickLoc(e.target)
  if (loc && target && loc.start !== target.start) reparent(loc, target, e.position)
}

/** Whether a handle drag has a rule to write into — the element's own class (SPEC §4.5). */
export const classTarget = computed(() => [...styleTargets.value].reverse().find((t) => t.kind === 'class') ?? null)

/**
 * A handle drag writes `width` (and `height`) into that class rule as **one** edit batch.
 * Two appends land on the same offset, so they are merged into one edit — Monaco never sees
 * two identical ranges, and ⌘Z takes the whole resize back.
 */
export function canvasResize({ width, height }: { width: number; height: number | null }) {
  const target = classTarget.value
  if (!target) return
  const at = target.rule ? target.rule.bodyStart + 1 : ensureSelector(target.selector)
  const rule = ruleAt(editor.source, at)
  if (!rule) return
  const props: [string, string][] = [['width', `${width}mm`]]
  if (height != null) props.push(['height', `${height}mm`])
  const edits = props.reduce<Edit[]>((acc, [prop, value]) => {
    const e = setDeclaration(editor.source, rule, prop, value)
    const same = acc.find((a) => a.start === e.start && a.end === e.end)
    if (same) same.text += e.text
    else acc.push({ ...e })
    return acc
  }, [])
  applyEdits(edits)
}

/**
 * A style change on a selector pill that has no rule yet: create the rule, then set the
 * declaration. Two edits (two ⌘Z) — the second one needs the offsets the first one produced.
 */
export function declare({ selector, prop, value }: { selector: string; prop: string; value: string | null }) {
  const at = ensureSelector(selector) // creates the rule — `editor.source` only has it after this
  const rule = ruleAt(editor.source, at)
  if (rule) applyEdits([setDeclaration(editor.source, rule, prop, value)])
}

/**
 * `Label setup…` writes back into the `<meta>` JSON as one text-range edit, so ⌘Z undoes it
 * like any other edit and the file stays the source of truth (README-tabs §6).
 */
export function writeMeta(patch: Omit<Partial<Meta>, 'size'> & { size?: Partial<Meta['size']> }) {
  const next: Meta = { ...meta.value, ...patch, size: { ...meta.value.size, ...patch.size } }
  const block = /<meta\b[^>]*>([\s\S]*?)<\/meta\s*>/i.exec(editor.source)
  applyEdits([
    block
      ? { start: block.index + block[0].indexOf('>') + 1, end: block.index + block[0].lastIndexOf('</'), text: `\n${JSON.stringify(next)}\n` }
      : { start: 0, end: 0, text: `<meta>\n${JSON.stringify(next)}\n</meta>\n\n` },
  ])
}

/** SPEC §6: scope per template, block per scope — remembered across sessions. */
watch(() => editor.activeTab, (tab) => {
  if (editor.templateId) settings.tabByTemplate[editor.templateId] = { ...tab }
}, { deep: true })

// A deleted block must not leave the strip pointing at nothing (README-tabs §7).
watch(tabs, (model) => {
  if (!blockOf(model, editor.activeTab)) editor.activeTab = { scope: null, kind: 'template' }
})
