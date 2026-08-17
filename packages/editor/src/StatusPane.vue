<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from './types'

/**
 * Compile / render / purity messages (design §3.6). Errors are inline, never toasts and
 * never modal (CLAUDE.md invariant 5) — and clicking a row jumps the caret.
 */
const props = withDefaults(
  defineProps<{
    messages: Message[]
    /** Shown as the `COMPILE` ok row when nothing failed, e.g. `compiled · 2 snippets · 34 ms`. */
    okSummary?: string
    /** Display name for messages whose `file` is `main`. */
    filename?: string
  }>(),
  { okSummary: '', filename: 'main' },
)

defineEmits<{ jump: [where: { file: string; line?: number; col?: number }] }>()

const hasError = computed(() => props.messages.some((m) => m.kind !== 'purity'))

const tag = (m: Message) => m.kind.toUpperCase()

/** `main` is the file the user sees; snippets name themselves the way the design writes them. */
function where(m: Message): string {
  const file = m.file === 'main' ? props.filename : m.file.replace(/^(snippet|library):(.*)$/, '$1 "$2"')
  const at = [m.line, m.col].filter((n) => n != null).join(':')
  const row = m.row != null ? ` · row ${m.row + 1}` : ''
  return `${file}${at ? ':' + at : ''}${row}`
}
</script>

<template>
  <section class="pane">
    <header class="head">
      <span class="eyebrow">Status</span>
      <span class="origin">runtime frame · null origin</span>
    </header>

    <div class="rows" role="log" aria-live="polite">
      <button
        v-for="(m, i) in messages"
        :key="i"
        type="button"
        class="row"
        :class="m.kind === 'purity' ? 'purity' : 'fault'"
        @click="$emit('jump', { file: m.file, line: m.line, col: m.col })"
      >
        <span class="tag">{{ tag(m) }}</span>
        <span class="text">{{ m.message }}</span>
        <span class="loc">{{ where(m) }}</span>
      </button>

      <div v-if="!hasError && okSummary" class="row ok">
        <span class="tag">COMPILE</span>
        <span class="loc">{{ okSummary }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
}
.eyebrow {
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.origin {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  color: var(--muted-foreground);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  overflow: auto;
}

.row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
  padding: 6px 8px;
  border-radius: 6px;
  text-align: left;
  border: none;
  transition: background-color 120ms ease-out;
}
button.row:hover {
  filter: brightness(0.98);
}
.tag {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-weight: 600;
  font-size: 9.5px;
  letter-spacing: 0.04em;
  padding-top: 1px;
}
.text {
  font-size: 11px;
  color: var(--foreground);
}
.loc {
  grid-column: 2;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  color: var(--muted-foreground);
}

/* Colours are design §3.6's table; they are label-agnostic literals, not app tokens. */
.fault {
  background: oklch(0.975 0.015 25);
}
.fault .tag {
  color: oklch(0.5 0.17 25);
}
.purity {
  background: oklch(0.98 0.02 85);
}
.purity .tag {
  color: oklch(0.52 0.1 75);
}
.ok {
  background: oklch(0.975 0.008 150);
}
.ok .tag {
  color: oklch(0.45 0.08 150);
}

:global(.dark) .fault {
  background: oklch(0.27 0.04 25);
}
:global(.dark) .fault .tag {
  color: oklch(0.75 0.15 25);
}
:global(.dark) .purity {
  background: oklch(0.28 0.03 85);
}
:global(.dark) .purity .tag {
  color: oklch(0.82 0.09 75);
}
:global(.dark) .ok {
  background: oklch(0.26 0.03 150);
}
:global(.dark) .ok .tag {
  color: oklch(0.75 0.1 150);
}
</style>
