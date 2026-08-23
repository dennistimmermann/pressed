<!--
  The one popover shape (Components board). Everything that floats in this app is a Menu or the
  Picker built on it: 26px items, radius 10, one shadow, no tail, placed by `anchorMenu` —
  6px below the trigger, flipped above when short of room, clamped into the viewport.

  Teleported to `<body>`: a pane scrolls and clips, and no `z-index` frees an absolutely
  positioned child from an ancestor's `overflow`. The backdrop comes with it, so no consumer
  writes one again.

  Items are data. Destructive comes last, after the one divider — the board's rule, enforced
  here rather than remembered at seven call sites.
-->
<script lang="ts">
export type MenuItem = {
  /** What `pick` reports. Defaults to `label`. */
  value?: string
  label: string
  /** Right-aligned: a shortcut, a submenu chevron, a count. Mono. */
  hint?: string
  disabled?: boolean
  /** Red, and pushed below the divider whatever order it arrives in. */
  destructive?: boolean
  /** Machine's word for a thing (a tag, a selector): mono label. */
  mono?: boolean
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { anchorMenu } from './anchor'

const props = withDefaults(
  defineProps<{
    /** The trigger's rect. `null` closes the menu — one prop is the whole open/closed state. */
    anchor: DOMRect | null
    items?: MenuItem[]
    width?: number
    align?: 'left' | 'right'
    /** Estimated height for the flip decision; menus size to content. */
    height?: number
    /**
     * Where the menu lands. `<body>` for everything on the page — but a modal `<dialog>` is in
     * the browser's top layer and makes the rest of the document inert, so a menu raised from
     * inside one has to be teleported *into* it or it is drawn under the dialog and dead to
     * the mouse. Hosts that are a dialog pass their element.
     */
    to?: string | HTMLElement | null
  }>(),
  { items: () => [], width: 220, align: 'left', height: 320 },
)

const emit = defineEmits<{ pick: [value: string, event: MouseEvent]; close: [] }>()

const pos = computed(() =>
  props.anchor ? anchorMenu(props.anchor, props.width, { align: props.align, height: props.height }) : {},
)
/** Destructive last, after the divider — never interleaved. */
const plain = computed(() => props.items.filter((i) => !i.destructive))
const destructive = computed(() => props.items.filter((i) => i.destructive))
</script>

<template>
  <Teleport :to="to ?? 'body'">
    <template v-if="anchor">
      <span class="backdrop" @click="emit('close')" @contextmenu.prevent="emit('close')" />
      <div
        class="menu" role="menu" :style="{ ...pos, width: `${width}px` }"
        @keydown.escape="emit('close')"
      >
        <slot name="top" />
        <button
          v-for="item in plain" :key="item.value ?? item.label" type="button" role="menuitem"
          class="mi" :class="{ mono: item.mono }" :disabled="item.disabled"
          @click="emit('pick', item.value ?? item.label, $event)"
        >
          <span class="l">{{ item.label }}</span>
          <span v-if="item.hint" class="h">{{ item.hint }}</span>
        </button>
        <slot />
        <template v-if="destructive.length">
          <div class="div" />
          <button
            v-for="item in destructive" :key="item.value ?? item.label" type="button" role="menuitem"
            class="mi destr" :disabled="item.disabled" @click="emit('pick', item.value ?? item.label, $event)"
          >
            <span class="l">{{ item.label }}</span>
          </button>
        </template>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 59; }
.menu {
  position: fixed; z-index: 60; max-height: min(420px, 80vh); overflow-y: auto; padding: 4px;
  border: 1px solid var(--field-border); border-radius: var(--radius-trough); background: var(--popover);
  box-shadow: var(--shadow-popover);
}
.mi {
  display: flex; align-items: center; gap: 8px; width: 100%; min-height: 26px; padding: 0 9px;
  border: 0; border-radius: 5px; background: transparent; text-align: left;
  font-family: var(--font-sans); font-size: var(--t3); color: var(--popover-foreground);
  transition: background-color 120ms ease-out;
}
.mi.mono { font-family: var(--font-mono); font-size: var(--t5); }
.mi:hover:not(:disabled) { background: var(--row-hover); }
.mi:disabled { color: #b9bec5; }
.mi .l { flex: 1; min-width: 0; }
.mi .h { flex: none; font-family: var(--font-mono); font-size: var(--t2); color: var(--meta-foreground); }
.mi.destr { color: var(--destructive); }
.div { height: 1px; margin: 4px 6px; background: var(--hairline); }
</style>
