<!--
  What a pane says when it has nothing (Components board, F32): ONE sans sentence, verb-first, in
  the upper third of the void, plus at most one ghost action. No file paths, no storage names, no
  second phrasing for the same pane — a pane has one empty string, not two.
-->
<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <div class="empty">
    <p class="t">{{ text }}</p>
    <slot />
  </div>
</template>

<style scoped>
/* Upper third: the box takes the space, the words sit high in it. */
.empty {
  display: flex; flex: 1; flex-direction: column; align-items: center; gap: 8px;
  min-height: 0; padding: 18px 24px 6px; text-align: center;
}
.t { margin: 0; font-family: var(--font-sans); font-size: var(--t3); color: var(--muted-foreground); }
</style>
