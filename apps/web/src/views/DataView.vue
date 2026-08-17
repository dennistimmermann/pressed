<!--
  Minimal Data view: pick a source, load rows, choose which ones print. No design spec for
  this view yet (docs/design/README §0) — tokens, density and the mono/sans split only.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { csvSource, noneSource, spoolmanSource } from '@sprint/core'
import { data, rowTitle, selectAll, setRows, toggleSelected } from '@/stores/data'
import { settings } from '@/stores/settings'

const SOURCES = [
  { id: 'csv', label: 'CSV' },
  { id: 'spoolman', label: 'Spoolman' },
  { id: 'none', label: 'None' },
] as const

const tab = ref<(typeof SOURCES)[number]['id']>(data.sourceId)
const copies = ref(1)
const status = ref('')
const error = ref('')
const busy = ref(false)

const allSelected = computed(() => data.rows.length > 0 && data.selected.size === data.rows.length)

/** Every loader ends the same way: rows in, everything selected, status line updated. */
async function run(id: (typeof SOURCES)[number]['id'], load: () => Promise<{ rows: typeof data.rows; rowType: string }>) {
  busy.value = true
  error.value = ''
  status.value = 'loading…'
  try {
    const { rows, rowType } = await load()
    setRows(id, rows, rowType)
    status.value = `${rows.length} rows`
  } catch (e) {
    status.value = ''
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function onCsv(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) void run('csv', async () => csvSource.load(await file.text()))
}
</script>

<template>
  <section class="flex h-full min-h-0">
    <div class="flex w-[340px] flex-none flex-col gap-3 border-r border-border p-3">
      <p class="eyebrow">Data source</p>

      <nav class="flex items-center gap-[3px] rounded-[9px] border border-border bg-muted p-[3px]" aria-label="Data sources">
        <button
          v-for="source in SOURCES" :key="source.id" type="button"
          class="flex-1 rounded-[7px] px-2.5 py-1.5 text-[12px] transition-colors duration-120 ease-out"
          :class="tab === source.id ? 'bg-card font-semibold shadow-[0_1px_2px_rgb(0_0_0/.07)]' : 'text-muted-foreground hover:text-foreground'"
          @click="tab = source.id"
        >
          {{ source.label }}
        </button>
      </nav>

      <div v-if="tab === 'csv'" class="flex flex-col gap-2">
        <label class="text-[12px]" for="csv-file">CSV file — the first row is the field names</label>
        <input
          id="csv-file" type="file" accept=".csv,text/csv"
          class="text-[12px] file:mr-2 file:h-[30px] file:rounded-[6px] file:border file:border-border file:bg-card file:px-2.5 file:text-[12px]"
          @change="onCsv"
        >
      </div>

      <div v-else-if="tab === 'spoolman'" class="flex flex-col gap-2">
        <label class="text-[12px]" for="spoolman-url">Spoolman base URL</label>
        <input
          id="spoolman-url" v-model="settings.spoolmanUrl" type="url" spellcheck="false"
          class="h-[30px] rounded-[6px] border border-input bg-card px-2 font-mono text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
        <button
          type="button" :disabled="busy"
          class="h-8 w-fit rounded-[6px] border border-border px-2.5 text-[12px] hover:bg-muted disabled:opacity-50"
          @click="run('spoolman', () => spoolmanSource.load(settings.spoolmanUrl))"
        >
          Load spools
        </button>
      </div>

      <div v-else class="flex flex-col gap-2">
        <label class="text-[12px]" for="copies">Copies — rows are <span class="font-mono">{{ '{ n }' }}</span></label>
        <input
          id="copies" v-model.number="copies" type="number" min="1" step="1"
          class="h-[30px] w-[104px] rounded-[6px] border border-input bg-card px-2 font-mono text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
        <button
          type="button" class="h-8 w-fit rounded-[6px] border border-border px-2.5 text-[12px] hover:bg-muted"
          @click="run('none', () => noneSource.load(copies))"
        >
          Use {{ copies }} copies
        </button>
      </div>

      <p v-if="status" class="font-mono text-[10.5px] text-muted-foreground">{{ status }}</p>
      <!-- Inline, never a toast (invariant 5). -->
      <p v-if="error" class="font-mono text-[10.5px] text-destructive">{{ error }}</p>

      <span class="flex-1" />
      <p class="font-mono text-[10px] leading-relaxed text-muted-foreground">row type<br>{{ data.rowType.slice(0, 400) }}</p>
    </div>

    <div class="flex min-h-0 flex-1 flex-col">
      <header class="flex h-[34px] flex-none items-center gap-2 border-b border-border px-3">
        <input
          id="select-all" type="checkbox" class="accent-[var(--primary)]"
          :checked="allSelected" :disabled="!data.rows.length" @change="selectAll(!allSelected)"
        >
        <label for="select-all" class="text-[12px]">Select all</label>
        <span class="flex-1" />
        <span class="font-mono text-[10.5px] text-muted-foreground">{{ data.selected.size }} / {{ data.rows.length }} selected</span>
      </header>

      <ul v-if="data.rows.length" class="min-h-0 flex-1 overflow-y-auto p-1">
        <li
          v-for="(row, index) in data.rows" :key="index"
          class="flex items-center gap-2 rounded-[6px] px-2 py-1 transition-colors duration-120 ease-out"
          :class="index === data.previewRowIndex ? 'bg-accent ring-1 ring-inset ring-accent-border' : 'hover:bg-muted'"
        >
          <input
            :id="`row-${index}`" type="checkbox" class="accent-[var(--primary)]"
            :checked="data.selected.has(index)" @change="toggleSelected(index)"
          >
          <label :for="`row-${index}`" class="sr-only">Print row {{ index + 1 }}</label>
          <button type="button" class="min-w-0 flex-1 truncate text-left text-[12.5px]" @click="data.previewRowIndex = index">
            {{ rowTitle(row, index) }}
          </button>
          <span class="font-mono text-[10px] text-muted-foreground">{{ index + 1 }}</span>
        </li>
      </ul>
      <p v-else class="grid flex-1 place-items-center text-[13px] text-muted-foreground">Load data to start</p>
    </div>
  </section>
</template>
