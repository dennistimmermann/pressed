<!--
  One collapsible section of a settings pane (DESIGN "Inspector"): a sticky 34px header —
  eyebrow left, mono meta right, chevron — over a body that takes its natural height (pass
  `fill` for an equal share of the leftover space, the Layers-style stretch) —
  left of the pane.

  The header and the body are *siblings*, never nested: only then can every header stick twice,
  under the `index` headers above it and over the `below` ones under it, while the one scroller
  moves behind them. So this component has two roots, and the host owns the section order.
  Collapse is a prop, not state — the host knows what to persist.
-->
<script setup lang="ts">
import { computed, nextTick, useTemplateRef } from 'vue'

const props = defineProps<{
  /** The eyebrow. */
  title: string
  /** Where this header sits in the two sticky stacks — headers above it, headers below it. */
  index: number
  below: number
  collapsed?: boolean
  /** Hairline over the header; off for the first section of a pane. */
  hairline?: boolean
  /** Right-aligned mono meta. The `meta` slot adds to it (a marker dot, a coloured count). */
  meta?: string | number
  /** Layout for the body (gap, wrap). Utilities only — a scoped class cannot reach in here. */
  bodyClass?: string
  /** Stretch: the body takes an equal share of the pane's leftover height instead of its own. */
  fill?: boolean
}>()
const emit = defineEmits<{ toggle: [] }>()

const vars = computed(() => ({ '--i': props.index, '--below': props.below }))

const body = useTemplateRef<HTMLElement>('body')
/** Toggling a section scrolls it into view; `scroll-margin` keeps it clear of the two stacks. */
function toggle() {
  emit('toggle')
  void nextTick(() => body.value?.scrollIntoView({ block: 'nearest' }))
}
</script>

<template>
  <button type="button" class="head" :class="{ hair: hairline }" :style="vars" @click="toggle">
    <span class="eyebrow">{{ title }}</span>
    <span v-if="meta != null" class="meta">{{ meta }}</span>
    <slot name="meta" />
    <span class="chev">{{ collapsed ? '▸' : '▾' }}</span>
  </button>
  <div v-if="!collapsed" ref="body" class="body" :class="[bodyClass, fill && 'fill']" :style="vars">
    <slot />
  </div>
</template>

<style scoped>
.head {
  display: flex; align-items: center; gap: 8px; width: 100%; flex: none;
  height: 34px; padding: 10px 12px 8px; background: var(--pane); border: 0;
  position: sticky; top: calc(var(--i, 0) * 34px); bottom: calc(var(--below, 0) * 34px); z-index: 2;
}
.head.hair { border-top: 1px solid var(--section-border); }
.eyebrow {
  flex: 1; text-align: left;
  font-family: var(--font-sans); font-size: 10px; font-weight: 600; letter-spacing: 0.07em;
  text-transform: uppercase; color: var(--muted-foreground-2);
}
.meta { font-family: var(--font-mono); font-size: 10px; font-weight: 450; color: var(--meta-foreground); }
.chev { flex: none; font-size: 8px; color: var(--muted-foreground); }
/* Natural height by default; `fill` adds an equal share of what is left (shrink 0: the pane
   scrolls, not the section). */
.body {
  display: flex; flex-direction: column; flex: none; padding: 0 12px 11px;
}
.body.fill {
  flex: 1 0 auto;
  scroll-margin-top: calc(var(--i, 0) * 34px + 34px);
  scroll-margin-bottom: calc(var(--below, 0) * 34px);
}
</style>
