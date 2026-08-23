<!--
  A fully collapsed side pane (Components board, F8): 28px of vertical eyebrow, and the canvas
  next to it takes the width back. Collapsing always buys space — a pane that keeps its 300px
  while showing nothing is the thing this replaces.

  Clicking a title reopens that section, which is what puts the pane back at its persisted width.
-->
<script setup lang="ts">
defineProps<{ titles: string[] }>()
defineEmits<{ expand: [title: string] }>()
</script>

<template>
  <div class="rail">
    <button
      v-for="t in titles" :key="t" type="button" class="t" :title="`expand ${t}`"
      @click="$emit('expand', t)"
    >{{ t }}</button>
  </div>
</template>

<style scoped>
.rail {
  display: flex; flex: none; flex-direction: column; align-items: center; gap: 12px;
  width: var(--w-rail); padding-top: 10px; overflow: hidden; background: var(--pane);
}
.t {
  writing-mode: vertical-rl; border: 0; background: transparent; padding: 0;
  font-family: var(--font-sans); font-size: var(--t1); font-weight: 600; letter-spacing: 0.07em;
  text-transform: uppercase; color: var(--muted-foreground-2);
  transition: color 120ms ease-out;
}
.t:hover { color: var(--foreground); }
</style>
