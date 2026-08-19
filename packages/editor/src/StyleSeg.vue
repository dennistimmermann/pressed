<!--
  A segmented control of the STYLE grid (DESIGN "Field anatomy"): a filled trough of 19px
  buttons, the chosen one on `--accent` with a 1px `--primary` ring. Dumb on purpose — the pane
  says which segments are `on` (written here) and which are `muted` (coming from the base
  stylesheet), and decides what a click writes, so B/I/U toggles use the same control as a radio.
-->
<script lang="ts">
/** One segment: what it writes, how it looks, and whether it is written here (`on`) or only
 *  comes from the base stylesheet (`muted`). */
export type Segment = { value: string; label?: string; icon?: string; title?: string; on?: boolean; muted?: boolean }
</script>

<script setup lang="ts">
import type { Marker } from './editor-handle'
import Msgs from './Msgs.vue'
import { aria, hasError } from './inspector/markers'

defineProps<{ id: string; label?: string; choices: Segment[]; markers?: Marker[] }>()
const emit = defineEmits<{ pick: [value: string] }>()
</script>

<template>
  <div class="f" :class="{ bad: hasError(markers) }">
    <span v-if="label" class="k">{{ label }}</span>
    <div class="seg" role="group" v-bind="aria(id, markers)">
      <button
        v-for="c in choices" :key="c.value" type="button" :aria-pressed="!!c.on"
        :title="c.muted ? `${c.title ?? c.value} — from the base stylesheet` : c.title ?? c.value"
        :class="{ on: c.on, muted: c.muted }" @click="emit('pick', c.value)"
      >
        <svg v-if="c.icon" viewBox="0 0 16 16" aria-hidden="true" v-html="c.icon" />
        <template v-else>{{ c.label ?? c.value }}</template>
      </button>
    </div>
    <Msgs :id="id" :markers="markers" />
  </div>
</template>

<style scoped>
.f { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.k { font-family: var(--font-sans); font-size: 9px; font-weight: 450; color: var(--muted-foreground-2); }
.seg {
  display: flex; height: 25px; padding: 2px; gap: 2px; min-width: 0;
  border: 1px solid var(--field-border); border-radius: var(--radius-control); background: var(--field);
}
.seg button {
  display: flex; align-items: center; justify-content: center; flex: 1; min-width: 24px; height: 19px;
  padding: 0 5px; border: 0; border-radius: var(--radius-badge); background: transparent;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--muted-foreground);
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.seg button:hover { color: var(--foreground); }
/* Written here: accent plus the 1px ring. Coming from the base stylesheet: quiet, no ring. */
.seg button.on { background: var(--accent); color: var(--accent-foreground); box-shadow: inset 0 0 0 1px var(--primary); }
.seg button.muted { color: var(--inherited-foreground); background: var(--pane); }
.seg svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.f.bad .seg { border-color: var(--destructive); }
</style>
