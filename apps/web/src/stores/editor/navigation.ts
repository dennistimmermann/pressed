import { computed, nextTick, watch } from 'vue'
import { blockOf, insertBlock, tabAt, tabKey } from '@/editor/tabs.ts'
import type { Badge, BlockKind, TabRef } from '@/editor/tabs.ts'
import { isWarning } from '@pressed/core'
import { settings } from '../settings'
import { activeBlock, applyEdits, editor, element, handle, tabs } from './state'

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
function tabOf(loc: { file: string; line?: number; col?: number }): TabRef | null {
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

/** The lines the editor shows; everything outside them is hidden, numbering keeps counting. */
export const visible = computed(() => (settings.editorView === 'file' ? null : activeBlock.value?.lines ?? null))

// Whole-file view: the tabs are a readout, not a filter — they follow the caret into whichever
// block (and scope) it sits in. `switchTab` still works the other way round and just moves the caret.
watch(() => [editor.caret, settings.editorView] as const, ([caret, view]) => {
  if (view !== 'file') return
  const tab = tabAt(tabs.value, caret)
  if (tab && tabKey(tab) !== tabKey(editor.activeTab)) editor.activeTab = tab
})

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

/** SPEC §6: scope per template, block per scope — remembered across sessions. */
watch(() => editor.activeTab, (tab) => {
  if (editor.templateId) settings.tabByTemplate[editor.templateId] = { ...tab }
}, { deep: true })

// A deleted block must not leave the strip pointing at nothing (README-tabs §7).
watch(tabs, (model) => {
  if (!blockOf(model, editor.activeTab)) editor.activeTab = { scope: null, kind: 'template' }
})
