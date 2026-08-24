import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { parseMeta } from '@pressed/core/template/meta.ts'
import { elementAt } from '@/editor/ast.ts'
import { blockOf, tabsModel } from '@/editor/tabs.ts'
import type { TabRef } from '@/editor/tabs.ts'
import type { Edit } from '@/editor/ast.ts'
import type { EditorHandle } from '@/editor/editor-handle.ts'
import type { Assets, ComponentSchema, Message, RenderedLabel } from '@pressed/core'

/**
 * The editor's live state. It lives in a store, not in EditorView, for two reasons: the
 * unsaved buffer must survive switching to the Data view and back, and the top bar's
 * `60 × 40 · margin 2` badge reads the *buffer's* `<meta>`, not the saved record's.
 *
 * This module is the leaf of the store: every other `stores/editor/*` module imports it and
 * it imports none of them.
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
export const markerTick = ref(0)
let stopMarkers: (() => void) | undefined
watch(handle, (h) => {
  stopMarkers?.()
  stopMarkers = h?.onMarkersChange(() => markerTick.value++)
})

export const meta = computed(() => parseMeta(editor.source).meta)
export const dirty = computed(() => editor.source !== editor.savedSource)
export const filename = computed(() => `${meta.value.name}.vue`)

/** Cheap enough to recompute on every keystroke — it is one pass over the block tree. */
export const tabs = computed(() => tabsModel(editor.source))
export const activeBlock = computed(() => blockOf(tabs.value, editor.activeTab))

/**
 * The template block of the scope we are in — what Layers shows on *every* block tab
 * (SPEC §4.2), not only while the template tab is the active one.
 */
export const scopeTemplate = computed(() => blockOf(tabs.value, { scope: editor.activeTab.scope, kind: 'template' }))

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

/** Every edit goes through the handle so it shares the editor's one undo stack (design §3.4).
    Exported to the sibling command modules only — `index.ts` deliberately does not re-export it. */
export function applyEdits(edits: Edit[]) {
  if (handle.value) return handle.value.executeEdits(edits)
  // Before the editor is ready: apply back-to-front so earlier offsets stay valid.
  for (const e of [...edits].sort((a, b) => b.start - a.start))
    editor.source = editor.source.slice(0, e.start) + e.text + editor.source.slice(e.end)
}

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
