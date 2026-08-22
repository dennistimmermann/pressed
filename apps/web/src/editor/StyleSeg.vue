<!--
  A segmented control of the STYLE grid (DESIGN "Field anatomy"): the shared trough (`ui/Seg`)
  in a labelled row, with the pane's diagnostics under it. Dumb on purpose — the pane says which
  segments are `on` (written here) and which are `muted` (in effect from elsewhere — another
  rule, the base stylesheet or the browser default; mostly not CSS inheritance), and
  decides what a click writes, so B/I/U toggles use the same control as a radio.
-->
<script lang="ts">
export type { Segment } from '@/ui'
</script>

<script setup lang="ts">
import { computed } from 'vue'
import type { Marker } from './editor-handle'
import Msgs from './Msgs.vue'
import { Labeled, Seg, type Segment } from '@/ui'
import { aria, hasError } from './inspector/markers'

const props = defineProps<{ id: string; label?: string; choices: Segment[]; markers?: Marker[] }>()
const emit = defineEmits<{ pick: [value: string] }>()

/** Where a muted segment comes from is worth saying, and a segment always has a tooltip. */
const choices = computed(() =>
  props.choices.map((c) => ({
    ...c,
    title: c.muted ? `${c.title ?? c.value} — in effect but not set in this rule · click to write it` : c.title ?? c.value,
  })),
)
</script>

<template>
  <Labeled :label="label" :class="{ bad: hasError(markers) }">
    <Seg :choices="choices" v-bind="aria(id, markers)" @pick="emit('pick', $event)" />
    <Msgs :id="id" :markers="markers" />
  </Labeled>
</template>

<style scoped>
.f.bad .seg { border-color: var(--destructive); }
</style>
