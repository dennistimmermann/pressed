<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { DEFAULT_META, labelDocument, SPOOL_ROW_TYPE, type Message, type Meta } from '@sprint/core'
import { librarySources } from '@sprint/core/library/index.ts'
import source0 from '../../../apps/web/src/templates/Spool label.vue?raw'
import AlignmentPlaceholder from '../src/AlignmentPlaceholder.vue'
import BlockTabs from '../src/BlockTabs.vue'
import FileStrip from '../src/FileStrip.vue'
import LabelSetup from '../src/LabelSetup.vue'
import PreviewPane from '../src/PreviewPane.vue'
import SfcEditor from '../src/SfcEditor.vue'
import StatusPane from '../src/StatusPane.vue'
import type { EditorHandle } from '../src/editor-handle'
import { blockOf, insertBlock, tabsModel, type TabRef } from '../src/tabs'
import { createRuntimeClient, debounce, RenderSuperseded, type RuntimeClient } from '../src/runtime-client'
import { editor as monacoEditor } from 'monaco-editor-core'

// Harness only: lets a browser session read Monaco's markers while checking Volar.
Object.assign(window, { monacoEditor })

/** One realistic Spoolman record, so `row.` completion and the render have something real. */
const row = {
  id: 7,
  registered: '2026-01-04T10:00:00Z',
  filament: {
    id: 3,
    name: 'Galaxy Black',
    vendor: { id: 1, name: 'Prusament' },
    material: 'PETG',
    density: 1.27,
    diameter: 1.75,
    settings_extruder_temp: 240,
    settings_bed_temp: 90,
  },
  remaining_weight: 82.4,
  used_weight: 917.6,
  used_length: 300,
  archived: false,
}

const source = ref(source0)
const messages = ref<Message[]>([])
const meta = ref<Meta>(DEFAULT_META)
const label = shallowRef<{ html: string; css: string } | null>(null)
const took = ref(0)
const handle = shallowRef<EditorHandle>()
const caret = ref(0)
const selectedLoc = ref<{ start: number; end: number } | null>(null)
const mode = ref<'rendered' | 'raster'>('rendered')
const dark = ref(false)

let client: RuntimeClient | undefined

async function render() {
  const started = performance.now()
  try {
    const result = await client!.render({ source: source.value, rows: [row], inspector: true })
    took.value = Math.round(performance.now() - started)
    messages.value = result.errors
    meta.value = result.meta
    if (result.html.length) label.value = { html: result.html[0], css: result.css }
  } catch (e) {
    if (!(e instanceof RenderSuperseded)) throw e
  }
}

const renderSoon = debounce(render, 150)

onMounted(() => {
  client = createRuntimeClient('/runtime.html')
  render()
})
onBeforeUnmount(() => client?.destroy())

watch(source, renderSoon)
watch(dark, (on) => document.documentElement.classList.toggle('dark', on))

const previewDocument = computed(() => (label.value ? labelDocument(label.value, meta.value.size) : null))
const errorCount = computed(() => messages.value.filter((m) => m.kind !== 'purity').length)
const warningCount = computed(() => messages.value.filter((m) => m.kind === 'purity').length)
const previewState = computed(() => (errorCount.value ? ('error' as const) : ('ok' as const)))

// ---------------------------------------------------------------- tabs (README-tabs)

const model = computed(() => tabsModel(source.value))
const scope = ref<string | null>(null)
const active = ref<TabRef>({ scope: null, kind: 'template' })
const setupOpen = ref(false)
const narrow = ref(false)

const block = computed(() => blockOf(model.value, active.value))
const visible = computed(() => block.value?.lines ?? null)

/** Harness: two fake badges, so the strip's error/warning treatments are visible. */
const badges = { style: { level: 'warning' as const, count: 1 }, 'temp/script': { level: 'error' as const, count: 2 } }

const EMPTY: Record<string, { title: string; body: string }> = {
  template: { title: 'Nothing here yet', body: 'The markup of this label. Components from the left pane insert here, and `{{ row.x }}` reads the current row.' },
  style: { title: 'Nothing here yet', body: 'Rules you write here apply to this label only. Class names come from the template — `.title`, `.qr` — and `mm` is a real millimetre.' },
  script: { title: 'Nothing here yet', body: 'TypeScript that runs once per row, before the markup. Compute here what the template should only read.' },
}
const emptyText = computed(() => (block.value?.empty ? EMPTY[block.value.kind] : null))

function select(tab: TabRef) {
  active.value = tab
  handle.value?.setCaret(blockOf(model.value, tab)?.contentStart ?? 0)
}

function enterScope(name: string) {
  scope.value = name
  select({ scope: name, kind: 'template' })
}

function add(kind: 'script' | 'style' | 'snippet', name?: string) {
  const edit = insertBlock(source.value, model.value, kind, name, kind === 'snippet' ? null : scope.value)
  handle.value?.executeEdits([edit])
  // The model is rebuilt from the new text on the next tick; the new tab opens focused.
  setTimeout(() => (kind === 'snippet' ? enterScope(name ?? 'new') : select({ scope: scope.value, kind })))
}

/** `file:line:col` → caret offset. Only the main file maps directly; snippets live in it too. */
function jump({ line, col }: { line?: number; col?: number }) {
  if (!line) return
  const lines = source.value.split('\n')
  const offset = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0) + Math.max(0, (col ?? 1) - 1)
  handle.value?.setCaret(offset)
}
</script>

<template>
  <div class="app">
    <header class="bar">
      <span class="brand">sprint <em>· editor harness</em></span>
      <span class="grow" />
      <span class="mono">{{ meta.size.width }} × {{ meta.size.height }} · gap {{ meta.gap ?? 0 }}</span>
      <span class="mono">caret {{ caret }}</span>
      <button type="button" class="ghost" @click="narrow = !narrow">{{ narrow ? '≤900px' : 'wide' }}</button>
      <button type="button" class="ghost" @click="dark = !dark">◐ {{ dark ? 'dark' : 'light' }}</button>
    </header>

    <main class="panes">
      <section class="centre">
        <FileStrip
          :filename="`${meta.name}.vue`"
          :dirty="source !== source0"
          :size-text="`${meta.size.width} × ${meta.size.height} · gap ${meta.gap ?? 0}`"
          :error-count="errorCount"
          :warning-count="warningCount"
          :saved-at="Date.now()"
          @label-setup="setupOpen = !setupOpen"
        />
        <LabelSetup class="setup" :meta="meta" :open="setupOpen" :printers="[{ id: 'K30F', label: 'Phomemo K30F' }]" @close="setupOpen = false" />
        <BlockTabs
          :model="model"
          :active="active"
          :scope="scope"
          :badges="badges"
          :narrow="narrow"
          @select="select"
          @enter-scope="enterScope"
          @leave-scope="((scope = null), select({ scope: null, kind: 'template' }))"
          @add="add"
        />
        <SfcEditor
          v-model="source"
          class="editor"
          :context-type="SPOOL_ROW_TYPE"
          :library-components="librarySources"
          :filename="`${meta.name}.vue`"
          :visible="visible"
          :empty-text="emptyText"
          @caret="(offset) => (caret = offset)"
          @ready="(h) => (handle = h)"
        />
        <AlignmentPlaceholder v-if="active.kind === 'style'" href="https://example.invalid/feedback" />
      </section>

      <section class="right">
        <PreviewPane
          v-model:mode="mode"
          class="preview"
          :document="previewDocument"
          :size-mm="meta.size"
          :caption="`${meta.size.width} × ${meta.size.height} mm · click an element to jump to its source`"
          subtitle="row 1 of 1 · picked in Data"
          :state="previewState"
          :selected-loc="selectedLoc"
          @select-node="
            (loc) => {
              selectedLoc = loc
              handle?.setCaret(loc.start, loc.end)
            }
          "
        />
        <StatusPane
          class="status"
          :messages="messages"
          :ok-summary="`compiled · ${(source.match(/<snippet[\s>]/g) ?? []).length} snippets · ${took} ms`"
          :filename="`${meta.name}.vue`"
          @jump="jump"
        />
      </section>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 52px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
}
.brand {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 16px;
  letter-spacing: -0.02em;
}
.brand em {
  font-weight: 400;
  font-size: 11px;
  font-style: normal;
  color: var(--muted-foreground);
}
.grow {
  flex: 1;
}
.mono {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--muted-foreground);
}
.ghost {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: transparent;
  color: var(--foreground);
  font-size: 12px;
}

.panes {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 424px;
  grid-template-rows: minmax(0, 1fr);
}
.centre {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--border);
}
.editor {
  flex: 1;
  min-height: 0;
}
.setup {
  align-self: flex-start;
  margin: 6px 10px 0;
}
.right {
  display: grid;
  grid-template-rows: minmax(0, 1fr) 220px;
  min-height: 0;
}
.status {
  border-top: 1px solid var(--border);
}
</style>
