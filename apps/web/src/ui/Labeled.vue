<!--
  The row every settings pane is made of (DESIGN "STYLE section"): a 9px label over its
  control, full width. `cells` puts the controls in the 2-up grid the four-sided widgets use —
  column 1 is top/bottom, column 2 is left/right.
-->
<script setup lang="ts">
defineProps<{
  label?: string
  /** Lay the body out as the 2×2 grid instead of stacking it. */
  cells?: boolean
}>()
</script>

<template>
  <div class="f">
    <div v-if="label || $slots.aside" class="hdr">
      <span class="k">{{ label }}</span>
      <!-- Right of the label: an arity toggle, a `more` action. -->
      <slot name="aside" />
    </div>
    <div v-if="cells" class="cells"><slot /></div>
    <slot v-else />
  </div>
</template>

<style scoped>
.f { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.hdr { display: flex; align-items: center; gap: 6px; min-width: 0; }
.k {
  flex: 1; min-width: 0;
  font-family: var(--font-sans); font-size: 9px; font-weight: 450; color: var(--muted-foreground-2);
}
.cells { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; min-width: 0; }
</style>
