<script setup lang="ts">
import { editor as monacoEditor, type IRange, Range, Uri } from 'monaco-editor-core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import type { EditorHandle } from './editor-handle'
import { attributeEdit, cursorContext, elementAt } from './ast'
import { insertItems, type InsertItem } from './inspector/insert'
import type { ComponentSchema } from './types'
import { getOrCreateModel, startLanguageService } from './monaco/env'
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
     * Insert popup (the `+` on a blank template line, or typing `<` there): library components and
     * this file's snippets, on top of plain HTML filtered by the enclosing element. Off when null.
     */
    insertables?: { components: ComponentSchema[]; snippets: ComponentSchema[] } | null
    /** Variables offered by the `+` in text / interpolations / bound attributes (`row.x` paths, or a snippet's props). */
    variables?: { path: string; hint: string }[] | null
  }>(),
  { filename: 'Label.vue', visible: null, emptyText: null, insertables: null, variables: null },
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

// ---------------------------------------------------------------- insert popup
// A `+` follows the caret wherever something can be dropped in: on a blank template line it
// offers components / snippets / HTML (filtered by the parent element); in text, inside `{{ }}`
// or in a bound attribute it offers variables. Picking inserts with the caret in the right spot.

type Mode = 'components' | 'variables'
type Spot = { modes: Mode[]; context: ReturnType<typeof cursorContext> | 'blank' }
const plus = ref<{ top: number; left: number; modes: Mode[] } | null>(null)
const popup = ref<{ top: number; left: number; from: number; mode: Mode; context: Spot['context'] } | null>(null)
const query = ref('')
const cursor = ref(0)

/** What can be inserted at the caret: components and/or variables, and where the caret sits. */
function spotAt(ed: monacoEditor.IStandaloneCodeEditor): Spot | null {
  const pos = ed.getPosition(), model = ed.getModel()
  if (!pos || !model) return null
  const offset = model.getOffsetAt(pos)
  if (model.getLineContent(pos.lineNumber).trim() === '' && props.insertables)
    return { modes: props.variables ? ['components', 'variables'] : ['components'], context: 'blank' }
  if (!props.variables) return null
  // Mid-tag (`<di|`, `<div cla|`): the user is typing a tag; nothing to offer until it closes.
  if (/<[^>]*$/.test(model.getLineContent(pos.lineNumber).slice(0, pos.column - 1))) return null
  const context = cursorContext(model.getValue(), offset)
  if (context === 'text') return { modes: props.insertables ? ['components', 'variables'] : ['variables'], context }
  if (context === 'interpolation' || context === 'attr-value-binding') return { modes: ['variables'], context }
  if (context === 'attr-value-static') {
    // An empty static value can become a binding (`:size="row.x"`); a filled one cannot hold a variable.
    const el = elementAt(model.getValue(), offset)
    const prop = el?.props.find((p) => p.valueLoc && offset >= p.valueLoc.start && offset <= p.valueLoc.end)
    if (prop && !prop.value) return { modes: ['variables'], context }
  }
  return null
}

const items = computed<InsertItem[]>(() => {
  if (!popup.value) return []
  const { mode, context, from } = popup.value
  let all: InsertItem[]
  if (mode === 'components') {
    const parent = elementAt(instance.value?.getValue() ?? '', from)
    all = insertItems(props.insertables!.components, props.insertables!.snippets, parent?.tag ?? null)
  } else {
    const bare = context === 'interpolation' || context === 'attr-value-binding' || context === 'attr-value-static'
    all = (props.variables ?? []).map((v) => ({ name: v.path, kind: 'variable', hint: v.hint, text: bare ? `${v.path}|` : `{{ ${v.path} }}|` }))
  }
  const q = query.value.trim().toLowerCase()
  return q ? all.filter((i) => i.name.toLowerCase().includes(q)) : all
})

function placePlus() {
  const ed = instance.value
  const spot = ed && spotAt(ed)
  // Right of the caret's line end, so the buttons never sit on top of text.
  const line = ed?.getPosition()?.lineNumber
  const vis = spot && line && ed!.getScrolledVisiblePosition({ lineNumber: line, column: ed!.getModel()!.getLineMaxColumn(line) })
  plus.value = vis && vis.top >= 0 && vis.height ? { top: vis.top, left: vis.left, modes: spot.modes } : null
}
function openPopup(mode: Mode) {
  const ed = instance.value!
  const spot = spotAt(ed)
  const pos = ed.getPosition()!
  const vis = spot && ed.getScrolledVisiblePosition(pos)
  if (!spot || !vis) return
  popup.value = { top: vis.top + vis.height + 4, left: vis.left, from: ed.getModel()!.getOffsetAt(pos), mode, context: spot.context }
  query.value = ''
  cursor.value = 0
  void nextTick(() => container.value?.querySelector<HTMLInputElement>('.sprint-insert input')?.focus())
}
function closePopup(refocus = true) {
  popup.value = null
  if (refocus) instance.value?.focus()
}
function pick(item: InsertItem | undefined) {
  if (!item || !popup.value) return
  const { from, context } = popup.value
  const model = instance.value!.getModel()!
  if (context === 'attr-value-static') {
    // `size=""` → `:size="row.x"`: one edit on the attribute, caret after it.
    const el = elementAt(model.getValue(), from)!
    const prop = el.props.find((p) => p.valueLoc && from >= p.valueLoc.start && from <= p.valueLoc.end)!
    const edit = attributeEdit(el, prop.name, 'set-binding', item.name)
    handle.executeEdits([edit])
    handle.setCaret(edit.start + edit.text.length)
    return closePopup()
  }
  // Multi-line inserts follow the indentation of the line they land on.
  const pos = model.getPositionAt(from)
  const indent = model.getLineContent(pos.lineNumber).slice(0, model.getLineFirstNonWhitespaceColumn(pos.lineNumber) - 1 || pos.column - 1)
  const raw = item.text.replaceAll('\n', '\n' + indent)
  const caretAt = raw.indexOf('|')
  const text = raw.replace('|', '')
  handle.executeEdits([{ start: from, end: from, text }])
  handle.setCaret(from + (caretAt < 0 ? text.length : caretAt))
  closePopup()
}
function onPopupKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { cursor.value = Math.min(cursor.value + 1, items.value.length - 1); e.preventDefault() }
  else if (e.key === 'ArrowUp') { cursor.value = Math.max(cursor.value - 1, 0); e.preventDefault() }
  else if (e.key === 'Enter') { pick(items.value[cursor.value]); e.preventDefault() }
  else if (e.key === 'Escape') { closePopup(); e.preventDefault() }
}

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
    lineNumbersMinChars: 2,
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
      const ring = (c: string) => `inset 0 0 0 1px ${c}, 0 1px 3px rgb(0 0 0 / 0.08), 0 4px 12px -4px rgb(0 0 0 / 0.14)`
      const bcss = getComputedStyle(boxNode)
      boxNode.animate([{ boxShadow: ring(bcss.getPropertyValue('--ring-flash')) }, { boxShadow: ring(bcss.getPropertyValue('--ring-rest')) }], timing)
    },
  )
  disposables.push(ed.onDidChangeConfiguration(markElement), ed.onDidScrollChange(markElement), ed.onDidLayoutChange(markElement))

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
      placePlus()
      if (popup.value && offset !== popup.value.from) closePopup(false)
    }),
    ed.onDidScrollChange(placePlus),
    ed.onDidLayoutChange(placePlus),
  )
  watch(() => [props.insertables, props.variables], placePlus)

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

    <!-- `+ component` / `+ variable` right of the caret, whichever fit here; the popup hangs under them. -->
    <div v-if="plus && !popup" class="sprint-plus" :style="{ top: `${plus.top}px`, left: `${plus.left}px` }">
      <button
        v-for="mode in plus.modes" :key="mode" type="button" @mousedown.prevent @click="openPopup(mode)"
      >+ {{ mode === 'components' ? 'component' : 'variable' }}</button>
    </div>
    <div v-if="popup" class="sprint-insert" :style="{ top: `${popup.top}px`, left: `${popup.left}px` }" @keydown="onPopupKey">
      <input v-model="query" :placeholder="popup.mode === 'variables' ? 'variable…' : 'component or element…'" @input="cursor = 0">
      <ul role="listbox">
        <li
          v-for="(item, i) in items" :key="item.kind + item.name" role="option" :aria-selected="i === cursor"
          :class="{ on: i === cursor }" @mouseenter="cursor = i" @mousedown.prevent="pick(item)"
        >
          <span class="badge" :class="item.kind">{{ item.kind === 'html' ? '<>' : item.kind === 'snippet' ? 'S' : item.kind === 'variable' ? '{ }' : 'C' }}</span>
          <span class="name">{{ item.name }}</span>
          <span class="hint">{{ item.hint }}</span>
        </li>
        <li v-if="!items.length" class="none">nothing fits here</li>
      </ul>
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
  color: oklch(0.5 0.14 40);
}

/* Element at caret: selection is accent + 1px accent-border ring, never a fill (design §1). */
.sprint-plus {
  position: absolute;
  z-index: 5;
  display: flex;
  gap: 4px;
  margin: 1px 0 0 10px; /* right of the caret */
}
.sprint-plus button {
  height: 18px;
  padding: 0 6px;
  border: 1px dashed var(--border);
  border-radius: 5px;
  background: var(--card);
  color: var(--muted-foreground);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
  transition: background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out;
}
.sprint-plus button:hover { border-color: var(--primary); border-style: solid; background: var(--accent); color: var(--primary); }
.sprint-insert {
  position: absolute;
  z-index: 60; /* above Monaco's overlays (suggest widget is 40) */
  width: 300px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--popover);
  box-shadow: 0 18px 40px -14px rgb(0 0 0 / 0.3);
}
.sprint-insert input {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--input);
  border-radius: 6px;
  background: var(--card);
  font-size: 12px;
  outline: none;
}
.sprint-insert input:focus-visible { box-shadow: 0 0 0 2px var(--ring); }
.sprint-insert ul { max-height: 260px; margin: 6px 0 0; padding: 0; overflow: auto; list-style: none; }
.sprint-insert li { display: flex; align-items: center; gap: 8px; height: 26px; padding: 0 6px; border-radius: 6px; cursor: default; }
.sprint-insert li.on { background: var(--accent); box-shadow: inset 0 0 0 1px var(--accent-border); }
.sprint-insert li.none { color: var(--muted-foreground); font-size: 11px; }
.sprint-insert .badge {
  width: 20px; height: 20px; display: grid; place-items: center; border-radius: 5px;
  background: var(--info-bg); color: var(--info); font-family: var(--font-mono); font-size: 9.5px; font-weight: 600;
}
.sprint-insert .badge.html { background: var(--muted); color: var(--muted-foreground); }
.sprint-insert .name { font-family: var(--font-mono); font-size: 11.5px; font-weight: 500; }
.sprint-insert .hint { margin-left: auto; font-family: var(--font-mono); font-size: 10px; color: var(--muted-foreground); }

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
