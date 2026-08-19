<!-- The `<meta>` form (design README-tabs §6). Meta is not a tab: it is context for every
     other block, so it lives in a 392px popover off the file strip. Owns no state — every
     change is emitted as a patch and comes back through `meta`. -->
<script setup lang="ts">
import { computed } from 'vue'
import type { Meta } from './types'

const props = defineProps<{
  meta: Meta
  open: boolean
  /** Choices for the printer select; `Any` is always the first option. A bare id is its own label. */
  printers?: (string | { id: string; label: string })[]
}>()

const options = computed(() => (props.printers ?? []).map((p) => (typeof p === 'string' ? { id: p, label: p } : p)))

const emit = defineEmits<{ update: [patch: Partial<Meta>]; close: [] }>()

const text = (event: Event) => (event.target as HTMLInputElement).value
/** An empty number field means "not set", not 0 — `gap` is optional. */
const num = (event: Event) => {
  const value = (event.target as HTMLInputElement).value.trim()
  return value === '' ? undefined : Number(value)
}
</script>

<template>
  <!-- Positioned by the host; this is only the panel. -->
  <div v-if="open" class="panel" role="dialog" aria-label="Label setup" @keydown.esc="emit('close')">
    <div class="head">
      <span class="eyebrow">Label setup</span>
    </div>

    <label class="field">
      <span class="key">name</span>
      <input type="text" :value="meta.name" class="sans" @change="emit('update', { name: text($event) })" />
    </label>

    <div class="row">
      <label class="field">
        <span class="key">width mm</span>
        <input type="number" step="0.1" :value="meta.size.width" @change="emit('update', { size: { ...meta.size, width: num($event) ?? 0 } })" />
      </label>
      <label class="field">
        <span class="key">height mm</span>
        <input type="number" step="0.1" :value="meta.size.height" @change="emit('update', { size: { ...meta.size, height: num($event) ?? 0 } })" />
      </label>
      <label class="field">
        <span class="key">gap mm</span>
        <input type="number" step="0.1" :value="meta.gap ?? ''" @change="emit('update', { gap: num($event) })" />
      </label>
    </div>

    <label class="field">
      <span class="key">description</span>
      <textarea
        :value="meta.description ?? ''"
        class="sans"
        placeholder="What this label is for — shown in Templates…"
        @change="emit('update', { description: text($event) || undefined })"
      />
    </label>

    <label class="field">
      <span class="key">printer <em>optional</em></span>
      <select :value="meta.printer ?? ''" class="sans" @change="emit('update', { printer: text($event) || undefined })">
        <option value="">Any</option>
        <option v-for="p in options" :key="p.id" :value="p.id">{{ p.label }}</option>
      </select>
    </label>

    <div class="foot">writes &lt;meta&gt;</div>
  </div>
</template>

<style scoped>
.panel {
  width: 392px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 11px 12px 12px;
  border: 1px solid var(--field-border);
  border-radius: var(--radius-trough);
  background: var(--popover);
  box-shadow: var(--shadow-popover);
}
.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.eyebrow {
  flex: 1;
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--muted-foreground-2);
}

.row {
  display: flex;
  gap: 8px;
}
.row .field {
  flex: 1 1 0;
  min-width: 0;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.key {
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 10.5px;
  font-weight: 500;
  color: var(--muted-foreground-2);
}
.key em {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 9.5px;
  font-style: normal;
}

input,
textarea,
select {
  width: 100%;
  box-sizing: border-box;
  height: 29px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: var(--field);
  color: var(--foreground);
  /* Measurements are machine text — mono, always (design §1). */
  font: 450 11.5px var(--font-mono, ui-monospace, monospace);
}
input.sans,
textarea.sans,
select.sans {
  font-family: var(--font-sans, system-ui, sans-serif);
}
textarea {
  height: 44px;
  padding: 7px 9px;
  line-height: 1.4;
  resize: none;
}

input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: none;
  border-color: var(--primary);
  background: var(--pane);
}

.foot {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  color: var(--meta-foreground);
}
</style>
