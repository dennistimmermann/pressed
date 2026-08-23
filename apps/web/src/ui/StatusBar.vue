<!--
  The ink foot of a view (Components board, F9): a 30px strip of **labelled cells** split by 1px
  dividers — never one running mono sentence. A cell is a `k` (what the fact is) and a `v` (the
  fact); a cell with no `k` is a bare state word (`compiled`, `● connected`). Counters sit beside
  the summary they qualify and hide at zero, which is the caller's job.

  The right end is the view's equation — `10 × 2 = 20 labels` — with its results in bold: that
  slot is `#end`. Given an `#expanded` slot the strip is a button and the host caps how far the
  expansion may grow (`max-h-*` on this root). The host adds `.on-ink`.
-->
<script lang="ts">
export type StatusCell = {
  /** The label. Omit for a bare state word. */
  k?: string
  v: string
  tone?: 'ok' | 'warn' | 'error'
}
</script>

<script setup lang="ts">
withDefaults(defineProps<{ eyebrow: string; cells?: StatusCell[]; open?: boolean }>(), { cells: () => [] })
defineEmits<{ toggle: [] }>()
</script>

<template>
  <section class="pane">
    <component
      :is="$slots.expanded ? 'button' : 'div'" :type="$slots.expanded ? 'button' : undefined"
      class="head" :aria-expanded="$slots.expanded ? open : undefined"
      @click="$slots.expanded && $emit('toggle')"
    >
      <span class="eyebrow">{{ eyebrow }}</span>
      <template v-for="(c, i) in cells" :key="i">
        <span v-if="i" class="sep" aria-hidden="true" />
        <span class="cell">
          <span v-if="c.k" class="k">{{ c.k }}</span>
          <span class="v" :class="c.tone">{{ c.v }}</span>
        </span>
      </template>
      <span class="end"><slot name="end" /></span>
      <span v-if="$slots.expanded" class="chev" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
    </component>
    <div v-if="open" class="rows" role="log" aria-live="polite"><slot name="expanded" /></div>
  </section>
</template>

<style scoped>
.pane {
  display: flex;
  flex-direction: column;
  max-height: 100%;
  min-height: 0;
  border-top: 1px solid var(--ink-border-2);
  background: var(--ink);
}
.head {
  display: flex;
  align-items: center;
  flex: none;
  width: 100%;
  height: var(--h-bar);
  padding: 0 10px;
  border: 0;
  background: transparent;
  text-align: left;
}
.eyebrow {
  flex: none;
  margin-right: 10px;
  font-size: var(--t1);
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--ink-muted);
}
/* A fact and its label, never a sentence: `selected 10 / 10`. */
.cell {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--t6);
  white-space: nowrap;
}
.cell .k { flex: none; color: var(--ink-faint); }
.cell .v { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--ink-foreground); }
.cell .v.ok { color: var(--ok); }
.cell .v.warn { color: var(--ink-warning); }
.cell .v.error { color: var(--ink-destructive); }
.sep { flex: none; width: 1px; height: 12px; margin: 0 10px; background: var(--ink-divider); }
/* The equation: the results are the bold parts, the operators are not. */
.end {
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin-left: auto;
  padding-left: 10px;
  font-family: var(--font-mono);
  font-size: var(--t6);
  color: var(--ink-faint);
  white-space: nowrap;
}
.end :deep(b) { font-weight: 600; color: var(--ink-foreground); }
.chev { flex: none; margin-left: 10px; font-size: 8px; color: var(--ink-faint); }
/* The expanded list keeps the ink surface; content styling is the consumer's. */
.rows {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  border-top: 1px solid var(--ink-border-2);
}
</style>
