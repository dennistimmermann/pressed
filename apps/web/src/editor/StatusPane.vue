<script setup lang="ts">
import { computed, ref } from 'vue'
import { StatusBar, type StatusCell } from '@/ui'
import { isWarning, type Message } from './types'

/**
 * Compile / render / purity messages (design §3.6). Errors are inline, never toasts and
 * never modal (CLAUDE.md invariant 5) — and clicking a row jumps the caret.
 */
const props = withDefaults(
  defineProps<{
    messages: Message[]
    /** Shown as the `compile` ok row when nothing failed, e.g. `compiled · 2 snippets`. */
    okSummary?: string
    /** The strip's labelled facts (F9). The host knows them; this pane only counts messages. */
    facts?: StatusCell[]
    /** Display name for messages whose `file` is `main`. */
    filename?: string
    /** One neutral row that is neither error nor warning (E10: `no data connected …`). */
    info?: string
  }>(),
  { okSummary: '', filename: 'main', info: '', facts: () => [] },
)

defineEmits<{ jump: [where: { file: string; line?: number; col?: number }] }>()

const hasError = computed(() => props.messages.some((m) => !isWarning(m)))
const errors = computed(() => props.messages.filter((m) => !isWarning(m)).length)
const warnings = computed(() => props.messages.filter(isWarning).length)

// A 30px strip that expands to the message list (SPEC §4.7); the parent caps how far.
const open = ref(false)

/** The severity eyebrow: an error, a named warning category, or plain info (F17). */
const tag = (m: Message) => m.kind.toLowerCase()

/** Labelled facts, split by dividers — never one running mono sentence (F9). Counters sit
    beside the summary they qualify and hide at zero. */
const cells = computed<StatusCell[]>(() => {
  // F17: the state word is the *live* one — `compiled` while an amber warning stands is the
  // strip contradicting its own right-hand side (atlas 29).
  const state: StatusCell = hasError.value
    ? { v: 'failed', tone: 'error' }
    : warnings.value
      ? { v: 'compiled with warnings', tone: 'warn' }
      : { v: 'compiled' }
  const out: StatusCell[] = [state, ...props.facts]
  if (errors.value) out.push({ k: 'errors', v: String(errors.value), tone: 'error' })
  if (warnings.value) out.push({ k: 'warnings', v: String(warnings.value), tone: 'warn' })
  return out
})

/** `main` is the file the user sees; snippets name themselves the way the design writes them. */
function where(m: Message): string {
  const file = m.file === 'main' ? props.filename : m.file.replace(/^(snippet|library):(.*)$/, '$1 "$2"')
  const at = [m.line, m.col].filter((n) => n != null).join(':')
  const row = m.row != null ? ` · row ${m.row + 1}` : ''
  return `${file}${at ? ':' + at : ''}${row}`
}
</script>

<template>
  <StatusBar eyebrow="Status" :cells="cells" :open="open" @toggle="open = !open">
    <template #end>
      <span v-if="messages.length" :class="hasError ? 'sum error' : 'sum warning'">
        ● {{ messages.length }} message{{ messages.length === 1 ? '' : 's' }}
      </span>
      <span v-else class="sum ok">● no messages</span>
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
        <span class="sev">{{ tag(m) }}</span>
        <span class="text">{{ m.message }}</span>
        <!-- file:line:col, underlined, and it jumps the caret (invariant 5). -->
        <span class="loc">{{ where(m) }}</span>
      </button>

      <div v-if="info" class="row info">
        <span class="sev">info</span>
        <span class="text">{{ info }}</span>
      </div>

      <div v-if="!hasError && okSummary" class="row ok">
        <span class="sev">compile</span>
        <span class="text">{{ okSummary }}</span>
      </div>
    </template>
  </StatusBar>
</template>

<style scoped>
/* Chrome lives in ui/StatusBar; below is message-row styling only. */
.sum {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--t6);
}
.sum.error { color: var(--ink-destructive); }
.sum.warning { color: var(--ink-warning); }
.sum.ok { color: var(--ink-faint); }

/* Severity eyebrow · message · a right-aligned file:line:col that jumps the caret. */
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 26px;
  padding: 4px 10px;
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
.sev {
  flex: none;
  width: 54px;
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: var(--t2);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.text {
  min-width: 0;
  font-size: var(--t3);
  color: var(--ink-muted-2);
}
.loc {
  margin-left: auto;
  flex: none;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--t6);
  color: var(--ink-link);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Ink-safe state colours (design §3.6's table, in its ink register). */
.fault .sev {
  color: var(--ink-destructive);
}
.purity .sev {
  color: var(--ink-warning);
}
.ok .sev,
.info .sev {
  color: var(--ink-faint);
}
</style>
