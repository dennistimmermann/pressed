<!--
  The ink foot of a view (MIGRATION §3): a flush 30px strip — eyebrow, a mono summary, and a
  right-aligned end slot. Given an #expanded slot the strip is a button and the host caps how
  far the expansion may grow (`max-h-*` on this root). The host adds `.on-ink`.
-->
<script setup lang="ts">
defineProps<{ eyebrow: string; open?: boolean }>()
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
      <span class="origin"><slot /></span>
      <span class="end"><slot name="end" /></span>
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
  gap: 10px;
  flex: none;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  text-align: left;
}
.eyebrow {
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--ink-muted);
}
.origin {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  color: var(--muted-foreground);
}
.end {
  display: flex;
  gap: 8px;
  margin-left: auto;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  color: var(--muted-foreground);
  white-space: nowrap;
}
/* The expanded list keeps the ink surface; content styling is the consumer's. */
.rows {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  border-top: 1px solid var(--ink-border-2);
}
</style>
