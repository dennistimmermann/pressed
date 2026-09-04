<!--
  The one chip (Components board): two variants, and the border tells them apart.

  **status** — a borderless 22px pill with a state dot. It says something; it is never pressable,
  so it renders as a `<span>` and nothing hovers.
  **interactive** — the same pill with a 1px border, rendered as a `<button>`. Selected is
  `--accent` + a 1px inset `--primary` ring: THE selection recipe (invariant 1 — "filled" means
  solid `--primary`, and that is Print's alone).
-->
<script setup lang="ts">
defineProps<{
  /** A status chip's dot; omit for a chip that carries no state. */
  dot?: 'ok' | 'off' | 'warn' | 'error'
  /** Interactive: a 1px border and a button. Status chips leave this off. */
  interactive?: boolean
  /** Chosen here: accent + the inset ring. */
  on?: boolean
  /** Prose (a word, a label). Machine values — counts, paths, ids — stay mono (invariant 2). */
  sans?: boolean
  /** Sitting on the canvas, whose ground is `--field`: take `--pane` so the pill is visible. */
  floating?: boolean
}>()
</script>

<template>
  <component
    :is="interactive ? 'button' : 'span'" :type="interactive ? 'button' : undefined"
    class="chip" :class="{ act: interactive, on, sans, floating }"
  >
    <span v-if="dot" class="d" :class="dot" aria-hidden="true">●</span>
    <slot />
  </component>
</template>

<style scoped>
.chip {
  display: inline-flex; align-items: center; gap: 5px; flex: none;
  height: 22px; padding: 0 8px; border: 1px solid transparent; border-radius: 11px;
  background: var(--field); font-family: var(--font-mono); font-size: var(--t6); line-height: 1;
  color: var(--muted-foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out;
}
.chip.sans { font-family: var(--font-sans); font-size: var(--t3); font-weight: 450; }
/* Pressable: an edge and a surface of its own, so it never reads as a status pill. */
.chip.act {
  padding: 0 9px; border-color: var(--field-border); background: var(--pane); color: var(--foreground);
}
.chip.act:hover { background: var(--row-hover); }
/* Active: accent wash, no ring. The ring follows focus — the last-clicked chip. */
.chip.on, .chip.act.on:hover {
  background: var(--accent); color: var(--accent-foreground);
}
.chip.act:focus { outline: none; box-shadow: inset 0 0 0 1px var(--muted-foreground); }
.chip.act.on:focus { box-shadow: inset 0 0 0 1px var(--primary); }
.chip.floating:not(.act) { background: var(--pane); }
.d { font-size: 8px; color: var(--faint-foreground); }
.d.ok { color: var(--ok); }
.d.warn { color: var(--warning); }
.d.error { color: var(--destructive); }
</style>
