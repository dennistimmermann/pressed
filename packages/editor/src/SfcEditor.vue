<script setup lang="ts">
import { editor as monacoEditor, type IRange, MarkerSeverity, Range, Uri } from 'monaco-editor-core'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import type { EditorHandle } from './editor-handle'
import { getOrCreateModel, startLanguageService } from './monaco/env'
import { componentUri, ENV_URI, SPRINT_MODULE_URI, sprintEnv } from './monaco/sprint-env'
import { defineSprintTheme } from './monaco/theme'

/**
 * The Monaco + Volar editor pane (design §3.3).
 *
 * Everything that edits the text from outside — Layers, the Inspector — goes through the
 * `EditorHandle` this exposes, so there is exactly one undo stack and one caret (spec §9c).
 * Inserting is typing (`<`, `{{`) plus the Volar completion; there are no buttons in here.
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
    /** Source range of the element at the caret (drawn as a box); `holes` = its child elements, left un-bolded. */
    highlight?: { start: number; end: number; holes?: { start: number; end: number }[] } | null
    /**
     * 1-based inclusive model lines to show — the active tab's block (README-tabs §1).
     * Everything outside is hidden, line numbers keep counting. `null` shows the whole file.
     */
    visible?: { first: number; last: number } | null
    /** Centred "Nothing here yet" state over an empty block (README-tabs §7). Backticked words render mono. */
    emptyText?: { title: string; body: string } | null
    /**
     * Compile / purity messages as source ranges (SPEC §3 E11): a wavy underline each. The
     * language service reports its own; these are the ones only the compiler knows about.
     */
    markers?: { start: number; end: number; message: string; severity: 'error' | 'warning' }[]
  }>(),
  { filename: 'Label.vue', visible: null, emptyText: null, markers: () => [] },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
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

// ---------------------------------------------------------------- the active tab

/**
 * Hide every line outside the active tab's block. `setHiddenAreas` keeps the text, the model
 * offsets and Volar intact — only the view is scoped, and the line numbers keep counting.
 * The host recomputes `visible` whenever the source changes, which is what re-syncs the
 * ranges after an edit adds or removes lines.
 */
function applyVisible() {
  const ed = instance.value
  const model = ed?.getModel()
  if (!ed || !model) return
  const v = props.visible
  const ranges: IRange[] = []
  if (v) {
    if (v.first > 1) ranges.push(new Range(1, 1, v.first - 1, 1))
    if (v.last < model.getLineCount()) ranges.push(new Range(v.last + 1, 1, model.getLineCount(), 1))
  }
  ;(ed as unknown as { setHiddenAreas(r: IRange[], source?: unknown): void }).setHiddenAreas(ranges, 'sprint')
  // A caret in a hidden line would edit text the user cannot see: keep it inside the block.
  const pos = ed.getPosition()
  if (v && pos && (pos.lineNumber < v.first || pos.lineNumber > v.last)) {
    const line = pos.lineNumber < v.first ? v.first : v.last
    ed.setPosition({ lineNumber: line, column: model.getLineFirstNonWhitespaceColumn(line) || 1 })
  }
}

/** The overlay is the host's call, but never show it over text — a stale prop must not cover code. */
const showEmpty = computed(() => {
  if (!props.emptyText) return false
  const lines = props.modelValue.split('\n')
  const v = props.visible
  return (v ? lines.slice(v.first - 1, v.last) : lines).join('').trim() === ''
})
/** Backticks mark machine text: `.title` is a class name (accent), `mm` is plain mono. */
const emptyBody = computed(() =>
  (props.emptyText?.body ?? '').split('`').map((text, i) => ({ text, mono: i % 2 === 1, klass: i % 2 === 1 && text.startsWith('.') })),
)

const syncUris = () => [
  mainUri(),
  Uri.parse(ENV_URI),
  Uri.parse(SPRINT_MODULE_URI),
  ...Object.keys(props.libraryComponents).map((name) => Uri.parse(componentUri(name))),
]

// ---------------------------------------------------------------- lifecycle

onMounted(() => {
  syncEnvModels()

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
    autoIndent: 'full', // Enter / closing tag / `}` re-indent by the language rules above
    // The gutter carries the spacing; nothing between the numbers and the code but this.
    lineNumbersMinChars: 3, // SPEC §4.6: gutter 40–52px; the spare char is the breathing room left of the numbers
    lineDecorationsWidth: 12,
    glyphMargin: false,
    padding: { top: 8, bottom: 8 },
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
    stickyScroll: { enabled: false },
    folding: false, // the tabs are the folding
    renderLineHighlight: 'none',
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
    if (height <= 4) return (clipNode.style.display = 'none') // every line of the range is hidden (e.g. <meta>)
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
      const shadow = getComputedStyle(document.documentElement).getPropertyValue('--box-shadow')
      const ring = (c: string) => `inset 0 0 0 1px ${c}, ${shadow}`
      const bcss = getComputedStyle(boxNode)
      boxNode.animate([{ boxShadow: ring(bcss.getPropertyValue('--ring-flash')) }, { boxShadow: ring(bcss.getPropertyValue('--ring-rest')) }], timing)
    },
  )
  // Hidden areas move every line below them: Split ⇄ Full must re-seat the box as well.
  disposables.push(ed.onDidChangeConfiguration(markElement), ed.onDidScrollChange(markElement), ed.onDidLayoutChange(markElement), ed.onDidChangeHiddenAreas(markElement))

  disposables.push(
    ed.onDidChangeModelContent(() => {
      emit('update:modelValue', ed.getValue())
      // Edits shift Monaco's tracked hidden ranges; re-assert ours (a no-op when unchanged) so a
      // multi-line change inside the block cannot leave stale gaps.
      void nextTick(applyVisible)
    }),
    ed.onDidChangeCursorPosition(() => {
      const offset = ed.getModel()!.getOffsetAt(ed.getPosition()!)
      emit('caret', offset)
      for (const cb of caretListeners) cb(offset)
    }),
  )

  // One tab = one visible line range; everything else is hidden (README-tabs §1). Line numbers
  // keep counting, which is the cheapest proof that this is still one file.
  applyVisible()
  // Hidden areas live on the view model, i.e. per model: redo them when the model swaps.
  disposables.push(ed.onDidChangeModel(applyVisible))
  watch(() => props.visible, applyVisible, { deep: true })

  // The theme lives on <html>; rebuild it from the tokens when the class flips.
  const observer = new MutationObserver(() => monacoEditor.setTheme(defineSprintTheme()))
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  disposables.push({ dispose: () => observer.disconnect() })

  // Wavy underlines for what the compiler found. Our own owner, so Volar's markers stay put.
  const applyMarkers = () => {
    const m = ed.getModel()
    if (!m) return
    monacoEditor.setModelMarkers(m, 'sprint', props.markers.map((k) => {
      const a = m.getPositionAt(k.start), b = m.getPositionAt(k.end)
      return {
        message: k.message,
        severity: k.severity === 'warning' ? MarkerSeverity.Warning : MarkerSeverity.Error,
        startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column,
      }
    }))
  }
  applyMarkers()
  watch(() => props.markers, applyMarkers, { deep: true })
  disposables.push(ed.onDidChangeModel(applyMarkers))

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
  async format(range) {
    const ed = instance.value, model = ed?.getModel()
    if (!ed || !model) return
    if (!range) return void (await ed.getAction('editor.action.formatDocument')?.run())
    // formatSelection works on the current selection: set it, format, then put the caret back.
    const before = ed.getSelection(), scroll = ed.getScrollTop()
    const a = model.getPositionAt(range.start), b = model.getPositionAt(range.end)
    ed.setSelection(new Range(a.lineNumber, a.column, b.lineNumber, b.column))
    await ed.getAction('editor.action.formatSelection')?.run()
    if (before) ed.setSelection(before)
    ed.setScrollTop(scroll)
  },
  getOffset() {
    const ed = instance.value
    return ed ? ed.getModel()!.getOffsetAt(ed.getPosition()!) : 0
  },
  getSelection() {
    const ed = instance.value
    if (!ed) return { start: 0, end: 0 }
    const model = ed.getModel()!
    const sel = ed.getSelection()!
    return { start: model.getOffsetAt(sel.getStartPosition()), end: model.getOffsetAt(sel.getEndPosition()) }
  },
  revealOffset(offset) {
    const ed = instance.value
    if (!ed) return
    ed.revealPositionInCenterIfOutsideViewport(ed.getModel()!.getPositionAt(offset))
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
  <div ref="container" class="sprint-editor">
    <!-- An empty block gets a centred sentence instead of a bare cursor (README-tabs §7).
         Never captures clicks: typing is what dismisses it. -->
    <div v-if="showEmpty" class="sprint-empty">
      <p class="title">{{ emptyText!.title }}</p>
      <p class="body">
        <span v-for="(part, i) in emptyBody" :key="i" :class="{ mono: part.mono, klass: part.klass }">{{ part.text }}</span>
      </p>
    </div>
  </div>
</template>

<style>
.sprint-editor {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.sprint-editor .sprint-empty {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 44px;
  text-align: center;
  pointer-events: none;
}
.sprint-editor .sprint-empty p {
  margin: 0;
  font-family: var(--font-sans, system-ui, sans-serif);
}
.sprint-editor .sprint-empty .title {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
}
.sprint-editor .sprint-empty .body {
  max-width: 44ch;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--muted-foreground);
  text-wrap: pretty;
}
.sprint-editor .sprint-empty .mono {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
}
.sprint-editor .sprint-empty .klass {
  color: var(--accent-link);
}

.sprint-editor .sprint-element-bold {
  font-weight: 600;
}
.sprint-editor .sprint-element-clip {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
}
/* The block box is inside the editor text, not chrome — VISUAL-SPEC §3 names its own ring
   and shadow, so it is the one thing besides the four chrome shadows that casts one. */
.sprint-editor .sprint-element-box {
  position: absolute;
  border-radius: var(--radius-control);
  --ring-flash: var(--box-flash);
  --ring-rest: var(--box-ring);
  box-shadow: inset 0 0 0 1px var(--ring-rest), var(--box-shadow);
}
.sprint-editor .sprint-element-box > div {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
/* Above the text, yet reads as "white paper behind it": colour-dodge with a dark grey source
   pushes near-white backdrop pixels to pure white and leaves dark text almost untouched.
   #101010 / #f0f0f0 are blend-mode operands, not palette colours — they have no token. */
.sprint-editor .sprint-element-box > .paper {
  background: #101010;
  mix-blend-mode: color-dodge;
}
/* The flash multiplies a light yellow in and fades to white (= no-op under multiply). */
.sprint-editor .sprint-element-box > .flash {
  --box-rest: var(--pane);
  background: var(--box-rest);
  mix-blend-mode: multiply;
}
/* Dark theme: the mirror image — colour-burn darkens the backdrop, screen carries the flash. */
:global(.dark) .sprint-editor .sprint-element-box > .paper {
  background: #f0f0f0;
  mix-blend-mode: color-burn;
}
:global(.dark) .sprint-editor .sprint-element-box > .flash {
  --box-rest: var(--sheet-ink);
  mix-blend-mode: screen;
}


/* Markers: wavy underline, no ink skipping, so a squiggle under a `.` is still visible. */
.sprint-editor .squiggly-error,
.sprint-editor .squiggly-warning {
  text-decoration-skip-ink: none;
}
</style>
