<!--
  Layout only: [ header / editor + bottom pane ] | [ preview / status ]. Components, variables
  and attributes live in the tabbed pane under the editor (EditorCentre); no left column.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import { LIBRARY_NAMES } from '@sprint/core'
import { parseMeta } from '@sprint/core/template/meta.ts'
import { ManageTemplates, PreviewPane, StatusPane } from '@sprint/editor'
import { buildTree, type VarNode } from '@sprint/editor/inspector/row-tree.ts'
import EditorCentre from '@/components/EditorCentre.vue'
import EditorHeader from '@/components/EditorHeader.vue'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { K30F } from '@/printers'
import { rasterDataUrl } from '@/raster'
import { data, previewRow } from '@/stores/data'
import {
  cycleTab, dirty, editor, element, enterScope, filename, formatBlock, goToOffset, jumpTo, leaveScope,
  load, meta, previewDocument, previewState, save, saveAs, switchTab, tabs,
} from '@/stores/editor'
import { settings } from '@/stores/settings'
import {
  bundled, deleteTemplate, duplicateTemplate, exportTemplate, importTemplates, isBundled,
  newTemplate, renameTemplate, templateName, templates,
} from '@/stores/templates'

// Design §3.8: below 900 everything stacks.
const stacked = useMediaQuery('(max-width: 900px)')

// Splitter layouts are percentages; the store keeps one array per group (design §3).
const sizes = (key: string, fallback: number[]) => settings.paneSizes[key] ?? fallback
const persist = (key: string) => (layout: number[]) => { settings.paneSizes[key] = layout }
const outer = computed(() => sizes('outer', [70.5, 29.5])) // [work area | preview+status]

// ---------------------------------------------------------------- keyboard (README-tabs §3)
// Physical keys (`e.code`), because ⌥ rewrites `e.key` on macOS. Capture phase: Monaco eats
// ⌥⇧← for its own selection command before a bubbling listener would ever see it.

useEventListener('keydown', (e: KeyboardEvent) => {
  if (!e.altKey) return
  const act = (run: () => void) => { e.preventDefault(); run() }
  if (e.metaKey || e.ctrlKey) {
    if (e.code === 'BracketRight') act(() => cycleTab(1))
    else if (e.code === 'BracketLeft') act(() => cycleTab(-1))
    return
  }
  if (e.shiftKey && e.code === 'ArrowLeft') return act(leaveScope)
  if (e.shiftKey && e.code === 'KeyF') return act(() => { void formatBlock() })
  const digit = /^Digit([1-9])$/.exec(e.code)
  if (!digit) return
  const n = Number(digit[1])
  if (n <= 3) {
    // The blocks of whatever scope we are in, in strip order.
    const scope = editor.activeTab.scope
    const blocks = scope === null ? tabs.value.blocks : tabs.value.snippets.find((s) => s.name === scope)?.blocks ?? []
    const block = blocks[n - 1]
    if (block) act(() => switchTab({ scope, kind: block.kind }))
  } else {
    const snippet = tabs.value.snippets[n - 4]
    if (snippet) act(() => enterScope(snippet.name))
  }
}, { capture: true })

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

/** What the editor's `+ component` popup offers. */
const componentsProps = computed(() => ({
  library: editor.components.filter((c) => LIBRARY_NAMES.includes(c.name)),
  snippets: editor.components.filter((c) => !LIBRARY_NAMES.includes(c.name)),
}))

/** Flat `row.*` leaves — or, inside a snippet, its props (declared types as hints) — for the `+ variable` popup. */
const insertVariables = computed(() => {
  if (propsOf.value) return propsOf.value.props.map((p) => ({ path: p.name, hint: p.value }))
  const out: { path: string; hint: string }[] = []
  const walk = (nodes: VarNode[]) => { for (const n of nodes) n.kind === 'leaf' ? out.push({ path: n.path, hint: n.value }) : walk(n.children) }
  walk(buildTree(data.rowType, previewRow.value))
  return out
})

const propsOf = computed(() => {
  const scope = editor.activeTab.scope
  if (scope === null) return undefined
  const schema = editor.components.find((c) => c.name === scope)
  return {
    name: scope,
    props: (schema?.props ?? []).map((p) => ({ name: p.name, value: `${p.type}${p.required ? '' : '?'}` })),
  }
})

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
  // Clicking an element enters the tab that owns it — the snippet's, if that is where it lives.
  onSelectNode: ({ start, end }: { start: number; end: number }) => goToOffset(start, end),
}))

const statusProps = computed(() => ({
  messages: editor.messages,
  okSummary: `compiled · ${tabs.value.snippets.length} snippets · ${editor.components.length} components`,
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
    <!-- ≤900px: editor → preview → status, stacked; no column splitters (design §3.8). -->
    <div v-if="stacked" class="flex min-w-0 flex-1 flex-col">
      <EditorHeader narrow @save-as="saveAsName = `${nameOf(editor.templateId)} copy`" />
      <EditorCentre class="min-h-0 flex-1" :insert-components="componentsProps" :insert-variables="insertVariables" />
      <div class="h-[240px] flex-none border-t border-border"><PreviewPane v-bind="previewProps" class="h-full" /></div>
      <div class="flex-none border-t border-border"><StatusPane v-bind="statusProps" /></div>
    </div>

    <!-- Wide: file strip + tabs over the editor and its bottom pane; preview and status full height. -->
    <ResizablePanelGroup v-else direction="horizontal" class="min-w-0 flex-1" @layout="persist('outer')">
      <ResizablePanel :default-size="outer[0]" :min-size="40" :order="1">
        <div class="flex h-full min-h-0 flex-col">
          <EditorHeader @save-as="saveAsName = `${nameOf(editor.templateId)} copy`" />
          <EditorCentre class="min-h-0 flex-1" :insert-components="componentsProps" :insert-variables="insertVariables" />
        </div>
      </ResizablePanel>
      <ResizableHandle />

      <ResizablePanel :default-size="outer[1]" :min-size="18" :order="2">
        <ResizablePanelGroup direction="vertical" class="border-l border-border" @layout="persist('right')">
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
