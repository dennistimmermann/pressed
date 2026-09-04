<script setup lang="ts">
import { editor as monacoEditor, type IRange, MarkerSeverity, Range, Uri } from 'monaco-editor-core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import type { EditorHandle } from './editor-handle'
import { attributeEdit, cursorContext, elementAt, insertAt, insertVar, type CursorContext } from './ast'
import { insertItems, type IconSchema, type InsertItem } from './inspector/insert'
import type { ComponentSchema } from './types'
import { getOrCreateModel, startLanguageService } from './monaco/env'
import { componentUri, ENV_URI, SPRINT_MODULE_URI, pressedEnv } from './monaco/pressed-env'
import { snippetSfc, snippetUri, SNIPPET_DIR, SNIPPET_NAME, toFileOffset, type SnippetSfc } from './monaco/snippets'
import { AddRow } from '@/ui'
import { defineSprintTheme } from './monaco/theme'
import { tabsModel } from './tabs'

/**
 * The Monaco + Volar editor pane (design §3.3).
 *
 * Everything that edits the text from outside — Layers, the Inspector — goes through the
 * `EditorHandle` this exposes, so there is exactly one undo stack and one caret (spec §9c).
 * Inserting is typing (`<`, `{{`) plus the Volar completion, Layers' `+ Insert element`, or
 * the `+ component` / `+ variable` buttons that follow the caret in a template block.
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
    /**
     * `+ component`: library components and this file's snippets, on top of plain HTML filtered
     * by the enclosing element. Off (no button) when null — the host only passes it in a template block.
     */
    insertables?: { components: ComponentSchema[]; snippets: ComponentSchema[]; icons?: IconSchema[] } | null
    /** `+ variable`: the `row.x` paths, or — inside a snippet scope — its props. Off when null. */
    variables?: { path: string; hint: string }[] | null
  }>(),
  { filename: 'Label.vue', visible: null, emptyText: null, markers: () => [], insertables: null, variables: null },
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
const markerListeners = new Set<() => void>()

const mainUri = () => Uri.parse(`file:///${props.filename}`)

// ---------------------------------------------------------------- the models the worker sees

/**
 * `<snippet>` is a custom block, so Volar sees nothing inside it. One virtual `.vue` model per
 * snippet — the SFC the runtime compiles — gives back type-checking *and* makes the snippet a
 * known component; `validateSnippets` maps their diagnostics back onto this file.
 */
let snippets: SnippetSfc[] = []
/** Set up in `onMounted` — a debounced re-run of the snippet diagnostics. */
let scheduleSnippets = () => {}

/** Regenerate the virtual environment: context type, `pressed` module, library and snippet sources. */
function syncEnvModels() {
  const source = instance.value?.getModel()?.getValue() ?? props.modelValue
  snippets = tabsModel(source).snippets.filter((s) => SNIPPET_NAME.test(s.name)).map((s) => snippetSfc(source, s))
  const live = new Set(snippets.map((s) => snippetUri(s.name)))
  for (const s of snippets) getOrCreateModel(Uri.parse(snippetUri(s.name)), 'vue', s.text)
  // A renamed or deleted snippet must stop existing, or the language service keeps type-checking it.
  for (const m of monacoEditor.getModels())
    if (m.uri.toString().startsWith(SNIPPET_DIR) && !live.has(m.uri.toString())) m.dispose()

  for (const [uri, text] of Object.entries(pressedEnv(props.contextType, Object.keys(props.libraryComponents), snippets.map((s) => s.name)))) {
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
  ;(ed as unknown as { setHiddenAreas(r: IRange[], source?: unknown): void }).setHiddenAreas(ranges, 'pressed')
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
  ...snippets.map((s) => Uri.parse(snippetUri(s.name))),
]

// ---------------------------------------------------------------- insert popup
// The third insert path, next to Layers' `+ Insert element` and plain typing: a `+` follows the
// caret wherever something can be dropped in. On a blank template line it offers components /
// snippets / HTML (filtered by the enclosing element); in text, inside `{{ }}` or in a bound
// attribute it offers variables. Picking is one edit, i.e. one ⌘Z.

type Mode = 'components' | 'variables'
type Spot = { modes: Mode[]; context: CursorContext | 'blank' }
const plus = ref<{ top: number; left: number; modes: Mode[] } | null>(null)
const popup = ref<{ top: number; left: number; from: number; mode: Mode; context: Spot['context'] } | null>(null)
const query = ref('')
const cursor = ref(0)
/** A `+` without a caret is a button pointing nowhere: only ever show it while the text is focused. */
const focused = ref(false)

/** What can be inserted at the caret: components and/or variables, and where the caret sits. */
function spotAt(ed: monacoEditor.IStandaloneCodeEditor): Spot | null {
  const pos = ed.getPosition(), model = ed.getModel()
  if (!pos || !model) return null
  const offset = model.getOffsetAt(pos)
  const line = model.getLineContent(pos.lineNumber)
  // Mid-tag (`<di|`, `<div cla|`): the user is typing a tag; nothing to offer until it closes.
  if (/<[^>]*$/.test(line.slice(0, pos.column - 1))) return null
  const context = cursorContext(model.getValue(), offset)
  // A blank line *in a template* takes the whole list. In Full view the caret can also land on a
  // blank line at the file root or in `<style>`, and only the context tells those apart.
  if (line.trim() === '' && context === 'text' && props.insertables)
    return { modes: props.variables ? ['components', 'variables'] : ['components'], context: 'blank' }
  if (!props.variables) return null
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
  const { mode, from } = popup.value
  let all: InsertItem[]
  if (mode === 'components') {
    const parent = elementAt(instance.value?.getValue() ?? '', from)
    all = insertItems(props.insertables!.components, props.insertables!.snippets, parent?.tag ?? null, undefined, props.insertables!.icons)
  } else {
    // `insertVar` decides `{{ row.x }}` versus bare `row.x` at pick time, from the caret's context.
    all = (props.variables ?? []).map((v) => ({ name: v.path, kind: 'variable', hint: v.hint, text: '' }))
  }
  const q = query.value.trim().toLowerCase()
  return q ? all.filter((i) => i.name.toLowerCase().includes(q)) : all
})

/** A parent-illegal row is listed but not pickable (SPEC §4.8), so the cursor never rests on one. */
const firstPickable = () => Math.max(0, items.value.findIndex((i) => !i.illegal))

function placePlus() {
  const ed = instance.value
  const spot = focused.value && ed ? spotAt(ed) : null
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
  cursor.value = firstPickable()
  void nextTick(() => container.value?.querySelector<HTMLInputElement>('.pressed-insert input')?.focus())
}
function closePopup(refocus = true) {
  popup.value = null
  if (refocus) instance.value?.focus()
}
function pick(item: InsertItem | undefined) {
  if (!item || item.illegal || !popup.value) return
  const { from, context } = popup.value
  const model = instance.value!.getModel()!
  if (item.kind === 'variable') {
    // `size=""` → `:size="row.x"`: one edit on the attribute; everywhere else a plain insert.
    let edit
    if (context === 'attr-value-static') {
      const el = elementAt(model.getValue(), from)!
      const prop = el.props.find((p) => p.valueLoc && from >= p.valueLoc.start && from <= p.valueLoc.end)!
      edit = attributeEdit(el, prop.name, 'set-binding', item.name)
    } else {
      edit = insertVar(model.getValue(), from, item.name)
    }
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
  handle.executeEdits([insertAt(from, text)])
  handle.setCaret(from + (caretAt < 0 ? text.length : caretAt))
  closePopup()
}
/** Arrows step over the illegal rows; Enter inserts, Esc gives the caret back. */
function moveCursor(delta: number) {
  for (let i = cursor.value + delta; i >= 0 && i < items.value.length; i += delta)
    if (!items.value[i].illegal) return void (cursor.value = i)
}
function onPopupKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') moveCursor(1)
  else if (e.key === 'ArrowUp') moveCursor(-1)
  else if (e.key === 'Enter') pick(items.value[cursor.value])
  else if (e.key === 'Escape') closePopup()
  else return
  e.preventDefault()
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
    lineNumbersMinChars: 3, // SPEC §4.6: gutter 40–52px; the spare char is the breathing room left of the numbers
    lineDecorationsWidth: 12,
    glyphMargin: false,
    padding: { top: 8, bottom: 8 },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    minimap: { enabled: false },
    overviewRulerLanes: 0,
    inlineSuggest: { enabled: false },
    // A label is prose and measurements, not identifiers: `20×10`, `–` for unset, `…` are the
    // point, not homoglyph tricks — so no box around them. Invisible characters keep theirs: a
    // stray non-breaking or zero-width space prints.
    unicodeHighlight: { ambiguousCharacters: false, nonBasicASCII: false },
    fixedOverflowWidgets: true,
    smoothScrolling: false,
    cursorBlinking: 'solid',
    // Not an IDE: no refactoring lightbulb ("extract to file/component"), no context menu, no code lens.
    lightbulb: { enabled: monacoEditor.ShowLightbulbIconMode.Off },
    contextmenu: false,
    codeLens: false,
    occurrencesHighlight: 'off',
    selectionHighlight: false,
    // Hover is on so a squiggle explains itself (Volar's type diagnostics are not in Status).
    hover: { enabled: true, delay: 300, above: false },
    stickyScroll: { enabled: false },
    folding: false, // the tabs are the folding
  })
  instance.value = ed
  disposables.push(ed)

  // Volar sends semantic tokens; Monaco only paints them when the theme opts in, and the
  // standalone theme has no public switch for it (same hack as @vue/repl).
  const theme = (ed as unknown as { _themeService: { _theme: { semanticHighlighting: boolean } } })._themeService._theme
  theme.semanticHighlighting = true

  const service = startLanguageService(syncUris)
  disposables.push(service)

  // Volar only validates models that are attached to an editor, and the snippet models are not:
  // ask the worker for their diagnostics ourselves and rebase them onto this file. One owner for
  // all of them and the whole set rewritten every run, so a rename or delete leaves nothing stale.
  let requestId = 0
  async function validateSnippets() {
    const model = ed.getModel()
    if (!model) return
    const version = model.getVersionId()
    const worker = await service.worker.withSyncedResources(syncUris())
    const out: monacoEditor.IMarkerData[] = []
    for (const snippet of snippets) {
      const uri = Uri.parse(snippetUri(snippet.name))
      const sfc = monacoEditor.getModel(uri)
      if (!sfc) continue
      const diagnostics = await worker.getDiagnostics(++requestId, uri)
      if (model.isDisposed() || model.getVersionId() !== version) return // the text moved under us
      const at = (p: { line: number; character: number }) =>
        toFileOffset(snippet, sfc.getOffsetAt({ lineNumber: p.line + 1, column: p.character + 1 }))
      for (const d of diagnostics) {
        // Nothing in the file corresponds to the synthesized shorthand wrapper: blame the name.
        const start = at(d.range.start), end = at(d.range.end)
        const span = start === null || end === null ? snippet.nameLoc : { start, end }
        const a = model.getPositionAt(span.start), b = model.getPositionAt(span.end)
        out.push({
          message: typeof d.message === 'string' ? d.message : d.message.value,
          severity: d.severity === 2 ? MarkerSeverity.Warning
            : d.severity === 3 ? MarkerSeverity.Info
              : d.severity === 4 ? MarkerSeverity.Hint : MarkerSeverity.Error,
          startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column,
        })
      }
    }
    monacoEditor.setModelMarkers(model, 'vue-snippets', out)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  scheduleSnippets = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void validateSnippets(), 250) // the debounce @volar/monaco uses for its own
  }
  disposables.push({ dispose: () => clearTimeout(timer) })
  scheduleSnippets()

  disposables.push(
    ed.onDidChangeModelContent(() => {
      emit('update:modelValue', ed.getValue())
      // The snippet models are derived text: keep them in step with the file, then re-check.
      syncEnvModels()
      scheduleSnippets()
      // Edits shift Monaco's tracked hidden ranges; re-assert ours (a no-op when unchanged) so a
      // multi-line change inside the block cannot leave stale gaps.
      void nextTick(applyVisible)
    }),
    ed.onDidChangeCursorPosition(() => {
      const offset = ed.getModel()!.getOffsetAt(ed.getPosition()!)
      emit('caret', offset)
      for (const cb of caretListeners) cb(offset)
      placePlus()
      // The popup belongs to the spot it opened on: moving away closes it (without stealing focus back).
      if (popup.value && offset !== popup.value.from) closePopup(false)
    }),
    monacoEditor.onDidChangeMarkers((uris) => {
      const uri = ed.getModel()?.uri.toString()
      if (uri && uris.some((u) => u.toString() === uri)) for (const cb of markerListeners) cb()
    }),
    ed.onDidScrollChange(placePlus),
    ed.onDidLayoutChange(placePlus),
    ed.onDidFocusEditorText(() => { focused.value = true; placePlus() }),
    ed.onDidBlurEditorText(() => { focused.value = false; plus.value = null }),
  )
  watch(() => [props.insertables, props.variables], placePlus)

  // One tab = one visible line range; everything else is hidden (README-tabs §1). Line numbers
  // keep counting, which is the cheapest proof that this is still one file.
  applyVisible()
  // Hidden areas live on the view model, i.e. per model: redo them when the model swaps.
  disposables.push(ed.onDidChangeModel(applyVisible))
  watch(() => props.visible, applyVisible, { deep: true })

  // Wavy underlines for what the compiler found. Our own owner, so Volar's markers stay put.
  const applyMarkers = () => {
    const m = ed.getModel()
    if (!m) return
    monacoEditor.setModelMarkers(m, 'pressed', props.markers.map((k) => {
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
  () => { syncEnvModels(); scheduleSnippets() },
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
    // One `executeEdits` call between two undo stops: the batch is a single ⌘Z step of its own,
    // on the editor's own undo stack (design §3.4 — "undo-able with ⌘Z"). Without the leading
    // stop Monaco folds the insert into whatever was typed just before it.
    ed.pushUndoStop()
    ed.executeEdits(
      'pressed',
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
  // Monaco holds both marker sets on the one model (ours as owner `pressed`, the language
  // service's as `vue`); back to offsets so callers stay Monaco-free.
  markersIn(range) {
    const model = instance.value?.getModel()
    if (!model) return []
    const offset = (lineNumber: number, column: number) => model.getOffsetAt({ lineNumber, column })
    return monacoEditor
      .getModelMarkers({ resource: model.uri })
      .map((m) => ({
        start: offset(m.startLineNumber, m.startColumn),
        end: offset(m.endLineNumber, m.endColumn),
        message: m.message,
        severity: m.severity === MarkerSeverity.Error ? ('error' as const) : ('warning' as const),
      }))
      .filter((m) => m.start < range.end && m.end > range.start)
  },
  onMarkersChange(cb) {
    markerListeners.add(cb)
    return () => markerListeners.delete(cb)
  },
  focus: () => instance.value?.focus(),
}

defineExpose(handle)
</script>

<template>
  <div ref="container" class="pressed-editor">
    <!-- An empty block gets a centred sentence instead of a bare cursor (README-tabs §7).
         Never captures clicks: typing is what dismisses it. -->
    <div v-if="showEmpty" class="pressed-empty">
      <p class="title">{{ emptyText!.title }}</p>
      <p class="body">
        <span v-for="(part, i) in emptyBody" :key="i" :class="{ mono: part.mono, klass: part.klass }">{{ part.text }}</span>
      </p>
    </div>

    <!-- `+ component` / `+ variable` right of the caret, whichever fit here; the popup hangs under them. -->
    <div v-if="plus && !popup" class="pressed-plus" :style="{ top: `${plus.top}px`, left: `${plus.left}px` }">
      <AddRow
        v-for="mode in plus.modes" :key="mode" inline :noun="mode === 'components' ? 'component' : 'variable'"
        @mousedown.prevent @click="openPopup(mode)"
      />
    </div>
    <div v-if="popup" class="pressed-insert" :style="{ top: `${popup.top}px`, left: `${popup.left}px` }" @keydown="onPopupKey">
      <input
        v-model="query" :placeholder="popup.mode === 'variables' ? 'variable…' : 'component or element…'"
        aria-label="filter" @input="cursor = firstPickable()"
      >
      <ul role="listbox">
        <li
          v-for="(item, i) in items" :key="item.kind + item.name" role="option" :aria-selected="i === cursor"
          :class="{ on: i === cursor && !item.illegal, off: !!item.illegal }"
          @mouseenter="item.illegal || (cursor = i)" @mousedown.prevent="pick(item)"
        >
          <!-- An icon's badge is its glyph: markup, already through the sanitiser (`iconGlyph`); a
               rejected one has no glyph and wears the snippet's `S`. -->
          <span v-if="item.glyph" class="badge icon" v-html="item.glyph" />
          <span
            v-else
            class="badge"
            :class="item.kind === 'html' ? 'html' : item.kind === 'snippet' || item.kind === 'icon' ? 'snip' : item.kind === 'variable' ? 'var' : 'comp'"
          >{{ item.kind === 'html' ? '&lt;&gt;' : item.kind === 'snippet' || item.kind === 'icon' ? 'S' : item.kind === 'variable' ? '{ }' : 'C' }}</span>
          <span class="name">{{ item.name }}</span>
          <span class="hint">{{ item.illegal ?? item.hint }}</span>
        </li>
        <li v-if="!items.length" class="none">nothing fits here</li>
      </ul>
    </div>
  </div>
</template>

<style>
.pressed-editor {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.pressed-editor .pressed-empty {
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
.pressed-editor .pressed-empty p {
  margin: 0;
  font-family: var(--font-sans, system-ui, sans-serif);
}
.pressed-editor .pressed-empty .title {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
}
.pressed-editor .pressed-empty .body {
  max-width: 44ch;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--muted-foreground);
  text-wrap: pretty;
}
.pressed-editor .pressed-empty .mono {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
}
.pressed-editor .pressed-empty .klass {
  color: var(--accent-link);
}

/* `ui/AddRow` — the one add grammar — following the caret. A code line is 18px, so the
   control height is overridden here and nowhere else; AddRow reads it as a token. */
.pressed-editor .pressed-plus {
  position: absolute;
  z-index: 5;
  display: flex;
  gap: 4px;
  margin: 1px 0 0 10px; /* right of the caret */
  --h-control: 18px;
}

/* The popup: the same popover as Layers' `+ Insert element` (SPEC §4.8), anchored to the caret. */
.pressed-editor .pressed-insert {
  position: absolute;
  z-index: 60; /* above Monaco's own overlays (the suggest widget is 40) */
  width: 300px;
  padding: 6px;
  border: 1px solid var(--field-border);
  border-radius: var(--radius-trough);
  background: var(--popover);
  box-shadow: var(--shadow-popover);
}
.pressed-editor .pressed-insert input {
  width: 100%; height: 28px; padding: 0 8px; border: 1px solid transparent; border-radius: var(--radius-control);
  background: var(--field); font-size: 12px; color: var(--foreground); outline: none;
}
.pressed-editor .pressed-insert input:focus-visible { border-color: var(--primary); background: var(--pane); }
.pressed-editor .pressed-insert ul { max-height: 260px; margin: 6px 0 0; padding: 0; overflow: auto; list-style: none; }
.pressed-editor .pressed-insert li {
  display: flex; align-items: center; gap: 8px; height: 26px; padding: 0 6px;
  border-radius: var(--radius-control); cursor: default;
}
/* Selection is accent + a 1px inset ring, never a fill (design §1). */
.pressed-editor .pressed-insert li.on { background: var(--accent); box-shadow: inset 0 0 0 1px var(--accent-border); }
.pressed-editor .pressed-insert li.off { opacity: 0.45; } /* illegal here — listed, with the reason as its hint */
.pressed-editor .pressed-insert li.none { color: var(--muted-foreground); font-size: 11px; }
.pressed-editor .pressed-insert .badge {
  flex: none; padding: 2.5px 4px; border-radius: var(--radius-badge);
  font-family: var(--font-sans); font-size: 8.5px; font-weight: 600; line-height: 1;
}
.pressed-editor .pressed-insert .badge.comp { background: var(--comp-bg); color: var(--comp-fg); }
.pressed-editor .pressed-insert .badge.snip { background: var(--info-bg); color: var(--info); }
.pressed-editor .pressed-insert .badge.html { background: var(--field); color: var(--muted-foreground); }
/* The icon kind: the glyph itself in the plain badge box — the Picker's recipe. */
.pressed-editor .pressed-insert .badge.icon { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 13.5px; padding: 0; background: var(--field); color: var(--muted-foreground); }
.pressed-editor .pressed-insert .badge.icon svg { width: 10px; height: 10px; }
.pressed-editor .pressed-insert .badge.var { background: var(--field); color: var(--accent-link); }
.pressed-editor .pressed-insert .name { font-family: var(--font-mono); font-size: 11.5px; font-weight: 500; }
.pressed-editor .pressed-insert .hint {
  margin-left: auto; font-family: var(--font-mono); font-size: 10px; color: var(--meta-foreground);
}

/* Markers: wavy underline, no ink skipping, so a squiggle under a `.` is still visible. */
.pressed-editor .squiggly-error,
.pressed-editor .squiggly-warning {
  text-decoration-skip-ink: none;
}
</style>
