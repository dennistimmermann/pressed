<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { DEFAULT_META, labelDocument, SPOOL_ROW_TYPE, type Message, type Meta } from '@sprint/core'
import { librarySources } from '@sprint/core/library/index.ts'
import source0 from '../../../apps/web/src/templates/Spool label.vue?raw'
import FileStrip from '../src/FileStrip.vue'
import PreviewPane from '../src/PreviewPane.vue'
import SfcEditor from '../src/SfcEditor.vue'
import StatusPane from '../src/StatusPane.vue'
import type { EditorHandle } from '../src/editor-handle'
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
      <button type="button" class="ghost" @click="dark = !dark">◐ {{ dark ? 'dark' : 'light' }}</button>
    </header>

    <main class="panes">
      <section class="centre">
        <FileStrip
          :filename="`${meta.name}.vue`"
          :dirty="source !== source0"
          :snippet-count="(source.match(/<snippet[\s>]/g) ?? []).length"
          :has-meta="/<meta[\s>]/.test(source)"
          :error-count="errorCount"
          :warning-count="warningCount"
          :saved-at="Date.now()"
          @open-picker="() => {}"
        />
        <SfcEditor
          v-model="source"
          :context-type="SPOOL_ROW_TYPE"
          :library-components="librarySources"
          :filename="`${meta.name}.vue`"
          @caret="(offset) => (caret = offset)"
          @ready="(h) => (handle = h)"
        />
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
.right {
  display: grid;
  grid-template-rows: minmax(0, 1fr) 220px;
  min-height: 0;
}
.status {
  border-top: 1px solid var(--border);
}
</style>
