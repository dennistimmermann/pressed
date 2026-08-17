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
    snippetCount?: number
    hasMeta?: boolean
    errorCount?: number
    warningCount?: number
    /** When the record was last saved; drives the `⌘S saved` hint. */
    savedAt?: number | null
  }>(),
  { dirty: false, snippetCount: 0, hasMeta: false, errorCount: 0, warningCount: 0, savedAt: null },
)

defineEmits<{ save: []; 'save-as': []; manage: [] }>()

const blocks = computed(() =>
  [props.hasMeta ? 'meta' : null, `${props.snippetCount} snippet${props.snippetCount === 1 ? '' : 's'}`]
    .filter(Boolean)
    .join(' · '),
)

const saveHint = computed(() => (props.dirty ? 'unsaved' : props.savedAt ? 'saved' : ''))
</script>

<template>
  <div class="strip">
    <span class="name">
      {{ filename }}
      <span v-if="dirty" class="dot" aria-label="unsaved changes" />
    </span>

    <button type="button" class="ghost" :disabled="!dirty" @click="$emit('save')">Save</button>
    <button type="button" class="ghost" @click="$emit('save-as')">Save as…</button>
    <button type="button" class="ghost" @click="$emit('manage')">Templates…</button>

    <span class="meta">{{ blocks }}</span>

    <span class="spacer" />

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
  font-size: 11.5px;
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
