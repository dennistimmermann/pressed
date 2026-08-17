<!--
  The five panes of design §3. This file is layout only: every pane's props live in one
  computed each (below), so the wide, narrow and stacked arrangements share one wiring.
-->
<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useElementSize, useMediaQuery } from '@vueuse/core'
import { Boxes, Braces } from '@lucide/vue'
import { LIBRARY_NAMES } from '@sprint/core'
import { librarySources } from '@sprint/core/library/index.ts'
import { parseMeta } from '@sprint/core/template/meta.ts'
import {
  ComponentsPane, FileStrip, ManageTemplates, PreviewPane, PropertyEditor, SfcEditor,
  StatusPane, VariablesPane,
} from '@sprint/editor'
import { boxAt, elementAt } from '@sprint/editor/ast.ts'
import type { EditorHandle } from '@sprint/editor/editor-handle.ts'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { K30F } from '@/printers'
import { rasterDataUrl } from '@/raster'
import { data, previewRow } from '@/stores/data'
import {
  dirty, editor, errorCount, filename, handle, jumpTo, load, meta, previewDocument, previewState,
  save, saveAs, warningCount,
} from '@/stores/editor'
import { settings } from '@/stores/settings'
import {
  bundled, deleteTemplate, download, duplicateTemplate, exportTemplate, importTemplates,
  isBundled, newTemplate, renameTemplate, templateName, templates,
} from '@/stores/templates'
import { view } from '@/stores/view'

// Design §3.8. Below 1100 the left column is an icon rail; below 900 everything stacks.
const narrow = useMediaQuery('(max-width: 1100px)')
const stacked = useMediaQuery('(max-width: 900px)')
const rail = ref<'components' | 'variables' | null>(null)

// Splitter layouts are percentages; the store keeps one array per group (design §3).
const sizes = (key: string, fallback: number[]) => settings.paneSizes[key] ?? fallback
const persist = (key: string) => (layout: number[]) => { settings.paneSizes[key] = layout }

// A pane collapses to its own 34px header — as a percentage of the column it lives in.
const leftColumn = useTemplateRef<HTMLElement>('leftColumn')
const { height: leftHeight } = useElementSize(leftColumn)
const collapsedPct = computed(() => (leftHeight.value ? (34 / leftHeight.value) * 100 : 4))

// ---------------------------------------------------------------- caret → element

const element = computed(() => elementAt(editor.source, editor.caret))
const norm = (name: string) => name.replace(/-/g, '').toLowerCase()
const schema = computed(() =>
  editor.components.find((c) => element.value && norm(c.name) === norm(element.value.tag)) ?? null,
)
const line = computed(() => editor.source.slice(0, element.value?.loc.start ?? editor.caret).split('\n').length)

// ---------------------------------------------------------------- preview

const dots = computed(() => ({
  width: Math.round((meta.value.size.width * K30F.dpi) / 25.4),
  height: Math.round((meta.value.size.height * K30F.dpi) / 25.4),
}))

const caption = computed(() =>
  [
    `${meta.value.size.width} × ${meta.value.size.height} mm`,
    `${dots.value.width} × ${dots.value.height} dots @ ${K30F.dpi} dpi`,
    previewState.value === 'no-data' ? 'no data — showing field paths' : 'click an element to jump to its source',
  ].join(' · '),
)

// The raster view is the real 1-bit bitmap, so it only gets built when it is on screen.
const rasterSrc = ref<string>()
watch(
  [() => settings.previewMode, () => editor.label],
  async ([mode, label]) => {
    if (mode !== 'raster' || !label) return (rasterSrc.value = undefined)
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

const fileStripProps = computed(() => ({
  filename: filename.value,
  dirty: dirty.value,
  snippetCount: (editor.source.match(/<snippet[\s>]/g) ?? []).length,
  hasMeta: /<meta[\s>]/.test(editor.source),
  errorCount: errorCount.value,
  warningCount: warningCount.value,
  savedAt: editor.savedAt ?? undefined,
  onSave: () => save(),
  onSaveAs: () => { saveAsName.value = `${nameOf(editor.templateId)} copy` },
  onManage: () => { editor.manageOpen = true },
}))

const editorProps = computed(() => ({
  modelValue: editor.source,
  'onUpdate:modelValue': (value: string) => { editor.source = value },
  contextType: data.rowType,
  libraryComponents: librarySources,
  filename: filename.value,
  foldedRegions: settings.folded[editor.templateId ?? ''],
  highlight: boxAt(editor.source, editor.caret),
  'onUpdate:foldedRegions': (ids: string[]) => { settings.folded[editor.templateId ?? ''] = ids },
  onCaret: (offset: number) => { editor.caret = offset },
  onReady: (h: EditorHandle) => { handle.value = h },
}))

const componentsProps = computed(() => ({
  library: editor.components.filter((c) => LIBRARY_NAMES.includes(c.name)),
  snippets: editor.components.filter((c) => !LIBRARY_NAMES.includes(c.name)),
  handle: handle.value,
  selectedName: element.value?.tag,
  onExtractSnippet: extractSnippet,
  onPromote: promote,
}))

const variablesProps = computed(() => ({
  rowType: data.rowType,
  row: previewRow.value,
  rowLabel: data.rows.length
    ? `${data.sourceId === 'spoolman' ? 'Spool' : 'Row'} · row ${data.previewRowIndex + 1}`
    : 'no data',
  handle: handle.value,
  source: editor.source,
  onGoToData: () => { view.value = 'data' },
}))

const propertyProps = computed(() => ({
  element: element.value,
  schema: schema.value,
  handle: handle.value,
  line: line.value,
}))

const previewProps = computed(() => ({
  document: previewDocument.value,
  sizeMm: meta.value.size,
  rasterSrc: rasterSrc.value,
  caption: caption.value,
  state: previewState.value,
  selectedLoc: element.value?.loc,
  outlines: settings.outlines,
  mode: settings.previewMode,
  'onUpdate:mode': (mode: 'rendered' | 'raster') => { settings.previewMode = mode },
  onSelectNode: ({ start, end }: { start: number; end: number }) => {
    handle.value?.setCaret(start, end)
    editor.caret = start
  },
}))

const statusProps = computed(() => ({
  messages: editor.messages,
  okSummary: `compiled · ${fileStripProps.value.snippetCount} snippets · ${editor.components.length} components`,
  onJump: jumpTo,
}))

// ---------------------------------------------------------------- snippets

/** Extract selection → snippet: the block goes above the main `<template>`, the tag replaces it. */
function extractSnippet({ text, start, end }: { text: string; start: number; end: number }) {
  if (!handle.value) return
  const taken = new Set(editor.components.map((c) => c.name))
  let name = 'part'
  for (let i = 2; taken.has(name); i++) name = `part${i}`
  const at = editor.source.search(/^<template[\s>]/m)
  handle.value.executeEdits([
    { start: end, end, text: '' },
    { start, end, text: `<${name} />` },
    { start: at < 0 ? 0 : at, end: at < 0 ? 0 : at, text: `<snippet name="${name}">\n${text}\n</snippet>\n\n` },
  ])
}

/**
 * Promote a snippet to a library file: in a browser that means handing the user the `.vue`.
 * ponytail: shorthand snippets are not valid SFCs on their own — wrap them first if that bites.
 */
function promote(name: string) {
  const body = new RegExp(`<snippet[^>]*name=["']${name}["'][^>]*>([\\s\\S]*?)</snippet\\s*>`).exec(editor.source)
  if (body) download(`${name}.vue`, body[1].trim())
}

// ---------------------------------------------------------------- picker / manage

const all = computed(() => [...templates.mine, ...bundled])
const nameOf = (id: string | null) => {
  const record = all.value.find((t) => t.id === id)
  return record ? templateName(record) : 'Untitled'
}
const sizeText = (source: string) => {
  const { width, height } = parseMeta(source).meta.size
  return `${width} × ${height}`
}

const thumbnails = ref<Record<string, string>>({})

const manageItems = computed(() =>
  all.value.map((t) => ({
    id: t.id,
    name: templateName(t),
    meta: `${sizeText(t.source)} mm · ${isBundled(t.id) ? 'built-in' : 'mine'}`,
    media: sizeText(t.source),
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
      const result = await runtime().render({ source: t.source, assets: t.assets, rows: [] })
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
  <section class="relative flex h-full min-h-0">
    <!-- ≤1100px: components and variables move into an icon rail with popovers (design §3.8). -->
    <div v-if="narrow" class="flex w-[44px] flex-none flex-col items-center gap-1 border-r border-border py-2">
      <button
        v-for="pane in (['components', 'variables'] as const)" :key="pane" type="button"
        class="grid size-8 place-items-center rounded-[6px] transition-colors duration-120 ease-out"
        :class="rail === pane ? 'bg-accent text-accent-foreground ring-1 ring-inset ring-accent-border' : 'text-muted-foreground hover:bg-muted'"
        :aria-label="pane" :aria-expanded="rail === pane"
        @click="rail = rail === pane ? null : pane"
      >
        <Boxes v-if="pane === 'components'" class="size-4" />
        <Braces v-else class="size-4" />
      </button>
    </div>

    <div
      v-if="rail"
      class="absolute top-2 bottom-2 left-[52px] z-20 flex w-[252px] flex-col overflow-hidden rounded-[10px] border border-border bg-popover shadow-[0_18px_40px_-14px_rgb(0_0_0/.30)]"
    >
      <ComponentsPane v-if="rail === 'components'" v-bind="componentsProps" class="h-full" />
      <VariablesPane v-else v-bind="variablesProps" class="h-full" />
    </div>

    <!-- ≤900px: editor → preview → status, stacked; no splitters, fixed heights (design §3.8). -->
    <div v-if="stacked" class="flex min-w-0 flex-1 flex-col">
      <FileStrip v-bind="fileStripProps" class="flex-none" />
      <div class="min-h-0 flex-1"><SfcEditor v-bind="editorProps" class="h-full" /></div>
      <div class="h-[150px] flex-none border-t border-border"><PropertyEditor v-bind="propertyProps" /></div>
      <div class="h-[240px] flex-none border-t border-border"><PreviewPane v-bind="previewProps" class="h-full" /></div>
      <div class="flex-none border-t border-border"><StatusPane v-bind="statusProps" /></div>
    </div>

    <ResizablePanelGroup v-else direction="horizontal" class="min-w-0 flex-1" @layout="persist('cols')">
      <ResizablePanel v-if="!narrow" :default-size="sizes('cols', [17.5, 53, 29.5])[0]" :min-size="12" :order="1">
        <div ref="leftColumn" class="h-full">
          <ResizablePanelGroup direction="vertical" @layout="persist('left')">
            <ResizablePanel
              :default-size="sizes('left', [55, 45])[0]" :min-size="15"
              collapsible :collapsed-size="collapsedPct"
            >
              <ComponentsPane v-bind="componentsProps" class="h-full overflow-hidden" />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel
              :default-size="sizes('left', [55, 45])[1]" :min-size="15"
              collapsible :collapsed-size="collapsedPct"
            >
              <VariablesPane v-bind="variablesProps" class="h-full overflow-hidden" />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </ResizablePanel>
      <ResizableHandle v-if="!narrow" />

      <ResizablePanel :default-size="sizes('cols', [17.5, 53, 29.5])[1]" :min-size="30" :order="2">
        <div class="flex h-full min-h-0 flex-col border-x border-border">
          <FileStrip v-bind="fileStripProps" class="flex-none" />
          <ResizablePanelGroup direction="vertical" class="min-h-0 flex-1" @layout="persist('centre')">
            <ResizablePanel :default-size="sizes('centre', [80, 20])[0]" :min-size="30">
              <SfcEditor v-bind="editorProps" class="h-full" />
            </ResizablePanel>
            <!-- The one handle the design draws: a 34 × 3px bar, cursor row-resize. -->
            <ResizableHandle with-handle class="cursor-row-resize [&>div]:h-[34px] [&>div]:w-[3px]" />
            <ResizablePanel :default-size="sizes('centre', [80, 20])[1]" :min-size="10">
              <PropertyEditor v-bind="propertyProps" />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </ResizablePanel>
      <ResizableHandle />

      <ResizablePanel :default-size="sizes('cols', [17.5, 53, 29.5])[2]" :min-size="18" :order="3">
        <ResizablePanelGroup direction="vertical" @layout="persist('right')">
          <ResizablePanel :default-size="sizes('right', [68, 32])[0]" :min-size="30">
            <PreviewPane v-bind="previewProps" class="h-full" />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel :default-size="sizes('right', [68, 32])[1]" :min-size="12">
            <StatusPane v-bind="statusProps" class="h-full" />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>

    <!-- Dirty confirm and save-as: inline, because a question is not an error dialog. -->
    <div
      v-if="pendingId || saveAsName !== null"
      class="absolute top-[42px] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-[8px] border border-border bg-popover px-3 py-2 shadow-[0_18px_40px_-14px_rgb(0_0_0/.30)]"
    >
      <template v-if="saveAsName !== null">
        <label class="text-[12px]" for="save-as-name">Save current as</label>
        <input
          id="save-as-name" v-model="saveAsName" autofocus
          class="h-[28px] w-[180px] rounded-[6px] border border-input bg-card px-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @keydown.enter="confirmSaveAs"
        >
        <button type="button" class="h-[28px] rounded-[6px] border border-border px-2 text-[12px] hover:bg-muted" @click="confirmSaveAs">Save</button>
        <button type="button" class="text-[12px] text-muted-foreground hover:text-foreground" @click="saveAsName = null">Cancel</button>
      </template>
      <template v-else>
        <span class="text-[12px]">{{ filename }} has unsaved changes.</span>
        <button type="button" class="h-[28px] rounded-[6px] border border-border px-2 text-[12px] hover:bg-muted" @click="saveAsName = `${nameOf(editor.templateId)} copy`">
          Save as new template…
        </button>
        <button type="button" class="h-[28px] rounded-[6px] border border-border px-2 text-[12px] hover:bg-muted" @click="save().then(confirmDiscard)">Save</button>
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
