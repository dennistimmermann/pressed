import { computed, toRaw, watch } from 'vue'
import { labelDocument } from '@pressed/core/template/label.ts'
import { debounce, RenderSuperseded } from '@/editor/runtime-client.ts'
import { isWarning } from '@pressed/core'
import { runtime } from '@/render/runtime-client'
import { data, mappedPreviewRow } from '../data'
import { editor, meta } from './state'

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

/** Design §4: 150ms debounce from keystroke to compile+render in the runtime frame. */
const scheduleRender = debounce(render, 150)

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
