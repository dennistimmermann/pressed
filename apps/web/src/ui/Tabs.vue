<!--
  The established tab container (BlockTabs' trough recipe): a filled well, one pill per tab,
  the active one lifted onto the pane surface. Generic — labels and optional mono counts.
-->
<script setup lang="ts" generic="T extends string">
defineProps<{ tabs: { id: T; label: string; count?: string | number }[] }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <nav class="trough">
    <button
      v-for="t in tabs" :key="t.id" type="button" class="tab" :class="{ on: model === t.id }"
      @click="model = t.id"
    >
      <span class="label">{{ t.label }}</span>
      <span v-if="t.count !== undefined" class="count">{{ t.count }}</span>
    </button>
  </nav>
</template>

<style scoped>
.trough {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--field-border);
  border-radius: var(--radius-trough);
  background: var(--field);
  white-space: nowrap;
  width: fit-content;
}
.tab {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  padding: 6px 11px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  transition: background-color 120ms ease-out;
}
.label {
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 12px;
  font-weight: 450;
  color: var(--muted-foreground);
}
.tab.on {
  background: var(--pane);
  box-shadow: var(--shadow-pill);
}
.tab.on .label {
  font-weight: 600;
  color: var(--foreground);
}
.count {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px;
  font-weight: 500;
  color: var(--meta-foreground);
}
</style>
