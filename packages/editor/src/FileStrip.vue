<script setup lang="ts">
import { computed } from 'vue'
import type { EditorMode } from './types'

/**
 * The 36px file row above the editor (SPEC §2): Save / Save as / Templates, the label geometry,
 * and on the right the mode toggle. The file *name* lives in the scope row's file tab, and
 * `Format` in the editor pane header — both belong to what they name. Nothing here owns state.
 */
const props = withDefaults(
  defineProps<{
    /** Blocks · Split · Code (SPEC §4.1). Omitted at ≤900px, where there is no toggle. */
    mode?: EditorMode | null
    /** Which modes the toggle offers; ≤900px drops `split` (SPEC §3 E12). */
    modes?: EditorMode[]
    /** Split only: the canvas sits beside the editor rather than above it. */
    sideBySide?: boolean
    dirty?: boolean
    /** Read-only label geometry from `<meta>`, e.g. `60 × 40 · gap 2` (README-tabs §2). */
    sizeText?: string
    errorCount?: number
    warningCount?: number
    /** When the record was last saved; drives the `⌘S saved` hint. */
    savedAt?: number | null
  }>(),
  { mode: null, modes: () => ['blocks', 'split', 'code'], sideBySide: false, dirty: false, sizeText: '', errorCount: 0, warningCount: 0, savedAt: null },
)

defineEmits<{
  save: []; 'save-as': []; manage: []; 'label-setup': []
  'update:mode': [mode: EditorMode]; flip: []
}>()

const LABELS: Record<EditorMode, string> = { blocks: 'Blocks', split: 'Split', code: 'Code' }
const shown = computed(() => props.modes.map((id) => ({ id, label: LABELS[id] })))

const saveHint = computed(() => (props.dirty ? 'unsaved' : props.savedAt ? 'saved' : ''))
</script>

<template>
  <div class="strip">
    <button type="button" class="ghost" :disabled="!dirty" @click="$emit('save')">Save</button>
    <button type="button" class="text" @click="$emit('save-as')">Save as…</button>
    <button type="button" class="text" @click="$emit('manage')">Templates…</button>

    <span class="divider" />
    <span class="size">{{ sizeText }}</span>
    <button type="button" class="text primary" @click="$emit('label-setup')">Label setup…</button>

    <span class="spacer" />

    <div v-if="mode" class="trough" role="tablist" aria-label="mode">
      <button
        v-for="m in shown" :key="m.id" type="button" role="tab" :aria-selected="mode === m.id"
        class="mode" :class="{ on: mode === m.id }" @click="$emit('update:mode', m.id)"
      >{{ m.label }}</button>
    </div>
    <span v-if="mode" class="meta">⌘⇧M</span>
    <!-- Flips the split; only Split has one to flip (SPEC §2). -->
    <button
      v-if="mode === 'split'" type="button" class="flip" :class="{ on: sideBySide }"
      title="canvas beside the editor" aria-label="flip the split" @click="$emit('flip')"
    >⇄</button>

    <span v-if="errorCount" class="chip error">● {{ errorCount }} error{{ errorCount === 1 ? '' : 's' }}</span>
    <span v-if="warningCount" class="chip warning">● {{ warningCount }} warning{{ warningCount === 1 ? '' : 's' }}</span>
    <span class="meta save"><kbd>⌘S</kbd> {{ saveHint }}</span>
  </div>
</template>

<style scoped>
/* Level 0 chrome, one step lighter than the top bar (VISUAL-SPEC §2). The host adds
   `.on-ink`, which re-points the text and line tokens every rule below reads. */
.strip {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 10px;
  background: var(--ink-2);
  border-bottom: 1px solid var(--ink-border-2);
  overflow: hidden;
}
.strip > * {
  flex: none;
  white-space: nowrap;
}
.spacer {
  flex: 1 1 auto;
}

/* The one filled button in the app is Print — everything here is a 1px ghost. */
.ghost {
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--ink-control-border);
  border-radius: var(--radius-button);
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
  color: var(--accent-link);
}

.divider {
  width: 1px;
  height: 16px;
  background: var(--ink-divider);
}
/* Geometry is a measurement: mono, always. Read-only — edited in Label setup…. */
.size {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px;
  color: var(--meta-foreground);
}

.meta {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px;
  color: var(--meta-foreground);
}
.save kbd {
  font: inherit;
}

/* The mode toggle: the app's trough one step smaller (SPEC §4.1). */
/* The app's trough one size down; on ink it is a well, and the active tab a white pill. */
.trough {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--ink-well-border);
  border-radius: var(--radius-trough);
  background: var(--ink-well);
}
.mode {
  height: 22px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-tab);
  background: transparent;
  font-size: 12px;
  font-weight: 450;
  color: var(--ink-muted);
  transition: background-color 120ms ease-out, box-shadow 120ms ease-out, color 120ms ease-out;
}
.mode.on {
  background: var(--card);
  box-shadow: var(--shadow-pill);
  font-weight: 600;
  color: var(--ink);
}
/* Small bordered chip on ink: the `--ink-control` recipe (VISUAL-SPEC §2). */
.flip {
  height: 22px;
  width: 26px;
  border: 1px solid var(--ink-control-border);
  border-radius: var(--radius-button);
  background: var(--ink-control);
  font-size: 12px;
  color: var(--ink-control-fg);
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.flip:hover,
.flip.on {
  background: var(--ink-well);
  color: var(--ink-foreground);
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
