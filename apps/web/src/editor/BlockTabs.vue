<!--
  The block-tab trough (SPEC §4.1 / §4.6): `Template N · Style N · Script`, plus a dashed
  `+ block` for one this scope does not have yet. It lives in the editor pane header, so it brings no row of its
  own — which tab is active, and which scope's blocks it shows, is the host's business.
-->
<script setup lang="ts">
import { AddRow, Menu, type MenuItem } from '@/ui'
import { computed, ref } from 'vue'
import { blockOf, tabKey, type Badge, type BlockKind, type TabBlock, type TabRef, type TabsModel } from './tabs'

const props = withDefaults(
  defineProps<{
    model: TabsModel
    active: TabRef
    /** Snippet the trough is scoped to; `null` = the file itself. */
    scope: string | null
    /** Worst message per tab, keyed by `tabKey` — a count is replaced by its badge. */
    badges?: Record<string, Badge>
  }>(),
  { badges: () => ({}) },
)

const emit = defineEmits<{
  select: [tab: TabRef]
  add: [kind: 'script' | 'style']
}>()

const blocks = computed(() =>
  props.scope === null ? props.model.blocks : (props.model.snippets.find((s) => s.name === props.scope)?.blocks ?? []),
)

/** `8` elements / `7` rules; script carries no count. */
const countText = (b: TabBlock): string => (b.count === null ? '' : String(b.count))

const title = (kind: BlockKind) => kind[0].toUpperCase() + kind.slice(1)
const isActive = (tab: TabRef) => tabKey(tab) === tabKey(props.active)
const badgeOf = (tab: TabRef): Badge | undefined => props.badges[tabKey(tab)]

// ---------------------------------------------------------------- add block

const menuAnchor = ref<DOMRect | null>(null)
const toggleMenu = (e: MouseEvent) => {
  menuAnchor.value = menuAnchor.value ? null : (e.currentTarget as HTMLElement).getBoundingClientRect()
}

/** Blocks that do not exist in this scope — the dashed `+ block` offers exactly these. */
const addItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = []
  if (!blockOf(props.model, { scope: props.scope, kind: 'script' }))
    items.push({ value: 'script', label: 'script', hint: 'setup lang="ts"' })
  if (!blockOf(props.model, { scope: props.scope, kind: 'style' }))
    items.push({ value: 'style', label: 'style', hint: 'rules for this scope' })
  return items
})

function pick(kind: string) {
  menuAnchor.value = null
  emit('add', kind as 'script' | 'style')
}
</script>

<template>
  <div class="trough" role="tablist" aria-label="Blocks">
    <button
      v-for="b in blocks"
      :key="b.kind"
      type="button"
      role="tab"
      class="tab"
      :class="{ on: isActive({ scope, kind: b.kind }) }"
      :aria-selected="isActive({ scope, kind: b.kind })"
      @click="emit('select', { scope, kind: b.kind })"
    >
      <span class="label">{{ title(b.kind) }}</span>
      <!-- A message count replaces the element/rule count: what is wrong outranks how many. -->
      <span v-if="badgeOf({ scope, kind: b.kind })" class="badge" :class="badgeOf({ scope, kind: b.kind })!.level">
        ● {{ badgeOf({ scope, kind: b.kind })!.count }}
      </span>
      <span v-else-if="countText(b)" class="count">{{ countText(b) }}</span>
    </button>

    <!-- The one add grammar, as the board's dashed `+ block` chip (F18). -->
    <AddRow v-if="addItems.length" noun="block" inline class="ml-[2px]" @click="toggleMenu($event)" />
    <Menu :anchor="menuAnchor" :items="addItems" :width="240" @pick="pick" @close="menuAnchor = null" />
  </div>
</template>

<style scoped>
/* Segmented control, same vocabulary as the scope row and the view switcher (SPEC §4.1). */
.trough {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--field-border);
  border-radius: var(--radius-trough);
  background: var(--field);
  white-space: nowrap;
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
  cursor: pointer;
  transition: background-color 120ms ease-out, box-shadow 120ms ease-out;
}
.tab .label {
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
.tab .count {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px;
  font-weight: 500;
  color: var(--meta-foreground);
}
.badge {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  font-weight: 600;
}
.badge.error {
  color: var(--destructive);
}
.badge.warning {
  color: var(--warning);
}
</style>
