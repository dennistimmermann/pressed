<!-- A file off disk: the first row is the field names (core's `csvSource` does the parsing). -->
<script setup lang="ts">
import { ref } from 'vue'
import { csvSource } from '@sprint/core'
import { Field } from '@/ui'
import type { Run } from './index'

const props = defineProps<{ run: Run; busy?: boolean }>()
const name = ref('')

function onCsv(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
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
