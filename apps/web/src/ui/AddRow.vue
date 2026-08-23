<!--
  The one add grammar (Components board, F18): a dashed `+ noun` at the foot of the list it
  extends. The text-link `+ attribute`, the header `+` and the `+ Insert element` button are all
  this control now — there is no second way to add a thing.

  25px like every other control; full width at a list's foot, `inline` when it sits in a row of
  chips or tabs.
-->
<script setup lang="ts">
defineProps<{ noun: string; inline?: boolean; title?: string }>()
</script>

<template>
  <button type="button" class="add" :class="{ inline }" :title="title">+ {{ noun }}</button>
</template>

<style scoped>
.add {
  display: flex; align-items: center; justify-content: center; width: 100%; height: var(--h-control);
  padding: 0 12px; border: 1px dashed var(--dashed); border-radius: var(--radius-control);
  background: transparent; font-family: var(--font-sans); font-size: var(--t5); color: var(--accent-link);
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.add.inline { width: auto; flex: none; }
.add:hover { border-color: var(--accent-link); background: var(--accent); }
</style>
