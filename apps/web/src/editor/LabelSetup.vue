<!-- The `<meta>` form (design README-tabs §6). Meta is not a tab: it is context for every
     other block, so it lives in a 392px popover off the file strip. Owns no state — every
     change is emitted as a patch and comes back through `meta`. -->
<script setup lang="ts">
import type { Meta } from './types'

defineProps<{
  meta: Meta
  open: boolean
}>()

const emit = defineEmits<{ update: [patch: Partial<Meta>]; close: [] }>()

const text = (event: Event) => (event.target as HTMLInputElement).value
/** An empty number field means "not set", not 0 — `margin` is optional. */
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
        <span class="key">width<i class="u">mm</i></span>
        <input type="number" step="0.1" :value="meta.size.width" @change="emit('update', { size: { ...meta.size, width: num($event) ?? 0 } })" />
      </label>
      <label class="field">
        <span class="key">height<i class="u">mm</i></span>
        <input type="number" step="0.1" :value="meta.size.height" @change="emit('update', { size: { ...meta.size, height: num($event) ?? 0 } })" />
      </label>
      <label class="field">
        <span class="key">margin<i class="u">mm</i></span>
        <input type="number" step="0.1" placeholder="0" :value="meta.margin ?? ''" @change="emit('update', { margin: num($event) })" />
      </label>
    </div>

    <label class="field">
      <span class="key">description</span>
      <textarea
        :value="meta.description ?? ''"
        class="sans"
        placeholder="what this label is for"
        @change="emit('update', { description: text($event) || undefined })"
      />
    </label>

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
/* One convention for every field: the word in sans, its unit faint and mono on the right —
   a measurement is never set in sans (invariant 2, F23). */
.key {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 10.5px;
  font-weight: 500;
  color: var(--muted-foreground-2);
}
.key .u {
  margin-left: auto;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  font-style: normal;
  color: var(--faint-foreground);
}
input,
textarea {
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
textarea.sans {
  font-family: var(--font-sans, system-ui, sans-serif);
}
/* Chrome-first: the box is as tall as what is in it, one line to start. */
textarea {
  height: auto;
  min-height: 29px;
  field-sizing: content;
  padding: 7px 9px;
  line-height: 1.4;
  resize: none;
}

/* Placeholders are always faint grey, never a live-looking value (F26). */
input::placeholder,
textarea::placeholder {
  color: var(--faint-foreground);
}

input:focus-visible,
textarea:focus-visible {
  outline: none;
  border-color: var(--primary);
  background: var(--pane);
}
</style>
