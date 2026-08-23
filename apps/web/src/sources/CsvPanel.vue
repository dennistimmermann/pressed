<!-- A file off disk: the first row is the field names (core's `csvSource` does the parsing). -->
<script setup lang="ts">
import { ref } from 'vue'
import { csvSource } from '@pressed/core'
import { Field } from '@/ui'
import { data } from '@/stores/data'
import type { Run } from './index'

const props = defineProps<{ run: Run; busy?: boolean }>()
/** Seeded from what is actually loaded: the panel is remounted every time the source row
    changes, and a fresh `''` under rows that came from a file was the phantom in F7. */
const name = ref(data.sourceId === 'csv' ? data.brief : '')

function onCsv(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // so choosing the same file again is still a change
  if (!file) return
  name.value = file.name
  props.run(async () => csvSource.load(await file.text()), file.name)
}
</script>

<template>
  <Field>
    <span class="min-w-0 flex-1 truncate">{{ name || 'no file chosen' }}</span>
  </Field>
  <div class="flex items-center gap-[8px]">
    <label class="ghost">
      Choose file…
      <input id="csv-file" type="file" accept=".csv,text/csv" :disabled="busy" @change="onCsv">
    </label>
    <span class="note">first row = field names</span>
  </div>
</template>

<style scoped>
/* The ghost: 1px border, no fill — the only filled button in the app is Print (invariant 1).
   A label, not a button: it is what opens the file input without a second click. */
.ghost {
  display: inline-flex; align-items: center; height: 25px; flex: none; padding: 0 9px;
  border: 1px solid var(--field-border); border-radius: var(--radius-control); background: var(--pane);
  font-size: 11px; color: var(--foreground); cursor: pointer;
  transition: background-color 120ms ease-out;
}
.ghost:hover { background: var(--row-hover); }
.ghost input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.note { min-width: 0; font-family: var(--font-mono); font-size: 10px; color: var(--meta-foreground); }
</style>
