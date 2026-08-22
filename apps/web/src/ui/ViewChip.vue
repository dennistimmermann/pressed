<!--
  The 22px chip a view wears in its own corner (SPEC §4.5, and the Data view's Table/Mapping
  tabs): a rounded pill that is quiet until it is the one in force — then `--accent` with a 1px
  `--primary` border, never a fill (invariant 1).

  Dumb: the host says which one is `on`. `bordered` is the floating variant — a chip over the
  canvas needs its own edge, one sitting in a toolbar does not.
-->
<script setup lang="ts">
defineProps<{
  /** Chosen here: accent plus the ring. */
  on?: boolean
  /** Says something rather than does something (a count, a state): no hover, quiet ink. */
  muted?: boolean
  /** Anything the machine owns — counts, paths, row numbers (invariant 2). */
  mono?: boolean
  /** Floating over the canvas: give it an edge and a surface of its own. */
  bordered?: boolean
  /** Render as a `<span>`: a chip that only reports. */
  static?: boolean
}>()
</script>

<template>
  <component
    :is="static ? 'span' : 'button'" :type="static ? undefined : 'button'"
    class="chip" :class="{ on, muted, mono, bordered }"
  >
    <slot />
  </component>
</template>

<style scoped>
.chip {
  display: inline-flex; align-items: center; gap: 4px; flex: none;
  height: 22px; padding: 0 9px;
  border: 1px solid transparent; border-radius: var(--radius-control); background: transparent;
  font-family: var(--font-sans); font-size: 10px; font-weight: 450; line-height: 1;
  color: var(--muted-foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out;
}
.chip.mono { font-family: var(--font-mono); font-size: 10.5px; }
.chip.bordered { border-color: var(--field-border); background: var(--pane); }
button.chip:hover { background: var(--field); color: var(--foreground); }
/* Selection is --accent plus its border, never a fill (invariant 1). */
.chip.on, button.chip.on:hover { background: var(--accent); border-color: var(--primary); color: var(--accent-foreground); }
.chip.muted { color: var(--muted-foreground); }
</style>
