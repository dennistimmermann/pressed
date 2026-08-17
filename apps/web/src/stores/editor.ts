import { computed, reactive, shallowRef, toRaw, watch } from 'vue'
import { parseMeta } from '@sprint/core/template/meta.ts'
import { labelDocument } from '@sprint/core/template/label.ts'
import { RenderSuperseded } from '@sprint/editor/runtime-client.ts'
import type { EditorHandle } from '@sprint/editor/editor-handle.ts'
import type { Assets, ComponentSchema, Message, RenderedLabel } from '@sprint/core'
import { runtime } from '../runtime-client'
import { data, previewRow } from './data'
import { settings } from './settings'
import {
  bundled, findTemplate, isBundled, newTemplate, refreshTemplates, saveTemplate, templateName,
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

/**
 * Status rows carry `file:line:col`; the editor speaks offsets. Snippet lines are relative
 * to the snippet body, so we start counting at its opening tag.
 * ponytail: shorthand snippets are wrapped in a synthetic `<template>` before compiling, so
 * their line numbers can be one off — it still lands inside the right block.
 */
export function jumpTo(loc: { file: string; line?: number; col?: number }) {
  if (!handle.value || !loc.line) return
  const source = editor.source
  let base = 0
  if (loc.file.startsWith('snippet:')) {
    const name = loc.file.slice('snippet:'.length)
    const open = new RegExp(`<snippet[^>]*name=["']${name}["'][^>]*>\\r?\\n?`).exec(source)
    if (open) base = open.index + open[0].length
  }
  const lines = source.slice(base).split('\n')
  let offset = base
  for (let i = 0; i < loc.line - 1 && i < lines.length; i++) offset += lines[i].length + 1
  handle.value.setCaret(offset + Math.max(0, (loc.col ?? 1) - 1))
  handle.value.focus()
}
