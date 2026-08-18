<script setup lang="ts">
import { computed } from 'vue'

/**
 * The 38px file strip above the editor (design §3.3): exactly one file, Save / Save as / Templates.
 * Everything is `flex: none; white-space: nowrap` and nothing here owns state.
 */
const props = withDefaults(
  defineProps<{
    filename: string
    dirty?: boolean
    /** Read-only label geometry from `<meta>`, e.g. `60 × 40 · gap 2` (README-tabs §2). */
    sizeText?: string
    errorCount?: number
    warningCount?: number
    /** When the record was last saved; drives the `⌘S saved` hint. */
    savedAt?: number | null
  }>(),
  { dirty: false, sizeText: '', errorCount: 0, warningCount: 0, savedAt: null },
)

defineEmits<{ save: []; 'save-as': []; manage: []; 'label-setup': []; format: [] }>()

const saveHint = computed(() => (props.dirty ? 'unsaved' : props.savedAt ? 'saved' : ''))
</script>

<template>
  <div class="strip">
    <span class="name">
      {{ filename }}
      <span v-if="dirty" class="dot" aria-label="unsaved changes" />
    </span>

    <button type="button" class="ghost" :disabled="!dirty" @click="$emit('save')">Save</button>
    <button type="button" class="text" @click="$emit('save-as')">Save as…</button>
    <button type="button" class="text" @click="$emit('manage')">Templates…</button>

    <span class="divider" />
    <span class="size">{{ sizeText }}</span>
    <button type="button" class="text primary" @click="$emit('label-setup')">Label setup…</button>

    <span class="spacer" />

    <button type="button" class="text" title="format the current block (⇧⌥F)" @click="$emit('format')">Format</button>
    <span v-if="errorCount" class="chip error">● {{ errorCount }} error{{ errorCount === 1 ? '' : 's' }}</span>
    <span v-if="warningCount" class="chip warning">● {{ warningCount }} warning{{ warningCount === 1 ? '' : 's' }}</span>
    <span class="meta save"><kbd>⌘S</kbd> {{ saveHint }}</span>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
  overflow: hidden;
}
.strip > * {
  flex: none;
  white-space: nowrap;
}
.spacer {
  flex: 1 1 auto;
}

.name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-weight: 500;
  font-size: 12px;
  color: var(--foreground);
  border-bottom: 2px solid var(--primary);
  padding-bottom: 2px;
}
.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--primary);
}

/* The one filled button in the app is Print — everything here is a 1px ghost. */
.ghost {
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 11px;
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.ghost:hover:not(:disabled) {
  background: var(--muted);
  color: var(--foreground);
}
.ghost:disabled {
  opacity: 0.5;
}

/* Save as… / Templates… are plain text; only Save keeps a border (README-tabs §2). */
.text {
  border: 0;
  background: none;
  padding: 0;
  font-size: 11px;
  color: var(--muted-foreground);
  transition: color 120ms ease-out;
}
.text:hover {
  color: var(--foreground);
}
.text.primary {
  color: var(--primary);
}

.divider {
  width: 1px;
  height: 18px;
  background: var(--border);
}
/* Geometry is a measurement: mono, always. Read-only — edited in Label setup…. */
.size {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px;
  color: oklch(0.45 0.01 60);
}

.meta {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px;
  color: var(--muted-foreground);
}
.save kbd {
  font: inherit;
}

.chip {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px;
}
.error {
  color: var(--destructive);
}
.warning {
  color: var(--warning);
}
</style>
