<!--
  The app's one button recipe: a 1px ghost by default — `primary` is the filled variant that
  exactly one button in the whole app may wear: Print (design invariant 1).
-->
<script setup lang="ts">
defineProps<{ primary?: boolean; disabled?: boolean }>()
</script>

<template>
  <button type="button" :disabled class="btn" :class="{ primary }">
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: var(--btn-h, 25px); padding: 0 10px; flex: none;
  border: 1px solid var(--field-border); border-radius: var(--radius-control);
  background: var(--pane); font-family: var(--font-sans); font-size: 12px; color: var(--foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.btn:hover:not(:disabled) { background: var(--row-hover); }
.btn:disabled { opacity: 0.4; }
.primary { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); }
.primary:hover:not(:disabled) { background: var(--primary); }
/* Disabled keeps the fill at 38%, never a grey ghost (F1). */
.primary:disabled { opacity: 0.38; }
</style>
