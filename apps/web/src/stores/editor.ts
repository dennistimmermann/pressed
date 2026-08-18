import { computed, nextTick, reactive, shallowRef, toRaw, watch } from 'vue'
import { parseMeta } from '@sprint/core/template/meta.ts'
import { labelDocument } from '@sprint/core/template/label.ts'
import { RenderSuperseded } from '@sprint/editor/runtime-client.ts'
import { attributeEdit, elementAt } from '@sprint/editor/ast.ts'
import { blockOf, insertBlock, tabAt, tabKey, tabsModel, type TabBlock } from '@sprint/editor/tabs.ts'
import { findRule, rulesIn, type Rule } from '@sprint/editor/css.ts'
import type { BlockKind, TabRef } from '@sprint/editor/tabs.ts'
import type { Edit } from '@sprint/editor/ast.ts'
import type { EditorHandle } from '@sprint/editor/editor-handle.ts'
import type { Assets, ComponentSchema, Message, Meta, RenderedLabel } from '@sprint/core'
import { runtime } from '../runtime-client'
import { data, previewRow } from './data'
import { settings } from './settings'
import {
  bundled, download, findTemplate, isBundled, newTemplate, refreshTemplates, saveTemplate,
  templateName,
} from './templates'

/**
 * The editor's live state. It lives in a store, not in EditorView, for two reasons: the
 * unsaved buffer must survive switching to the Data view and back, and the top bar's
 * `60 × 40 · gap 2` badge reads the *buffer's* `<meta>`, not the saved record's.
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

export const meta = computed(() => parseMeta(editor.source).meta)
export const dirty = computed(() => editor.source !== editor.savedSource)
export const filename = computed(() => `${meta.value.name}.vue`)

/** The standalone label document the preview shows — the same one that goes to print. */
export const previewDocument = computed(() =>
  editor.label ? labelDocument(editor.label, meta.value.size) : null,
)

export const errorCount = computed(() => editor.messages.filter((m) => m.kind !== 'purity').length)
export const warningCount = computed(() => editor.messages.filter((m) => m.kind === 'purity').length)

/** Design §3.7: which of the four preview states we are in. */
export const previewState = computed<'ok' | 'error' | 'no-data' | 'no-row'>(() =>
  errorCount.value ? 'error'
    : !data.rows.length ? 'no-data'
      : !data.selected.size ? 'no-row'
        : 'ok',
)

// ---------------------------------------------------------------- templates

export async function initEditor() {
  await refreshTemplates()
  // First run opens the bundled Spool label example (design §3.7).
  const first = bundled.find((t) => t.id === 'Spool label') ?? bundled[0]
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
  // A different file has different blocks: start on its template, forget the old carets.
  editor.activeTab = { scope: null, kind: 'template' }
  editor.caretByTab = {}
  settings.lastTemplateId = id
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

let timer: ReturnType<typeof setTimeout> | undefined

/** Design §4: 150ms debounce from keystroke to compile+render in the runtime frame. */
export function scheduleRender() {
  clearTimeout(timer)
  timer = setTimeout(render, 150)
}

export async function render() {
  clearTimeout(timer)
  const source = editor.source
  try {
    // No rows yet → render with `row = {}` so field paths stay visible (design §3.7).
    // `toRaw`: postMessage structured-clones its payload, and a Vue proxy cannot be cloned.
    const result = await runtime().render({
      source,
      assets: toRaw(editor.assets),
      rows: data.rows.length ? [toRaw(previewRow.value)] : [],
      inspector: true,
    })
    editor.messages = result.errors
    editor.components = result.components
    if (result.html[0] != null) editor.label = { html: result.html[0], css: result.css }
  } catch (e) {
    if (e instanceof RenderSuperseded) return // a newer render is already on its way
    editor.messages = [{ kind: 'render', message: e instanceof Error ? e.message : String(e), file: 'main' }]
  }
}

watch(() => [editor.source, previewRow.value] as const, scheduleRender)

// ---------------------------------------------------------------- caret

/** The element the caret sits in: the property editor's target, the components pane's ring. */
export const element = computed(() => elementAt(editor.source, editor.caret))
const norm = (name: string) => name.replace(/-/g, '').toLowerCase()
export const elementSchema = computed(
  () => editor.components.find((c) => element.value && norm(c.name) === norm(element.value.tag)) ?? null,
)
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
export const visible = computed(() => activeBlock.value?.lines ?? null)

/** Strip order across the whole file — the label's blocks, then each snippet's (for `⌘⌥[ ]`). */
export const allTabs = computed<TabRef[]>(() => [
  ...tabs.value.blocks.map((b) => ({ scope: null, kind: b.kind })),
  ...tabs.value.snippets.flatMap((s) => s.blocks.map((b) => ({ scope: s.name, kind: b.kind }))),
])

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
    add(tabKey(tab), m.kind === 'purity' ? 'warning' : 'error')
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

/** `⌘⌥[` / `⌘⌥]` — one flat ring through every tab in the file. */
export function cycleTab(step: 1 | -1) {
  const list = allTabs.value
  if (!list.length) return
  const i = list.findIndex((t) => tabKey(t) === tabKey(editor.activeTab))
  switchTab(list[(i + step + list.length) % list.length])
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

/** One thing the element's styling comes from: a global, element, class or id rule — in cascade order. */
export type StyleTarget = { kind: 'global' | 'tag' | 'class' | 'id'; selector: string; label: string; rule: Rule | null }

/** All rules that apply to the element at the caret (simple selectors, comma lists), lowest specificity first. */
export const styleTargets = computed<StyleTarget[]>(() => {
  const el = element.value
  if (!el) return []
  const attr = (name: string) => el.props.find((p) => p.name === name && !p.isBinding)?.value
  const classes = attr('class')?.split(/\s+/).filter(Boolean) ?? []
  const id = attr('id')?.trim()
  const scope = editor.activeTab.scope
  const rules: Rule[] = []
  for (const sc of scope === null ? [null] : [scope, null]) {
    const block = blockOf(tabs.value, { scope: sc, kind: 'style' })
    if (block) rules.push(...rulesIn(editor.source, block.start, block.end))
  }
  const find = (sel: string) => rules.find((r) => r.selector.split(',').some((part) => part.trim() === sel)) ?? null
  const targets: StyleTarget[] = [
    { kind: 'global', selector: '*', label: '*', rule: find('*') },
    { kind: 'tag', selector: el.tag, label: el.tag, rule: find(el.tag) },
    ...classes.map((c) => ({ kind: 'class' as const, selector: `.${c}`, label: `.${c}`, rule: find(`.${c}`) })),
    ...(id ? [{ kind: 'id' as const, selector: `#${id}`, label: `#${id}`, rule: find(`#${id}`) }] : []),
  ]
  // Globals and element rules only show up when they exist; classes/ids are the element's own and always show.
  return targets.filter((t) => t.rule || t.kind === 'class' || t.kind === 'id')
})

/** Make sure a rule with this selector exists in the scope's style block. Returns the offset inside its braces. */
export function ensureSelector(selector: string): number {
  const rules = (blockOf(tabs.value, { scope: editor.activeTab.scope, kind: 'style' }) as TabBlock | undefined)
  const existing = rules && rulesIn(editor.source, rules.start, rules.end).find((r) => r.selector.split(',').some((p) => p.trim() === selector))
  if (existing) return existing.bodyStart + 1
  const scope = editor.activeTab.scope
  if (!blockOf(tabs.value, { scope, kind: 'style' })) applyEdits([insertBlock(editor.source, tabs.value, 'style', undefined, scope)])
  const block = blockOf(tabsModel(editor.source), { scope, kind: 'style' })!
  const body = editor.source.slice(block.contentStart, block.contentEnd)
  const text = `${body.trimEnd() ? '\n' : ''}${selector} {  }\n`
  const at = block.contentStart + body.trimEnd().length
  applyEdits([{ start: at, end: at, text }])
  return at + text.indexOf('{') + 2
}

/** Single-class rules visible from the current scope (snippet's own style + the label's), by name. */
export function availableClasses(): { name: string; declarations: number }[] {
  const scope = editor.activeTab.scope
  const out = new Map<string, number>()
  for (const sc of scope === null ? [null] : [scope, null]) {
    const block = blockOf(tabs.value, { scope: sc, kind: 'style' })
    if (!block) continue
    for (const r of rulesIn(editor.source, block.start, block.end)) {
      const cls = /^\.([\w-]+)$/.exec(r.selector)?.[1]
      if (cls && !out.has(cls)) out.set(cls, r.declarations.length)
    }
  }
  return [...out].map(([name, declarations]) => ({ name, declarations }))
}

/** Make sure `.cls { }` exists in this scope's style block (adding the block first if needed). Returns its offset. */
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

// A deleted block must not leave the strip pointing at nothing (README-tabs §7).
watch(tabs, (model) => {
  if (!blockOf(model, editor.activeTab)) editor.activeTab = { scope: null, kind: 'template' }
})
