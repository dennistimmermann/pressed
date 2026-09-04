<!--
  A segmented control (DESIGN "Field anatomy"): a 25px filled trough of 19px buttons, the chosen
  one on `--accent` with a 1px `--primary` ring — never a solid fill (invariant 1).

  Dumb on purpose: the caller says which segments are `on` (chosen here) and which are `muted`
  (in force, but from somewhere else), and decides what a click means — so a B/I/U toggle and a
  radio are the same control.
-->
<script lang="ts">
/** One segment: what it writes, how it looks, and where its state comes from. */
export type Segment = {
  value: string
  label?: string
  /** The inside of a `box`×`box` `viewBox` — module constants, never user text. */
  icon?: string
  title?: string
  on?: boolean
  muted?: boolean
  disabled?: boolean
}
</script>

<script setup lang="ts">
// The icon grid: 16 for the design's line icons, 12 for the ones a Field shares (its icons are
// drawn on the 12px box). Thinner strokes on the smaller grid, so both read the same weight.
withDefaults(defineProps<{ choices: Segment[]; box?: number }>(), { box: 16 })
const emit = defineEmits<{ pick: [value: string] }>()
</script>

<template>
  <div class="seg" role="group">
    <button
      v-for="c in choices" :key="c.value" type="button" :aria-pressed="!!c.on"
      :disabled="c.disabled" :title="c.title" :class="{ on: c.on, muted: c.muted }"
      @click="emit('pick', c.value)"
    >
      <svg v-if="c.icon" :viewBox="`0 0 ${box} ${box}`" :stroke-width="box < 16 ? 1 : 1.5" aria-hidden="true" v-html="c.icon" />
      <template v-else>{{ c.label ?? c.value }}</template>
    </button>
  </div>
</template>

<style scoped>
.seg {
  /* One row, always: a group never collapses to two rows (it reads as broken). The caller
     gives a wide-enough row instead — a many-button group gets its own line (F19). */
  display: flex; flex-wrap: nowrap; height: var(--h-control); padding: 2px; gap: 2px; min-width: 0;
  border: 1px solid var(--field-border); border-radius: var(--radius-control); background: var(--field);
}
.seg button {
  display: flex; align-items: center; justify-content: center; flex: 1 0 auto; min-width: 24px; height: 19px;
  padding: 0 5px; border: 0; border-radius: var(--radius-badge); background: transparent;
  font-family: var(--font-mono); font-size: var(--t5); color: var(--muted-foreground);
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.seg button:hover:not(:disabled) { color: var(--foreground); }
.seg button:disabled { opacity: 0.4; }
/* The active value: accent wash, no ring. The ring follows focus — the last-clicked segment. */
.seg button.on { background: var(--accent); color: var(--accent-foreground); }
.seg button:focus { outline: none; box-shadow: inset 0 0 0 1px var(--muted-foreground); }
.seg button.on:focus { box-shadow: inset 0 0 0 1px var(--primary); }
.seg button.muted { color: var(--inherited-foreground); background: var(--pane); }
.seg svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-linecap: round; stroke-linejoin: round; }
</style>
