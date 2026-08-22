<!--
  The diagnostics of one field, printed under its control — the message the editor otherwise
  only shows on hover. Every pane that owns a range renders this one list.
-->
<script setup lang="ts">
import type { Marker } from './editor-handle'

defineProps<{ markers?: Marker[]; id?: string }>()
</script>

<template>
  <div v-if="markers?.length" :id="id" class="msgs">
    <p v-for="(m, i) in markers" :key="i" class="msg" :class="m.severity">{{ m.message }}</p>
  </div>
</template>

<style scoped>
.msgs { display: flex; flex-direction: column; gap: 2px; }
.msg { margin: 0; font-family: var(--font-sans); font-size: 10px; line-height: 1.35; color: var(--warning-foreground); }
.msg.error { color: var(--destructive); }
</style>
