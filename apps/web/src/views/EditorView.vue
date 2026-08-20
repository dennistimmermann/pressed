<!--
  Layout only (SPEC §2): two full-width strip rows, then a work area of three columns —
  [ Layers 236 | middle | Inspector 340 + Status ]. The mode owns the middle column and
  nothing else: Blocks → Canvas, Split → Canvas over (or beside) the editor, Code → editor,
  with the canvas becoming a Preview (240px default, draggable) above the Inspector. Layers, Inspector and Status
  never move, so switching modes cannot reflow them.

  E12: at ≤900px the same tree stacks into one scrolling column (middle · Layers · Inspector +
  Status) — classes change, nothing unmounts, so Monaco survives crossing the breakpoint.
-->
<script setup lang="ts">
import { computed, nextTick, ref, toRaw, useTemplateRef, watch } from 'vue'
import { useElementSize, useEventListener, useMediaQuery } from '@vueuse/core'
import { parseMeta } from '@sprint/core/template/meta.ts'
import { LayersPane, ManageTemplates, PreviewPane, StatusPane } from '@sprint/editor'
import type { EditorMode } from '@sprint/editor'
import type { Loc } from '@sprint/editor/ast.ts'
import EditorHeader from '@/components/EditorHeader.vue'
import EditorPane from '@/components/EditorPane.vue'
import InspectorPane from '@/components/InspectorPane.vue'
import Splitter from '@/components/Splitter.vue'
import { K30F } from '@/printers'
import { rasterDataUrl } from '@/raster'
import {
  addBlock, can, canFor, canvasEnterScope, canvasReorder, canvasResize, canvasSelect, classTarget,
  deleteRule, deleteSelected, dirty, duplicateSelected, editor, element, ensureSelector,
  enterScope, erroredElements, filename, formatBlock, goToOffset, indentSelected, jumpTo, layerCount, layers,
  leaveScope, load, matchedLocs, meta, insertables, insertText, moveSelected, outdentSelected, previewDocument,
  previewState, renameRule, reparent, ruleAtCaret, runOnElement, save, saveAs, scopeRange,
  scopeRules, scriptInfo, selectElement, setComputedStyles, switchTab, tabs, wrapChoices,
} from '@/stores/editor'
import { data } from '@/stores/data'
import { settings } from '@/stores/settings'
import {
  bundled, deleteTemplate, duplicateTemplate, exportTemplate, importTemplates, isBundled,
  newTemplate, renameTemplate, templateName, templates,
} from '@/stores/templates'

// SPEC §3 E12: below 900 the three columns stack, Split is not offered and Layers is a select.
const stacked = useMediaQuery('(max-width: 900px)')

// ---------------------------------------------------------------- mode & geometry

/**
 * The mode is remembered per template; a template opened for the first time gets Split.
 * E12: there is no Split under 900px, so a persisted `split` reads as `code` — the stored
 * choice survives, it just is not honoured at this width.
 */
const modeChoices = computed<EditorMode[]>(() => (stacked.value ? ['blocks', 'code'] : ['blocks', 'split', 'code']))
const mode = computed<EditorMode>({
  get: () => {
    const stored = settings.modeByTemplate[editor.templateId ?? ''] ?? 'split'
    return stacked.value && stored === 'split' ? 'code' : stored
  },
  set: (m) => { settings.modeByTemplate[editor.templateId ?? ''] = m },
})
const cycleMode = () => {
  const list = modeChoices.value
  mode.value = list[(list.indexOf(mode.value) + 1) % list.length]
}

// The canvas keeps its px size across a flip; the editor takes whatever is left. `flex-shrink`
// rather than `flex: none`, so a small window squeezes the canvas instead of overflowing.
const middle = useTemplateRef<HTMLElement>('middle')
const { width: middleWidth, height: middleHeight } = useElementSize(middle)
const splitMax = computed(() =>
  Math.max(200, (settings.splitSideBySide ? middleWidth.value : middleHeight.value) - 200),
)
const canvasStyle = computed(() => (mode.value === 'split' ? { flex: `0 1 ${settings.splitSize}px` } : { flex: '1 1 0' }))

// ---------------------------------------------------------------- keyboard (README-tabs §3)
// Physical keys (`e.code`), because ⌥ rewrites `e.key` on macOS. Capture phase: Monaco eats
// ⌥⇧← for its own selection command before a bubbling listener would ever see it.

useEventListener('keydown', (e: KeyboardEvent) => {
  // `stopPropagation` as well as `preventDefault`: a capture listener that only prevents the
  // default still lets the event reach Monaco, which would run its own ⌥⇧← / ⌥⇧↑ selection
  // command on top of ours and drag the caret off the element we just moved.
  const act = (run: () => void) => { e.preventDefault(); e.stopPropagation(); run() }
  // Structure commands act on the element at the caret, so they only exist on Template tabs.
  const structural = editor.activeTab.kind === 'template' && !!element.value

  // ⌘⇧M cycles Blocks → Split → Code (SPEC §6); it is the only shortcut the geometry owns.
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.code === 'KeyM') return act(cycleMode)

  // ⌘+ ⌘− ⌘0 zoom the canvas (SPEC §6). Monaco binds none of the three, and the capture phase
  // gets them before the browser's own page zoom.
  if ((e.metaKey || e.ctrlKey) && !e.altKey) {
    const key = mode.value === 'code' ? 'zoomPreview' : 'zoomCanvas'
    const now = settings[key] === 'fit' ? 1 : (settings[key] as number)
    if (e.code === 'Equal') return act(() => { settings[key] = Math.min(8, now + 0.5) })
    if (e.code === 'Minus') return act(() => { settings[key] = Math.max(0.5, now - 0.5) })
    if (e.code === 'Digit0') return act(() => { settings[key] = 'fit' })
  }

  // ⌘⇧D / ⌘⇧K: Monaco owns ⌘D (add selection to next match) and ⌘⇧K (delete line), so both
  // take the shifted / overridden form; capture phase gets them before Monaco does.
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && structural) {
    if (e.code === 'KeyD') return act(duplicateSelected)
    if (e.code === 'KeyK') return act(deleteSelected)
  }

  if (!e.altKey || e.metaKey || e.ctrlKey) return
  // ⌥⇧ arrows move the element. ⌥⇧← is also "leave the snippet scope" (README-tabs §3): outdent
  // wins while there is a level left to climb, and the last press walks out of the snippet.
  if (e.shiftKey && structural) {
    if (e.code === 'ArrowUp') return act(() => moveSelected('up'))
    if (e.code === 'ArrowDown') return act(() => moveSelected('down'))
    if (e.code === 'ArrowRight') return act(indentSelected)
    if (e.code === 'ArrowLeft' && can.value.outdent) return act(outdentSelected)
  }
  if (e.shiftKey && e.code === 'ArrowLeft') return act(leaveScope)
  if (e.shiftKey && e.code === 'KeyF') return act(() => { void formatBlock() })
}, { capture: true })

// ---------------------------------------------------------------- preview

const dots = computed(() => ({
  width: Math.round((meta.value.size.width * K30F.dpi) / 25.4),
  height: Math.round((meta.value.size.height * K30F.dpi) / 25.4),
}))

/** SPEC §8, verbatim: `60 × 40 mm · 480 × 320 dots @ 203 dpi · row N / M`, or `no data`. */
const footnote = computed(() =>
  [
    `${meta.value.size.width} × ${meta.value.size.height} mm`,
    `${dots.value.width} × ${dots.value.height} dots @ ${K30F.dpi} dpi`,
    data.rows.length ? `row ${data.previewRowIndex + 1} / ${data.rows.length}` : 'no data',
  ].join(' · '),
)

/** `div .title` — the canvas name tab and the last crumb of the breadcrumb chip. */
const elementName = computed(() => {
  const el = element.value
  if (!el) return null
  const cls = el.props.find((p) => p.name === 'class' && !p.isBinding)?.value?.trim()
  return el.tag + (cls ? ' ' + cls.split(/\s+/).map((c) => `.${c}`).join('') : '')
})

// The raster view is the real 1-bit bitmap, so it only gets built when it is on screen.
const rasterSrc = ref<string>()
watch(
  [() => settings.previewMode, () => editor.label],
  async ([previewMode, label]) => {
    if (previewMode !== 'raster' || !label) return (rasterSrc.value = undefined)
    try {
      rasterSrc.value = await rasterDataUrl(label, meta.value.size, K30F)
    } catch {
      rasterSrc.value = undefined // a raster failure must not take the preview down
    }
  },
  { immediate: true },
)

// ---------------------------------------------------------------- pane props
// One computed per pane: the single place that has to change if a pane's props do.

/**
 * Canvas and Preview are the same component (SPEC §4.5); everything below is shared, and the
 * three mounts differ only in `handles`, which zoom they are given and whether they carry the
 * footnote — in Blocks that line lives in the Status strip instead.
 */
const canvasProps = computed(() => ({
  document: previewDocument.value,
  sizeMm: meta.value.size,
  rasterSrc: rasterSrc.value,
  state: previewState.value,
  selectedLoc: element.value?.loc,
  matchedLocs: matchedLocs.value,
  scopeRange: scopeRange.value,
  crumbs: [editor.activeTab.scope ?? 'label', ...(elementName.value ? [elementName.value] : [])],
  row: { index: data.previewRowIndex, total: data.rows.length },
  resizable: !!classTarget.value,
  empty: layerCount.value === 0,
  mode: settings.previewMode,
  'onUpdate:mode': (mode: 'rendered' | 'raster') => { settings.previewMode = mode },
  onSelect: canvasSelect,
  'onEnter-scope': canvasEnterScope,
  onReorder: canvasReorder,
  onResize: canvasResize,
  'onComputed-styles': setComputedStyles,
  onStep: (by: number) => {
    data.previewRowIndex = Math.min(Math.max(data.previewRowIndex + by, 0), data.rows.length - 1)
  },
}))

/**
 * Layers (SPEC §4.2). Three sections over one scope: the template tree, the scope's rules and
 * its script summary. The active block tab decides which section takes the remaining height;
 * collapse is the user's and is persisted. Every command comes back as an event and becomes
 * exactly one text edit.
 */
const SECTION = { template: 'layers', style: 'rules', script: 'script' } as const
const ruleAt_ = (start: number) => scopeRules.value.find((r) => r.start === start)?.rule

// Landing on a block tab expands its section (E7 · E8). Collapsing it again is the user's and
// sticks until the next tab switch — the alternative, a section the tab points at but cannot
// show, is worse.
watch(() => editor.activeTab.kind, (kind) => { settings.layersCollapsed[SECTION[kind]] = false })

const layersProps = computed(() => ({
  tree: layers.value,
  selected: element.value?.loc,
  errors: erroredElements.value,
  count: layerCount.value,
  snippets: tabs.value.snippets.map((s) => s.name),
  insertables: insertables.value,
  wrapChoices: wrapChoices.value,
  can: canFor,
  rules: scopeRules.value,
  selectedRule: ruleAtCaret.value?.start ?? null,
  script: scriptInfo.value,
  active: SECTION[editor.activeTab.kind],
  compact: stacked.value,
  scopeName: editor.activeTab.scope,
  rootName: 'label',
  collapsed: settings.layersCollapsed,
  opensCode: mode.value === 'blocks',
  onSelect: selectElement,
  onInsert: (e: { item: { text: string }; after: Loc | null; inside: boolean }) =>
    insertText(e.item.text, e.after, e.inside ? 'inside' : 'after'),
  onMove: (e: { loc: Loc; target: Loc; position: 'before' | 'after' | 'inside' }) => reparent(e.loc, e.target, e.position),
  onCommand: (e: { kind: string; loc: Loc }) => runOnElement(e.loc, e.kind),
  'onEnter-scope': enterScope,
  onToggle: (s: 'layers' | 'rules' | 'script') => { settings.layersCollapsed[s] = !settings.layersCollapsed[s] },
  // A rule row puts the caret inside the rule — which switches to the Style tab on the way.
  'onSelect-rule': (start: number) => { const r = ruleAt_(start); if (r) goToOffset(r.bodyStart + 1) },
  'onRename-rule': (e: { start: number; selector: string }) => { const r = ruleAt_(e.start); if (r) renameRule(r, e.selector) },
  'onDelete-rule': (start: number) => { const r = ruleAt_(start); if (r) deleteRule(r) },
  'onNew-rule': (selector: string) => { const at = ensureSelector(selector); void nextTick(() => goToOffset(at)) },
  // Blocks has no editor pane, so reading the script means switching mode first (SPEC §3 E1).
  'onOpen-script': () => {
    if (mode.value === 'blocks') mode.value = 'code'
    if (!scriptInfo.value) return addBlock('script') // no script block yet: `–` adds one
    switchTab({ scope: editor.activeTab.scope, kind: 'script' })
  },
}))

const statusProps = computed(() => ({
  messages: editor.messages,
  // Blocks has no footnote under the sheet, so the Status strip carries it (SPEC §4.5).
  okSummary: mode.value === 'blocks'
    ? footnote.value
    : `compiled · ${tabs.value.snippets.length} snippets · ${editor.components.length} components`,
  // E10: one neutral row saying why the label shows field paths. Not an error, not counted.
  info: data.rows.length ? '' : 'no data connected — showing field paths',
  onJump: jumpTo,
}))

// ---------------------------------------------------------------- picker / manage

const all = computed(() => [...templates.mine, ...bundled])
const nameOf = (id: string | null) => {
  const record = all.value.find((t) => t.id === id)
  return record ? templateName(record) : 'Untitled'
}
const mediaText = (source: string) => {
  const { width, height } = parseMeta(source).meta.size
  return `${width} × ${height}`
}

const thumbnails = ref<Record<string, string>>({})

const manageItems = computed(() =>
  all.value.map((t) => ({
    id: t.id,
    name: templateName(t),
    meta: `${mediaText(t.source)} mm · ${isBundled(t.id) ? 'built-in' : 'mine'}`,
    media: mediaText(t.source),
    kind: (isBundled(t.id) ? 'built-in' : 'mine') as 'built-in' | 'mine',
    assetsSummary: Object.keys(t.assets).length ? `${Object.keys(t.assets).length} assets` : undefined,
    thumbnail: thumbnails.value[t.id],
  })),
)

// ponytail: one compile per template, sequential, only when the dialog opens. Cache it if
// the library ever grows past a few dozen.
watch([() => editor.manageOpen, all], async ([open]) => {
  if (!open) return
  const { runtime } = await import('@/runtime-client')
  const { labelDocument } = await import('@sprint/core/template/label.ts')
  for (const t of all.value) {
    if (thumbnails.value[t.id]) continue
    try {
      // toRaw: a Vue proxy cannot be structured-cloned across postMessage — the throw landed
      // in the catch below and user-saved templates silently never got a thumbnail.
      const result = await runtime().render({ source: t.source, assets: toRaw(t.assets), rows: [] })
      if (result.html[0] != null)
        thumbnails.value[t.id] = labelDocument({ html: result.html[0], css: result.css }, result.meta.size)
    } catch { /* a template that will not compile simply has no thumbnail */ }
  }
})

/** Switching away from unsaved work asks first, and offers the third way out (design §4). */
const pendingId = ref<string | null>(null)
const saveAsName = ref<string | null>(null)

function pick(id: string) {
  if (id === editor.templateId) return
  if (dirty.value) return (pendingId.value = id)
  load(id)
}

function confirmDiscard() {
  const id = pendingId.value
  pendingId.value = null
  if (id) load(id)
}

async function confirmSaveAs() {
  const name = saveAsName.value?.trim()
  if (!name) return
  saveAsName.value = null
  await saveAs(name)
  confirmDiscard()
}

async function onCreate() {
  const record = await newTemplate()
  editor.manageOpen = false
  pick(record.id)
}
</script>

<template>
  <section class="relative flex h-full min-h-0 flex-col">
    <!--
      One component tree at both widths (E12): Monaco is never remounted by a resize. Under
      900px the work area stacks — middle, then Layers, then Inspector + Status — and scrolls;
      the splitters have nothing to drag there, so they go.
    -->
    <EditorHeader
      v-model:mode="mode" :modes="modeChoices"
      @save-as="saveAsName = `${nameOf(editor.templateId)} copy`"
    />

    <!-- The work area (MIGRATION §3): flush white panes, no padding and no gap. What separates
         two columns is the 9px splitter rail, which carries the 1px --pane-border on both of its
         long edges; stacked (≤900px) there are no rails, so each pane draws its own hairline. -->
    <div
      class="flex min-h-0 flex-1 bg-[var(--pane)]"
      :class="stacked ? 'flex-col overflow-y-auto' : ''"
    >
      <!-- Layers: every mode, every block. Nothing to show is an empty state, not a missing pane. -->
      <div
        class="min-w-0 flex-none border-b border-[var(--pane-border)]"
        :class="stacked ? 'order-2' : 'border-b-0'"
        :style="stacked ? undefined : { width: `${settings.layersWidth}px` }"
      >
        <LayersPane v-bind="layersProps" class="h-full" />
      </div>
      <Splitter v-if="!stacked" v-model:size="settings.layersWidth" :min="180" />

      <!--
        The middle column is the only thing the mode changes. Both panes stay mounted in all
        three: the editor owns the language-service worker and the EditorHandle every codeless
        edit goes through, and the canvas keeps its zoom — hiding is not unmounting.
      -->
      <div
        ref="middle" class="flex min-h-0 min-w-0 border-b border-[var(--pane-border)]"
        :class="[
          settings.splitSideBySide && mode === 'split' ? 'flex-row' : 'flex-col',
          stacked ? 'order-1 h-[55vh] flex-none' : 'flex-1 border-b-0',
        ]"
      >
        <div v-show="mode !== 'code'" class="min-h-0 min-w-0" :style="canvasStyle">
          <PreviewPane
            v-bind="canvasProps" handles :zoom="settings.zoomCanvas" class="h-full"
            @update:zoom="settings.zoomCanvas = $event"
          />
        </div>
        <Splitter
          v-if="mode === 'split' && !stacked" v-model:size="settings.splitSize"
          :dir="settings.splitSideBySide ? 'x' : 'y'" :min="160" :max="splitMax"
        />
        <div v-show="mode !== 'blocks'" class="min-h-0 min-w-0 flex-1">
          <EditorPane class="h-full" :flippable="mode === 'split' && !stacked" />
        </div>
      </div>

      <Splitter v-if="!stacked" v-model:size="settings.inspectorWidth" :min="300" invert />
      <!-- Inspector: identical in every mode, plus the Preview when the canvas has left the
           middle column (SPEC §2). In Code mode the Preview is the top section of this column,
           cut off by the splitter rail. -->
      <div
        class="flex min-w-0 flex-none flex-col"
        :class="stacked && 'order-3'"
        :style="stacked ? undefined : { width: `${settings.inspectorWidth}px` }"
      >
        <template v-if="mode === 'code'">
          <div class="flex-none" :style="{ height: `${settings.previewHeight}px` }">
            <PreviewPane
              v-bind="canvasProps" :footnote="footnote" :zoom="settings.zoomPreview" class="h-full"
              @update:zoom="settings.zoomPreview = $event"
            />
          </div>
          <!-- Same rail as Split: drag sizes the Preview (240px default, persisted). -->
          <Splitter v-if="!stacked" v-model:size="settings.previewHeight" :min="160" dir="y" />
          <div v-else class="h-[9px] flex-none border-y border-[var(--pane-border)] bg-[var(--splitter)]" />
        </template>
        <div class="min-h-0 flex-1" :class="stacked && 'h-[280px] flex-none'"><InspectorPane class="h-full" /></div>
      </div>
    </div>

    <!-- Status: one ink strip across the whole foot of the view, under every column; it expands
         upward over the work area to at most 40% of the view. -->
    <StatusPane v-bind="statusProps" class="on-ink max-h-[40%] flex-none" />

    <!-- Dirty confirm and save-as: inline, because a question is not an error dialog. -->
    <div
      v-if="pendingId || saveAsName !== null"
      class="absolute top-[80px] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-[var(--radius-trough)] border border-input bg-popover px-3 py-2 shadow-[var(--shadow-popover)]"
    >
      <template v-if="saveAsName !== null">
        <label class="text-[12px]" for="save-as-name">Save current as</label>
        <input
          id="save-as-name" v-model="saveAsName" autofocus
          class="h-[28px] w-[180px] rounded-[var(--radius-control)] border border-transparent bg-muted px-2 text-[12px] outline-none focus:border-primary focus:bg-card"
          @keydown.enter="confirmSaveAs"
        >
        <button type="button" class="h-[28px] rounded-[var(--radius-control)] border border-input px-2 text-[12px] hover:bg-muted" @click="confirmSaveAs">Save</button>
        <button type="button" class="text-[12px] text-muted-foreground hover:text-foreground" @click="saveAsName = null">Cancel</button>
      </template>
      <template v-else>
        <span class="text-[12px]">{{ filename }} has unsaved changes.</span>
        <button type="button" class="h-[28px] rounded-[var(--radius-control)] border border-input px-2 text-[12px] hover:bg-muted" @click="saveAsName = `${nameOf(editor.templateId)} copy`">
          Save as new template…
        </button>
        <button type="button" class="h-[28px] rounded-[var(--radius-control)] border border-input px-2 text-[12px] hover:bg-muted" @click="save().then(confirmDiscard)">Save</button>
        <button type="button" class="text-[12px] text-destructive hover:underline" @click="confirmDiscard">Discard</button>
        <button type="button" class="text-[12px] text-muted-foreground hover:text-foreground" @click="pendingId = null">Cancel</button>
      </template>
    </div>

    <ManageTemplates
      :open="editor.manageOpen" :items="manageItems"
      @close="editor.manageOpen = false"
      @open="editor.manageOpen = false; pick($event)"
      @duplicate="duplicateTemplate"
      @rename="renameTemplate"
      @export="exportTemplate"
      @delete="deleteTemplate"
      @import="importTemplates"
      @create="onCreate"
    />
  </section>
</template>
