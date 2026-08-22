<!--
  The block-tab trough (SPEC §4.1 / §4.6): `Template N · Style N · Script`, plus `+` for a block
  this scope does not have yet. It lives in the editor pane header, so it brings no row of its
  own — which tab is active, and which scope's blocks it shows, is the host's business.
-->
<script setup lang="ts">
import { anchorMenu } from '@/ui'
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

// ---------------------------------------------------------------- add menu

const menuOpen = ref(false)
const menuPos = ref<Record<string, string>>({})
const toggleMenu = (e: MouseEvent) => {
  menuPos.value = anchorMenu((e.currentTarget as HTMLElement).getBoundingClientRect(), 240, { height: 160 })
  menuOpen.value = !menuOpen.value
}

/** Blocks that do not exist in this scope — the `+` tab offers exactly these. */
const addItems = computed(() => {
  const items: { kind: 'script' | 'style'; label: string; description: string }[] = []
  if (!blockOf(props.model, { scope: props.scope, kind: 'script' }))
    items.push({ kind: 'script', label: '+ script', description: '<script setup lang="ts">' })
  if (!blockOf(props.model, { scope: props.scope, kind: 'style' }))
    items.push({ kind: 'style', label: '+ style', description: '<style> block · rules for this scope' })
  return items
})

function pick(kind: 'script' | 'style') {
  menuOpen.value = false
  emit('add', kind)
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

    <span v-if="addItems.length" class="add-wrap">
      <button type="button" class="tab plus" :class="{ open: menuOpen }" aria-label="Add block" @click="toggleMenu($event)">+</button>
      <template v-if="menuOpen">
        <span class="backdrop" @click="menuOpen = false" />
        <div class="menu" :style="menuPos">
          <button v-for="item in addItems" :key="item.kind" type="button" class="menu-item" @click="pick(item.kind)">
            <span class="k">{{ item.label }}</span>
            <span class="d">{{ item.description }}</span>
          </button>
        </div>
      </template>
    </span>
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

.add-wrap {
  position: relative;
}
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 19;
}
.tab.plus {
  width: 24px;
  padding: 0;
  justify-content: center;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  color: var(--muted-foreground);
}
.tab.plus:hover,
.tab.plus.open {
  background: var(--pane);
  color: var(--foreground);
}
.menu {
  position: fixed;
  z-index: 20;
  width: 280px;
  padding: 5px;
  border: 1px solid var(--field-border);
  border-radius: var(--radius-trough);
  background: var(--popover);
  box-shadow: var(--shadow-popover);
  white-space: normal;
}
.menu-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 9px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease-out;
}
.menu-item:hover {
  background: var(--muted);
}
.menu-item .k {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  font-weight: 500;
  color: var(--foreground);
}
.menu-item .d {
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 10.5px;
  color: var(--muted-foreground);
}
</style>
