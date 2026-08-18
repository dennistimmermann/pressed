<!--
  WP2 harness: the three inspector panes against a textarea that fakes the Monaco side.
  Not shipped — it exists so the panes can be exercised (and screenshotted) without WP1.
-->
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { LIBRARY_NAMES, SPOOL_ROW_TYPE, compileTemplate, componentSchemas } from '@sprint/core'
import ComponentsPane from '../src/ComponentsPane.vue'
import VariablesPane from '../src/VariablesPane.vue'
import PropertyEditor from '../src/PropertyEditor.vue'
import { elementAt } from '../src/ast'
import type { EditorHandle } from '../src/editor-handle'

// A copy of the bundled example, inlined: packages/editor never imports from apps/*.
const TEMPLATE = `<meta>
{ "name": "Spool label", "size": { "width": 60, "height": 40 }, "gap": 2 }
</meta>

<snippet name="temp">
  <script setup lang="ts">
  const props = defineProps<{
    /** What the temperature is for. */
    label: string
    /** Recommended temperature in °C. */
    value?: number
  }>()
  <\/script>
  <template><span class="k">{{ label }}</span> {{ value ?? '—' }} °C</template>
</snippet>

<snippet name="badge" props="text">
  <span class="badge">{{ text }}</span>
</snippet>

<template>
  <div class="title">{{ row.filament?.vendor?.name }} {{ row.filament?.name }}</div>
  <div class="temps">
    <temp label="Nozzle" :value="row.filament?.settings_extruder_temp" />
  </div>
  <badge v-if="(row.remaining_weight ?? 0) < 100" text="almost empty" />
  <QrCode class="qr" :value="\`spool:\${row.id}\`" size="16mm" ecc="M" />
  <img src="asset:logo.svg" width="12mm" />
</template>
`

const ROW = {
  id: 42,
  registered: '2024-11-02T10:00:00Z',
  filament: {
    id: 3,
    name: 'PLA Galaxy Black',
    vendor: { id: 1, name: 'Prusament' },
    material: 'PLA',
    density: 1.24,
    diameter: 1.75,
    settings_extruder_temp: 215,
    settings_bed_temp: 60,
    color_hex: '1a1a1a',
  },
  remaining_weight: 87.4,
  used_weight: 912.6,
  used_length: 306.1,
  location: 'Shelf A',
  archived: false,
}

const source = ref(TEMPLATE)
const offset = ref(TEMPLATE.indexOf('<QrCode') + 3)
const selection = ref<{ start: number; end: number }>()
const textarea = ref<HTMLTextAreaElement>()

/** The whole WP1 seam, faked: offsets in, text edits out. */
const handle: EditorHandle = {
  getValue: () => source.value,
  getOffset: () => offset.value,
  setCaret(start, end = start) {
    offset.value = start
    nextTick(() => textarea.value?.setSelectionRange(start, end))
  },
  getSelection: () => ({ start: textarea.value?.selectionStart ?? 0, end: textarea.value?.selectionEnd ?? 0 }),
  revealOffset: () => {},
  executeEdits(edits) {
    let text = source.value
    for (const edit of [...edits].sort((a, b) => b.start - a.start))
      text = text.slice(0, edit.start) + edit.text + text.slice(edit.end)
    source.value = text
  },
  onCaretChange: () => () => {},
  focus: () => textarea.value?.focus(),
}

function syncCaret() {
  const el = textarea.value
  if (!el) return
  offset.value = el.selectionStart
  selection.value = el.selectionEnd > el.selectionStart ? { start: el.selectionStart, end: el.selectionEnd } : undefined
}

const schemas = computed(() => {
  try {
    return componentSchemas(compileTemplate(source.value))
  } catch {
    return []
  }
})
const library = computed(() => schemas.value.filter((s) => LIBRARY_NAMES.includes(s.name)))
const snippets = computed(() => schemas.value.filter((s) => !LIBRARY_NAMES.includes(s.name)))

const element = computed(() => elementAt(source.value, offset.value))
const schema = computed(() => schemas.value.find((s) => s.name === element.value?.tag) ?? null)
const line = computed(() => source.value.slice(0, offset.value).split('\n').length)
</script>

<template>
  <div class="grid h-screen grid-cols-[252px_1fr] gap-px overflow-hidden bg-border">
    <div class="grid min-h-0 grid-rows-[55%_45%] gap-px bg-border">
      <ComponentsPane
        :library="library"
        :snippets="snippets"
        :handle="handle"
        :selected-name="element?.tag"
        :selection="selection"
        @extract-snippet="(s) => console.log('extract-snippet', s)"
        @promote="(n) => console.log('promote', n)"
      />
      <VariablesPane
        :row-type="SPOOL_ROW_TYPE"
        :row="ROW"
        row-label="Spool · row 1"
        :handle="handle"
        :source="source"
        @go-to-data="() => console.log('go-to-data')"
      />
    </div>

    <div class="grid min-h-0 min-w-0 grid-rows-[1fr_190px] gap-px bg-border">
      <textarea
        ref="textarea"
        v-model="source"
        spellcheck="false"
        aria-label="template source"
        class="h-full w-full resize-none bg-card p-3 font-mono text-[11.5px] leading-[1.72] outline-none"
        @click="syncCaret"
        @keyup="syncCaret"
        @select="syncCaret"
        @input="syncCaret"
      />
      <PropertyEditor :element="element" :schema="schema" :handle="handle" :line="line" />
    </div>
  </div>
</template>
