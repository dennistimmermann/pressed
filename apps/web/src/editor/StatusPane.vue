<script setup lang="ts">
import { computed, ref } from 'vue'
import { StatusBar } from '@/ui'
import { isWarning, type Message } from './types'

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
    /** One neutral row that is neither error nor warning (E10: `no data connected …`). */
    info?: string
  }>(),
  { okSummary: '', filename: 'main', info: '' },
)

defineEmits<{ jump: [where: { file: string; line?: number; col?: number }] }>()

const hasError = computed(() => props.messages.some((m) => !isWarning(m)))
const errors = computed(() => props.messages.filter((m) => !isWarning(m)).length)
const warnings = computed(() => props.messages.filter(isWarning).length)

// A 30px strip that expands to the message list (SPEC §4.7); the parent caps how far.
const open = ref(false)

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
  <StatusBar eyebrow="Status" :open="open" @toggle="open = !open">
    {{ hasError ? `${messages.length} message${messages.length === 1 ? '' : 's'}` : okSummary || 'runtime frame · null origin' }}
    <template #end>
      <span class="count error">● {{ errors }}</span>
      <span class="count warning">● {{ warnings }}</span>
    </template>
    <template #expanded>
      <button
        v-for="(m, i) in messages"
        :key="i"
        type="button"
        class="row"
        :class="isWarning(m) ? 'purity' : 'fault'"
        @click="$emit('jump', { file: m.file, line: m.line, col: m.col })"
      >
        <span class="tag">{{ tag(m) }}</span>
        <span class="text">{{ m.message }}</span>
        <span class="loc">{{ where(m) }}</span>
      </button>

      <div v-if="info" class="row info">
        <span class="tag">INFO</span>
        <span class="text">{{ info }}</span>
      </div>

      <div v-if="!hasError && okSummary" class="row ok">
        <span class="tag">COMPILE</span>
        <span class="loc">{{ okSummary }}</span>
      </div>
    </template>
  </StatusBar>
</template>

<style scoped>
/* Chrome lives in ui/StatusBar; below is message-row styling only. */
.count {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px;
}
.count.error {
  color: var(--destructive);
}
.count.warning {
  color: var(--warning);
}

.row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
  padding: 6px 10px;
  border: 0;
  border-bottom: 1px solid var(--ink-divider);
  background: transparent;
  text-align: left;
  transition: background-color 120ms ease-out;
}
.row:last-child {
  border-bottom: 0;
}
button.row:hover {
  background: var(--ink-2);
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
  color: var(--ink-foreground);
}
.loc {
  grid-column: 2;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  color: var(--meta-foreground);
}

/* Ink-safe state colours (design §3.6's table, in its ink register). */
.fault .tag {
  color: var(--ink-destructive);
}
.purity .tag {
  color: var(--ink-warning);
}
.ok .tag,
.info .tag {
  color: var(--ink-muted-2);
}
</style>
