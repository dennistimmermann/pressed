<!--
  The 42px scope row (SPEC §4.1 "Scope trough"): one trough holding the file tab, a hairline +
  `SNIPPETS` eyebrow, one tab per snippet and `+`. The scope actions live at its right and only
  exist while a snippet scope is active. Label-agnostic: the host names its own root (`leaveLabel`).
-->
<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue'
import { tabKey, type Badge, type TabsModel } from './tabs'

const props = withDefaults(
  defineProps<{
    model: TabsModel
    /** Active snippet, or `null` for the file itself. */
    scope: string | null
    /** The one file this editor edits — mono, with the dirty dot. */
    file: string
    dirty?: boolean
    /** Worst message per tab, keyed by `tabKey`; a tab sums its own blocks. */
    badges?: Record<string, Badge>
    /** What `⌥⇧←` goes back to, in the host's own word (`label`). */
    leaveLabel?: string
  }>(),
  { dirty: false, badges: () => ({}), leaveLabel: '' },
)

const emit = defineEmits<{
  'leave-scope': []
  'enter-scope': [name: string]
  add: []
  rename: [name: string]
  promote: [name: string]
  delete: [name: string]
}>()

/** A tab stands for a whole scope: worst level, summed counts. */
function badgeOf(scope: string | null): Badge | undefined {
  const blocks = scope === null ? props.model.blocks : props.model.snippets.find((s) => s.name === scope)?.blocks ?? []
  const parts = blocks.map((b) => props.badges[tabKey({ scope, kind: b.kind })]).filter((x): x is Badge => !!x)
  if (!parts.length) return undefined
  return {
    level: parts.some((p) => p.level === 'error') ? 'error' : 'warning',
    count: parts.reduce((n, p) => n + p.count, 0),
  }
}

// ---------------------------------------------------------------- inline rename

const renaming = ref(false)
const renameText = ref('')
// Inside `v-for`, Vue collects refs into an array even when only one of them ever renders.
const renameInput = useTemplateRef<HTMLInputElement | HTMLInputElement[]>('renameInput')

function startRename() {
  renaming.value = true
  renameText.value = props.scope ?? ''
  void nextTick(() => {
    const el = renameInput.value
    ;(Array.isArray(el) ? el[0] : el)?.select()
  })
}

function commitRename() {
  const name = renameText.value.trim()
  if (!renaming.value) return
  renaming.value = false
  if (name && name !== props.scope) emit('rename', name)
}
</script>

<template>
  <div class="row">
    <div class="trough" role="tablist" aria-label="Scope">
      <button
        type="button" role="tab" class="tab file" :class="{ on: scope === null }" :aria-selected="scope === null"
        @click="emit('leave-scope')"
      >
        <span class="label">{{ file }}</span>
        <span v-if="dirty" class="dot" aria-label="unsaved changes" />
        <span v-if="badgeOf(null)" class="badge" :class="badgeOf(null)!.level">● {{ badgeOf(null)!.count }}</span>
      </button>

      <span class="hairline" aria-hidden="true" />
      <span class="eyebrow">Snippets</span>

      <template v-for="s in model.snippets" :key="s.name">
        <input
          v-if="renaming && s.name === scope"
          ref="renameInput"
          v-model="renameText"
          class="rename"
          aria-label="Snippet name"
          @keydown.enter="commitRename"
          @keydown.esc="renaming = false"
          @blur="commitRename"
        >
        <button
          v-else type="button" role="tab" class="tab" :class="{ on: s.name === scope }" :aria-selected="s.name === scope"
          @click="emit('enter-scope', s.name)"
        >
          <span class="label">{{ s.name }}</span>
          <span v-if="badgeOf(s.name)" class="badge" :class="badgeOf(s.name)!.level">● {{ badgeOf(s.name)!.count }}</span>
        </button>
      </template>

      <button type="button" class="tab plus" aria-label="Add snippet" @click="emit('add')">+</button>
    </div>

    <span class="grow" />

    <!-- Scope actions: only here, and only while a snippet scope is active (SPEC §6). -->
    <template v-if="scope">
      <button type="button" class="text" @click="startRename">Rename</button>
      <button type="button" class="text" @click="emit('promote', scope)">Promote to library</button>
      <button type="button" class="text danger" @click="emit('delete', scope)">Delete</button>
      <button type="button" class="text back" @click="emit('leave-scope')">
        <span class="key">⌥⇧←</span> {{ leaveLabel }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 42px;
  padding: 0 12px;
  border-bottom: 1px solid var(--scope-border);
  /* Level 1 (VISUAL-SPEC §2): lighter than the ink rows above, darker than the cards below —
     the only row where the surface rises as you go down. Do not darken it. */
  background: var(--scope);
  white-space: nowrap;
}
.row > * {
  flex: none;
}
.grow {
  flex: 1 1 auto;
}

/* One trough, one shape (SPEC §4.1). */
.trough {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  padding: 3px;
  border: 1px solid var(--scope-well-border);
  border-radius: var(--radius-trough);
  background: var(--scope-well);
  overflow-x: auto;
  scrollbar-width: none;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 6px 11px;
  border: 0;
  border-radius: var(--radius-tab);
  background: transparent;
  cursor: pointer;
  transition: background-color 120ms ease-out, box-shadow 120ms ease-out, color 120ms ease-out;
}
/* A file name and a snippet name are both machine text: mono, always. */
.tab .label {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  font-weight: 450;
  color: var(--muted-foreground);
}
.tab.on {
  background: var(--card);
  box-shadow: var(--shadow-pill);
}
.tab.on .label {
  font-weight: 600;
  color: var(--foreground);
}
/* An active snippet says "you are inside something": accent text (SPEC §4.1). */
.tab.on:not(.file) .label {
  color: var(--accent-foreground);
}
.tab.plus {
  width: 24px;
  padding: 0;
  justify-content: center;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  color: var(--muted-foreground);
}
.tab.plus:hover {
  background: var(--card);
  color: var(--foreground);
}
.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--primary);
}

.hairline {
  width: 1px;
  height: 16px;
  margin: 0 5px;
  background: var(--scope-border);
}
.eyebrow {
  padding-right: 3px;
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--muted-foreground-2);
}

.badge {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  font-weight: 600;
}
.badge.error {
  color: var(--destructive);
}
.badge.warning {
  color: var(--warning);
}

.rename {
  height: 26px;
  width: 12ch;
  padding: 0 9px;
  border: 1px solid var(--primary);
  border-radius: var(--radius-tab);
  background: var(--card);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  outline: none;
}
.rename:focus-visible {
  outline: none;
}

.text {
  border: 0;
  background: none;
  padding: 0;
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 11px;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: color 120ms ease-out;
}
.text:hover {
  color: var(--foreground);
}
.text.danger {
  color: var(--destructive);
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--meta-foreground);
}
.back .key {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  color: var(--meta-foreground);
}
</style>
