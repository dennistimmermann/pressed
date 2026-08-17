<script setup lang="ts">
import { editor as monacoEditor, languages, Range, Uri } from 'monaco-editor-core'
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import type { EditorHandle } from './editor-handle'
import { getOrCreateModel, startLanguageService } from './monaco/env'
import { foldRegions } from './monaco/folding'
import { componentUri, ENV_URI, SPRINT_MODULE_URI, sprintEnv } from './monaco/sprint-env'
import { defineSprintTheme } from './monaco/theme'

/**
 * The Monaco + Volar editor pane (design §3.3).
 *
 * Everything that edits the text from outside — the property editor, the component and
 * variable panes — goes through the `EditorHandle` this exposes, so there is exactly one
 * undo stack and one caret (spec §9c).
 */
const props = withDefaults(
  defineProps<{
    /** The `.vue` source. `v-model:source` on the host. */
    modelValue: string
    /** TS type text for one context record; becomes `type Row` for completions. */
    contextType: string
    /** Library component sources, `{ QrCode: '<script setup>…' }` — hover/props come from these. */
    libraryComponents: Record<string, string>
    filename?: string
    /** Ids of folded `<meta>`/`<snippet>` regions, see `monaco/folding.ts`. */
    foldedRegions?: string[]
    /** Source range of the element at the caret (drawn as a box); `holes` = its child elements, left un-bolded. */
    highlight?: { start: number; end: number; holes?: { start: number; end: number }[] } | null
  }>(),
  { filename: 'Label.vue', foldedRegions: () => [] },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:foldedRegions': [ids: string[]]
  caret: [offset: number]
  ready: [handle: EditorHandle]
}>()

const container = useTemplateRef('container')
const instance = shallowRef<monacoEditor.IStandaloneCodeEditor>()
const disposables: { dispose(): void }[] = []
const caretListeners = new Set<(offset: number) => void>()

const mainUri = () => Uri.parse(`file:///${props.filename}`)

// ---------------------------------------------------------------- the models the worker sees

/** Regenerate the virtual environment: context type, `sprint` module, library sources. */
function syncEnvModels() {
  for (const [uri, text] of Object.entries(sprintEnv(props.contextType, Object.keys(props.libraryComponents)))) {
    getOrCreateModel(Uri.parse(uri), 'typescript', text)
  }
  for (const [name, source] of Object.entries(props.libraryComponents)) {
    getOrCreateModel(Uri.parse(componentUri(name)), 'vue', source)
  }
}

const syncUris = () => [
  mainUri(),
  Uri.parse(ENV_URI),
  Uri.parse(SPRINT_MODULE_URI),
  ...Object.keys(props.libraryComponents).map((name) => Uri.parse(componentUri(name))),
]

// ---------------------------------------------------------------- folding

let foldingRegistered = false
function registerFolding() {
  if (foldingRegistered) return
  foldingRegistered = true
  languages.registerFoldingRangeProvider('vue', {
    provideFoldingRanges: (model) =>
      foldRegions(model.getValue()).map((r) => ({ start: r.start, end: r.end, kind: languages.FoldingRangeKind.Region })),
  })
}

/** A line is hidden when it and the next one sit at the same vertical offset. */
function foldedIds(ed: monacoEditor.IStandaloneCodeEditor): string[] {
  return foldRegions(ed.getModel()!.getValue())
    .filter((r) => ed.getTopForLineNumber(r.start + 1) === ed.getTopForLineNumber(r.start + 2))
    .map((r) => r.id)
}

function applyFolded(ed: monacoEditor.IStandaloneCodeEditor, ids: string[]) {
  const lines = foldRegions(ed.getModel()!.getValue()).filter((r) => ids.includes(r.id)).map((r) => r.start)
  if (lines.length) ed.trigger('sprint', 'editor.fold', { selectionLines: lines })
}

// ---------------------------------------------------------------- lifecycle

onMounted(() => {
  syncEnvModels()
  registerFolding()

  const model = getOrCreateModel(mainUri(), 'vue', props.modelValue)
  const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim()

  const ed = monacoEditor.create(container.value!, {
    model,
    theme: defineSprintTheme(),
    // Design §3.3: Plex Mono 11.5 / 1.72 — the same code voice as every other surface.
    fontFamily: mono || '"IBM Plex Mono", ui-monospace, monospace',
    fontSize: 11.5,
    lineHeight: 20,
    tabSize: 2,
    // The gutter carries the spacing; nothing between the numbers and the code but this.
    lineNumbersMinChars: 2,
    lineDecorationsWidth: 12,
    glyphMargin: false,
    padding: { top: 8, bottom: 8 },
    renderLineHighlight: 'none',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    minimap: { enabled: false },
    overviewRulerLanes: 0,
    inlineSuggest: { enabled: false },
    fixedOverflowWidgets: true,
    smoothScrolling: false,
    cursorBlinking: 'solid',
    // Not an IDE: no refactoring lightbulb ("extract to file/component"), no context menu, no code lens.
    lightbulb: { enabled: monacoEditor.ShowLightbulbIconMode.Off },
    contextmenu: false,
    codeLens: false,
    occurrencesHighlight: 'off',
    selectionHighlight: false,
    // No hover cards (Vue SFC docs, type signatures): prop docs live in the components pane and
    // the property editor. Diagnostics still show as squiggles + Status rows.
    hover: { enabled: false },
  })
  instance.value = ed
  disposables.push(ed)

  // Volar sends semantic tokens; Monaco only paints them when the theme opts in, and the
  // standalone theme has no public switch for it (same hack as @vue/repl).
  const theme = (ed as unknown as { _themeService: { _theme: { semanticHighlighting: boolean } } })._themeService._theme
  theme.semanticHighlighting = true

  disposables.push(startLanguageService(syncUris))


  // The element under the caret (host computes it from the AST) gets a tinted box hugging its
  // text on one line, full width when it spans several. Decorations can't draw a
  // rectangle wider than a line's text, and a content widget vanishes once its anchor line
  // scrolls out — so this is an overlay widget positioned by hand and re-laid out on scroll.
  // `clip` is a plain overflow:hidden wrapper (no clip-path/opacity — those isolate the blend
  // layers below and turn them black); it hides the part scrolled under the gutter.
  const clipNode = document.createElement('div')
  clipNode.className = 'sprint-element-clip'
  const boxNode = document.createElement('div')
  boxNode.className = 'sprint-element-box'
  // Two blend layers (see the CSS): `paper` turns the off-white editor background pure white
  // under the box, `flash` carries the yellow→clear fade on selection. Text stays crisp under both.
  boxNode.innerHTML = '<div class="paper"></div><div class="flash"></div>'
  const flashNode = boxNode.lastElementChild as HTMLElement
  clipNode.append(boxNode)
  const box: monacoEditor.IOverlayWidget = { getId: () => 'sprint.element-box', getDomNode: () => clipNode, getPosition: () => null }
  ed.addOverlayWidget(box)
  // The element's own text (tags, attributes, text nodes) is bold; child elements are not.
  const bold = ed.createDecorationsCollection()
  const markBold = () => {
    const m = ed.getModel()
    if (!m || !props.highlight) return bold.set([])
    const { start, end, holes = [] } = props.highlight
    const pieces: [number, number][] = []
    let at = start
    for (const h of [...holes].sort((x, y) => x.start - y.start)) { if (h.start > at) pieces.push([at, h.start]); at = Math.max(at, h.end) }
    if (end > at) pieces.push([at, end])
    bold.set(pieces.map(([s, e]) => {
      const a = m.getPositionAt(s), b = m.getPositionAt(e)
      return { range: new Range(a.lineNumber, a.column, b.lineNumber, b.column), options: { inlineClassName: 'sprint-element-bold' } }
    }))
  }
  watch(() => props.highlight, markBold, { deep: true })

  const markElement = () => {
    const m = ed.getModel()
    if (!m || !props.highlight) return (clipNode.style.display = 'none')
    const a = m.getPositionAt(props.highlight.start), b = m.getPositionAt(props.highlight.end)
    const cw = ed.getOption(monacoEditor.EditorOption.fontInfo).typicalHalfwidthCharacterWidth
    const { contentLeft, contentWidth } = ed.getLayoutInfo()
    // Exact pixel offsets from Monaco when the line is rendered; char-width math (drifts on long lines) otherwise.
    const xOf = (line: number, column: number) => {
      const exact = ed.getOffsetForColumn(line, column)
      return contentLeft + (exact >= 0 ? exact : (column - 1) * cw) - ed.getScrollLeft()
    }
    const textLeft = xOf(a.lineNumber, a.column)
    const PAD = 6 // px of air around the text; at column 1 it sits in the (empty) 12px decoration gutter
    const left = textLeft - PAD
    // Multi-line boxes span the whole scrollable width (so they scroll with the text); a single line hugs its text.
    const scrollW = Math.max(ed.getScrollWidth(), contentWidth)
    const right = b.lineNumber > a.lineNumber ? contentLeft + scrollW - ed.getScrollLeft() - 8 : xOf(b.lineNumber, b.column) + PAD
    const top = ed.getTopForLineNumber(a.lineNumber) - ed.getScrollTop() - 2
    const height = ed.getBottomForLineNumber(b.lineNumber) - ed.getTopForLineNumber(a.lineNumber) + 4
    const M = 16 // room for the drop shadow inside the clip
    const clipLeft = Math.max(contentLeft - 8, left - M)
    Object.assign(clipNode.style, { display: 'block', left: `${clipLeft}px`, top: `${top - M}px`, width: `${right + M - clipLeft}px`, height: `${height + 2 * M}px` })
    Object.assign(boxNode.style, { left: `${left - clipLeft}px`, top: `${M}px`, width: `${right - left}px`, height: `${height}px` })
  }
  watch(() => props.highlight, markElement, { deep: true })
  // A newly selected element flashes: light yellow fading to the resting colour (which the
  // blend mode turns invisible), so the eye finds the extent without a permanent tint.
  watch(
    () => props.highlight && `${props.highlight.start}:${props.highlight.end}`,
    (key) => {
      if (!key) return
      const timing = { duration: 700, easing: 'ease-out', fill: 'forwards' } as const
      const css = getComputedStyle(flashNode)
      flashNode.animate([{ background: css.getPropertyValue('--box-flash') }, { background: css.getPropertyValue('--box-rest') }], timing)
      // The ring goes darker yellow → grey alongside; the drop shadow stays constant.
      const ring = (c: string) => `inset 0 0 0 1px ${c}, 0 1px 3px rgb(0 0 0 / 0.08), 0 4px 12px -4px rgb(0 0 0 / 0.14)`
      const bcss = getComputedStyle(boxNode)
      boxNode.animate([{ boxShadow: ring(bcss.getPropertyValue('--ring-flash')) }, { boxShadow: ring(bcss.getPropertyValue('--ring-rest')) }], timing)
    },
  )
  disposables.push(ed.onDidChangeConfiguration(markElement), ed.onDidScrollChange(markElement), ed.onDidLayoutChange(markElement))

  disposables.push(
    ed.onDidChangeModelContent(() => {
      emit('update:modelValue', ed.getValue())
    }),
    ed.onDidChangeCursorPosition(() => {
      const offset = ed.getModel()!.getOffsetAt(ed.getPosition()!)
      emit('caret', offset)
      for (const cb of caretListeners) cb(offset)
    }),
    ed.onDidChangeHiddenAreas(() => emit('update:foldedRegions', foldedIds(ed))),
  )
  applyFolded(ed, props.foldedRegions)

  // The theme lives on <html>; rebuild it from the tokens when the class flips.
  const observer = new MutationObserver(() => monacoEditor.setTheme(defineSprintTheme()))
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  disposables.push({ dispose: () => observer.disconnect() })

  emit('ready', handle)
})

onBeforeUnmount(() => {
  for (const d of disposables.reverse()) d.dispose()
  disposables.length = 0
})

watch(
  () => [props.contextType, props.libraryComponents] as const,
  () => syncEnvModels(),
)

watch(
  () => props.modelValue,
  (value) => {
    const ed = instance.value
    if (ed && ed.getValue() !== value) ed.setValue(value)
  },
)

watch(
  () => props.filename,
  () => {
    const ed = instance.value
    if (!ed) return
    // Dispose the old model, or renaming leaves a stale file behind that the language
    // service keeps type-checking (and reporting markers for).
    const old = ed.getModel()
    ed.setModel(getOrCreateModel(mainUri(), 'vue', props.modelValue))
    if (old !== ed.getModel()) old?.dispose()
  },
)

// ---------------------------------------------------------------- EditorHandle

const handle: EditorHandle = {
  getValue: () => instance.value?.getValue() ?? props.modelValue,
  getOffset() {
    const ed = instance.value
    return ed ? ed.getModel()!.getOffsetAt(ed.getPosition()!) : 0
  },
  setCaret(offset, endOffset) {
    const ed = instance.value
    if (!ed) return
    const model = ed.getModel()!
    const start = model.getPositionAt(offset)
    const end = model.getPositionAt(endOffset ?? offset)
    const range = Range.fromPositions(start, end)
    ed.setSelection(range)
    ed.revealRangeInCenterIfOutsideViewport(range)
    ed.focus()
  },
  executeEdits(edits) {
    const ed = instance.value
    if (!ed) return
    const model = ed.getModel()!
    // One `executeEdits` call with a source id: the batch is a single ⌘Z step, on the
    // editor's own undo stack (design §3.4 — "undo-able with ⌘Z").
    ed.executeEdits(
      'sprint',
      edits.map((e) => ({
        range: Range.fromPositions(model.getPositionAt(e.start), model.getPositionAt(e.end)),
        text: e.text,
        forceMoveMarkers: true,
      })),
    )
    ed.pushUndoStop()
  },
  onCaretChange(cb) {
    caretListeners.add(cb)
    return () => caretListeners.delete(cb)
  },
  focus: () => instance.value?.focus(),
}

defineExpose(handle)
</script>

<template>
  <div ref="container" class="sprint-editor" />
</template>

<style>
.sprint-editor {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* Element at caret: selection is accent + 1px accent-border ring, never a fill (design §1). */
.sprint-editor .sprint-element-bold {
  font-weight: 600;
}
.sprint-editor .sprint-element-clip {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
}
.sprint-editor .sprint-element-box {
  position: absolute;
  border-radius: 6px;
  --ring-flash: oklch(0.78 0.15 90);
  --ring-rest: var(--border);
  box-shadow: inset 0 0 0 1px var(--ring-rest), 0 1px 3px rgb(0 0 0 / 0.08), 0 4px 12px -4px rgb(0 0 0 / 0.14);
}
.sprint-editor .sprint-element-box > div {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
/* Above the text, yet reads as "white paper behind it": colour-dodge with a dark grey source
   pushes near-white backdrop pixels to pure white and leaves dark text almost untouched. */
.sprint-editor .sprint-element-box > .paper {
  background: #101010;
  mix-blend-mode: color-dodge;
}
/* The flash multiplies a light yellow in and fades to white (= no-op under multiply). */
.sprint-editor .sprint-element-box > .flash {
  --box-rest: #fff;
  --box-flash: oklch(0.96 0.07 95);
  background: var(--box-rest);
  mix-blend-mode: multiply;
}
/* Dark theme: the mirror image — colour-burn darkens the backdrop, screen carries the flash. */
:global(.dark) .sprint-editor .sprint-element-box > .paper {
  background: #f0f0f0;
  mix-blend-mode: color-burn;
}
:global(.dark) .sprint-editor .sprint-element-box > .flash {
  --box-rest: #000;
  --box-flash: oklch(0.35 0.06 95);
  mix-blend-mode: screen;
}


/* Markers: wavy underline, no ink skipping, so a squiggle under a `.` is still visible. */
.sprint-editor .squiggly-error,
.sprint-editor .squiggly-warning {
  text-decoration-skip-ink: none;
}
</style>
